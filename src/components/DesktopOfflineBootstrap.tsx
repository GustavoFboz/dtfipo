import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  isDentalFlowDesktop,
  provisionDesktopIdentity,
  verifyDesktopLocalRuntime,
} from "@/lib/desktop-local";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";
import { verifyAndStoreDesktopSyncProof } from "@/lib/desktop-sync-proof";
import { fetchClinicContext } from "@/lib/clinic";
import {
  prepareDesktopRecovery,
  protectCriticalCachesFromEmptyRegression,
} from "@/lib/desktop-recovery";
import {
  DESKTOP_AUTH_TIMEOUT_MS,
  DESKTOP_READ_TIMEOUT_MS,
  withDesktopCloudTimeout,
} from "@/lib/desktop-cloud";

const RESUME_REFRESH_AFTER_MS = 3 * 60_000;
const RESUME_DEBOUNCE_MS = 650;
const RECENT_FULL_SYNC_GUARD_MS = 5_000;
const FULL_SYNC_TIMEOUT_MS = 65_000;

/**
 * Bootstrap resiliente do cliente instalado.
 *
 * Sincronização integral é reservada para boot, reconnect real, mudança de conta
 * e pedido manual. Voltar de alt-tab/sleep apenas revalida as consultas atualmente
 * visíveis. Isso evita reaquecer todos os read-models e reescrever SQLite no exato
 * momento em que o usuário volta a interagir com a interface.
 */
export function DesktopOfflineBootstrap() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;
    let active: Promise<void> | null = null;
    let lastStartedAt = 0;
    let lastCompletedAt = 0;
    let lastSuccessfulFullSyncAt = 0;
    let lastVerifiedSyncAt = 0;
    let lastResumeRefreshAt = 0;
    let localRuntimeVerified = false;
    let resumeTimer: number | null = null;
    const timers = new Set<number>();

    const dispatch = (name: string, detail?: unknown) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent(name, { detail }));
    };

    const execute = async (reason: string) => {
      if (disposed) return;
      if (active) return active;

      const now = Date.now();
      if (now - lastStartedAt < 1_500 && reason !== "manual") return;
      if (reason === "manual" && now - lastSuccessfulFullSyncAt < RECENT_FULL_SYNC_GUARD_MS) return;
      lastStartedAt = now;

      active = (async () => {
        dispatch("dentalflow:desktop-sync-start", { reason });
        let recovery: Awaited<ReturnType<typeof prepareDesktopRecovery>> | null = null;
        try {
          if (!localRuntimeVerified) {
            await verifyDesktopLocalRuntime();
            localRuntimeVerified = true;
          }

          const { data } = await withDesktopCloudTimeout(
            "sessão inicial do Desktop",
            () => supabase.auth.getSession(),
            DESKTOP_AUTH_TIMEOUT_MS,
          ).catch(async () => ({ data: { session: null } } as any));
          const user = data.session?.user;
          const isDeviceOnly = Boolean(user?.user_metadata?.dentalflow_offline_device);
          const cloudValidated = Boolean(user && !isDeviceOnly);

          if (cloudValidated && user) {
            let fullName: string | null = null;
            let clinicId: string | null = null;
            try {
              const profileResult = await withDesktopCloudTimeout(
                "perfil da conta",
                async () => {
                  const result = await supabase
                    .from("profiles")
                    .select("full_name,clinic_id")
                    .eq("id", user.id)
                    .maybeSingle();
                  if (result.error) throw result.error;
                  return result;
                },
                DESKTOP_AUTH_TIMEOUT_MS,
              );
              fullName = profileResult.data?.full_name ?? null;
              clinicId = profileResult.data?.clinic_id ?? null;
            } catch (error) {
              console.warn("[DentalFlow Desktop] Perfil ainda não hidratado; identidade básica preservada", error);
            }

            await provisionDesktopIdentity({
              userId: user.id,
              email: user.email ?? null,
              fullName,
              clinicId,
            });

            try {
              await withDesktopCloudTimeout(
                "validação do ambiente Clínica",
                fetchClinicContext,
                DESKTOP_READ_TIMEOUT_MS,
              );
            } catch (error) {
              console.warn("[DentalFlow Desktop] Clínica será revalidada em uma próxima passagem", error);
            }
          }

          recovery = await prepareDesktopRecovery();
          const summary = await withDesktopCloudTimeout(
            "sincronização integral do Desktop",
            syncDesktopOfflineData,
            FULL_SYNC_TIMEOUT_MS,
          );
          const protectedNamespaces = await protectCriticalCachesFromEmptyRegression(recovery.snapshot);
          const syncProof = cloudValidated
            ? await verifyAndStoreDesktopSyncProof().catch((error) => {
                console.warn("[DentalFlow Desktop] Read-models ainda não coincidem com os dados remotos", error);
                return null;
              })
            : null;

          lastSuccessfulFullSyncAt = Date.now();
          if (syncProof) lastVerifiedSyncAt = lastSuccessfulFullSyncAt;

          if (!disposed) {
            dispatch("dentalflow:desktop-sync-complete", {
              ...summary,
              reason,
              cloudValidated,
              syncProof,
              localRuntimeVerified,
              recovery: {
                reconstructedNamespaces: recovery.reconstructedNamespaces,
                protectedNamespaces,
              },
            });
          }
        } catch (error) {
          if (!disposed) {
            console.error("[DentalFlow Desktop] Falha parcial ao preparar dados offline", error);
            dispatch("dentalflow:desktop-sync-error", {
              reason,
              message: String((error as any)?.message ?? error ?? "Falha de sincronização"),
            });
          }
        } finally {
          if (!disposed) {
            // Atualiza somente o que está montado. O cache inativo permanece quente
            // e será lido do espelho local quando o usuário navegar até ele.
            await queryClient.refetchQueries({ type: "active" }).catch(() => undefined);
            lastCompletedAt = Date.now();
          }
        }
      })().finally(() => {
        active = null;
      });

      return active;
    };

    const schedule = (delay: number, reason: string, shouldRun?: () => boolean) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!disposed && (!shouldRun || shouldRun())) void execute(reason);
      }, delay);
      timers.add(id);
    };

    const scheduleResumeRefresh = () => {
      if (disposed || document.visibilityState !== "visible" || navigator.onLine === false) return;
      const now = Date.now();
      const lastUsefulActivity = Math.max(lastCompletedAt, lastResumeRefreshAt);
      if (now - lastUsefulActivity < RESUME_REFRESH_AFTER_MS) return;

      if (resumeTimer !== null) window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        resumeTimer = null;
        if (disposed || document.visibilityState !== "visible" || navigator.onLine === false) return;
        void queryClient.refetchQueries({ type: "active" })
          .catch(() => undefined)
          .finally(() => {
            lastResumeRefreshAt = Date.now();
          });
      }, RESUME_DEBOUNCE_MS);
    };

    void execute("boot");
    // Só repete o boot quando a primeira passagem ainda não produziu prova local.
    schedule(3_000, "boot-retry", () => lastVerifiedSyncAt === 0);
    schedule(10_000, "boot-finalize", () => lastVerifiedSyncAt === 0);

    const onOnline = () => void execute("online");
    const onFocus = () => scheduleResumeRefresh();
    const onVisible = () => {
      if (!document.hidden) scheduleResumeRefresh();
    };
    const onManual = () => void execute("manual");
    const onAccountChanged = () => schedule(120, "account-changed");

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("dentalflow:desktop-force-sync", onManual as EventListener);
    window.addEventListener("dentalflow:desktop-account-changed", onAccountChanged as EventListener);
    document.addEventListener("visibilitychange", onVisible);

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      // Renovação automática de token não é mudança de dados e não deve disparar
      // uma sincronização integral depois de cada período de inatividade.
      if (event === "SIGNED_IN" && Date.now() - lastStartedAt > 3_000) {
        schedule(180, "auth:signed_in");
      }
      if (event === "USER_UPDATED") schedule(180, "auth:user_updated");
    });

    return () => {
      disposed = true;
      if (resumeTimer !== null) window.clearTimeout(resumeTimer);
      resumeTimer = null;
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("dentalflow:desktop-force-sync", onManual as EventListener);
      window.removeEventListener("dentalflow:desktop-account-changed", onAccountChanged as EventListener);
      document.removeEventListener("visibilitychange", onVisible);
      authListener.subscription.unsubscribe();
    };
  }, [queryClient]);

  return null;
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  isDentalFlowDesktop,
  provisionDesktopIdentity,
  verifyDesktopLocalRuntime,
} from "@/lib/desktop-local";
import {
  syncDesktopAuxiliaryData,
  syncDesktopCriticalData,
} from "@/lib/desktop-sync";
import { verifyAndStoreDesktopSyncProof } from "@/lib/desktop-sync-proof";
import { fetchClinicContext } from "@/lib/clinic";
import { fetchMySubscriptionContext } from "@/lib/subscriptions";
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
const RECENT_SYNC_GUARD_MS = 5_000;
const CRITICAL_SYNC_TIMEOUT_MS = 40_000;

/**
 * Bootstrap resiliente do cliente instalado.
 *
 * Ordem de uma instalação limpa:
 * sessão online real -> identidade/perfil -> assinatura/ambientes -> pacientes e
 * casos críticos -> prova local -> liberar interface. Equipe, estoque, workflow,
 * notificações e demais espelhos aquecem depois, sem segurar o Hub.
 */
export function DesktopOfflineBootstrap() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;
    let active: Promise<void> | null = null;
    let lastStartedAt = 0;
    let lastCompletedAt = 0;
    let lastSuccessfulSyncAt = 0;
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
      if (reason === "manual" && now - lastSuccessfulSyncAt < RECENT_SYNC_GUARD_MS) return;
      lastStartedAt = now;

      active = (async () => {
        dispatch("dentalflow:desktop-sync-start", { reason });
        let recovery: Awaited<ReturnType<typeof prepareDesktopRecovery>> | null = null;
        try {
          if (!localRuntimeVerified) {
            await verifyDesktopLocalRuntime();
            localRuntimeVerified = true;
          }

          // Local recovery is safe before network work and lets an already-provisioned
          // computer keep its verified mirrors intact during a real offline boot.
          recovery = await prepareDesktopRecovery();

          const { data } = await withDesktopCloudTimeout(
            "sessão inicial do Desktop",
            () => supabase.auth.getSession(),
            DESKTOP_AUTH_TIMEOUT_MS,
          ).catch(() => ({ data: { session: null } } as any));
          const user = data.session?.user;
          const isDeviceOnly = Boolean(user?.user_metadata?.dentalflow_offline_device);
          const cloudValidated = Boolean(user && !isDeviceOnly);

          // Never start dozens of protected reads while Windows is online but the
          // real JWT is still being revalidated. That old race produced partial
          // first-sync results and could leave the Hub without environments.
          if (!cloudValidated || !user) {
            if (typeof navigator !== "undefined" && navigator.onLine !== false) {
              throw new Error("A sessão online ainda está sendo validada. O DentalFlow tentará novamente automaticamente.");
            }

            if (!disposed) {
              dispatch("dentalflow:desktop-sync-complete", {
                reason,
                cloudValidated: false,
                offline: true,
                localRuntimeVerified,
                recovery: {
                  reconstructedNamespaces: recovery.reconstructedNamespaces,
                  protectedNamespaces: [],
                },
              });
            }
            return;
          }

          let fullName: string | null = null;
          let clinicId: string | null = null;
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

          await provisionDesktopIdentity({
            userId: user.id,
            email: user.email ?? null,
            fullName,
            clinicId,
          });

          // Subscription/session entitlement is an authorization asset, not an
          // auxiliary dashboard query. Cache it before the Hub is allowed to race
          // with the rest of the first synchronization.
          const subscriptionContext = await withDesktopCloudTimeout(
            "assinatura e ambientes da empresa",
            fetchMySubscriptionContext,
            DESKTOP_READ_TIMEOUT_MS,
          );
          if (!subscriptionContext) {
            throw new Error("Não foi possível validar a assinatura e os ambientes desta conta.");
          }
          queryClient.setQueryData(["subscription_context"], subscriptionContext);

          const clinicContext = await withDesktopCloudTimeout(
            "validação do ambiente Clínica",
            fetchClinicContext,
            DESKTOP_READ_TIMEOUT_MS,
          );
          queryClient.setQueryData(["clinic_context"], clinicContext);

          // Only patient/case/reference mirrors block first readiness. Larger
          // domains warm after the verified proof has released the interface.
          const summary = await withDesktopCloudTimeout(
            "sincronização crítica do Desktop",
            syncDesktopCriticalData,
            CRITICAL_SYNC_TIMEOUT_MS,
          );
          const protectedNamespaces = await protectCriticalCachesFromEmptyRegression(recovery.snapshot);
          const syncProof = await verifyAndStoreDesktopSyncProof().catch((error) => {
            console.warn("[DentalFlow Desktop] Read-models críticos ainda não coincidem com os dados remotos", error);
            return null;
          });

          lastSuccessfulSyncAt = Date.now();
          if (syncProof) lastVerifiedSyncAt = lastSuccessfulSyncAt;

          if (!disposed) {
            dispatch("dentalflow:desktop-sync-complete", {
              ...summary,
              reason,
              cloudValidated: true,
              syncProof,
              localRuntimeVerified,
              subscriptionCached: true,
              recovery: {
                reconstructedNamespaces: recovery.reconstructedNamespaces,
                protectedNamespaces,
              },
            });
          }

          if (syncProof && !disposed) {
            // Large/secondary domains no longer extend the first-install loading
            // screen. They still receive the same durable local-first warm-up.
            void syncDesktopAuxiliaryData()
              .then(() => queryClient.refetchQueries({ type: "active" }))
              .catch((error) => {
                console.warn("[DentalFlow Desktop] Sincronização auxiliar seguirá em uma próxima passagem", error);
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
    // If auth/critical proof lost the first race on a clean install, retry the
    // serialized preflight rather than launching another full background sync.
    schedule(3_000, "boot-retry", () => lastVerifiedSyncAt === 0);
    schedule(10_000, "boot-finalize", () => lastVerifiedSyncAt === 0);

    const onOnline = () => void execute("online");
    const onFocus = () => scheduleResumeRefresh();
    const onVisible = () => {
      if (!document.hidden) scheduleResumeRefresh();
    };
    const onManual = () => void execute("manual");
    const onAccountChanged = () => schedule(120, "account-changed");
    const onSubscriptionUpdated = (event: Event) => {
      const context = (event as CustomEvent).detail;
      if (context) queryClient.setQueryData(["subscription_context"], context);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("dentalflow:desktop-force-sync", onManual as EventListener);
    window.addEventListener("dentalflow:desktop-account-changed", onAccountChanged as EventListener);
    window.addEventListener("dentalflow:subscription-context-updated", onSubscriptionUpdated as EventListener);
    document.addEventListener("visibilitychange", onVisible);

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
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
      window.removeEventListener("dentalflow:subscription-context-updated", onSubscriptionUpdated as EventListener);
      document.removeEventListener("visibilitychange", onVisible);
      authListener.subscription.unsubscribe();
    };
  }, [queryClient]);

  return null;
}

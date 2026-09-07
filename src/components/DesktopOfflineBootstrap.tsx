import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop, provisionDesktopIdentity } from "@/lib/desktop-local";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";
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

const FOCUS_REFRESH_AFTER_MS = 3 * 60_000;

/**
 * Resilient installed-client boot.
 *
 * The initial passes repair/validate local data, then the app becomes event-driven.
 * Window focus no longer means "reload everything": a focus/visibility refresh is
 * allowed only after a few minutes without a completed hydration. Realtime keeps
 * genuinely changed entities current in the meantime, so moving between Windows
 * apps and DentalFlow remains instant and visually quiet.
 */
export function DesktopOfflineBootstrap() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;
    let active: Promise<void> | null = null;
    let lastStartedAt = 0;
    let lastCompletedAt = 0;
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
      lastStartedAt = now;

      active = (async () => {
        dispatch("dentalflow:desktop-sync-start", { reason });
        let recovery: Awaited<ReturnType<typeof prepareDesktopRecovery>> | null = null;
        try {
          const { data } = await withDesktopCloudTimeout(
            "sessão inicial do Desktop",
            () => supabase.auth.getSession(),
            DESKTOP_AUTH_TIMEOUT_MS,
          ).catch(async () => ({ data: { session: null } } as any));
          const user = data.session?.user;
          const isDeviceOnly = Boolean(user?.user_metadata?.dentalflow_offline_device);

          if (user && !isDeviceOnly) {
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

            // Repair a stale negative Clinic entitlement before the Hub/Clinic
            // decides whether to disable the module. The Desktop clinic facade
            // persists only server-verified context in SQLite.
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
          const summary = await syncDesktopOfflineData();
          const protectedNamespaces = await protectCriticalCachesFromEmptyRegression(recovery.snapshot);

          if (!disposed) {
            dispatch("dentalflow:desktop-sync-complete", {
              ...summary,
              reason,
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
            await queryClient.invalidateQueries().catch(() => undefined);
            lastCompletedAt = Date.now();
          }
        }
      })().finally(() => {
        active = null;
      });

      return active;
    };

    const schedule = (delay: number, reason: string) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        void execute(reason);
      }, delay);
      timers.add(id);
    };

    // Multi-pass cold boot only. After that, warm data is kept in memory and
    // realtime invalidations handle actual changes.
    void execute("boot");
    schedule(2_000, "boot-retry");
    schedule(8_000, "boot-finalize");

    const onOnline = () => void execute("online");
    const refreshAfterInactivity = (reason: string) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (Date.now() - lastCompletedAt < FOCUS_REFRESH_AFTER_MS) return;
      void execute(reason);
    };
    const onFocus = () => refreshAfterInactivity("focus-after-inactivity");
    const onVisible = () => {
      if (!document.hidden) refreshAfterInactivity("visible-after-inactivity");
    };
    const onManual = () => void execute("manual");
    const onAccountChanged = () => {
      schedule(100, "account-changed");
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("dentalflow:desktop-force-sync", onManual as EventListener);
    window.addEventListener("dentalflow:desktop-account-changed", onAccountChanged as EventListener);
    document.addEventListener("visibilitychange", onVisible);

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "TOKEN_REFRESHED", "INITIAL_SESSION"].includes(event)) {
        schedule(120, `auth:${event.toLowerCase()}`);
      }
    });

    return () => {
      disposed = true;
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

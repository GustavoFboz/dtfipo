import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/audit";
import { getProvisionedDesktopIdentity, isDentalFlowDesktop } from "@/lib/desktop-local";
import { OFFLINE_ACCESS_EXPIRED_EVENT, offlineAccessDeadline } from "@/lib/offline-access-policy";
import { toast } from "sonner";

const SESSION_REVALIDATE_COOLDOWN_MS = 60_000;
const SESSION_REVALIDATE_DEBOUNCE_MS = 450;

/**
 * Gerencia o ciclo de vida da sessão sem transformar focus + visibilitychange
 * em duas validações concorrentes. A checagem remota continua existindo para
 * detectar sessões revogadas, mas é single-flight, debounced e respeita offline.
 */
export function useSessionLifecycle() {
  const [offlineBlocked, setOfflineBlocked] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let disposed = false;
    let lastValidationAt = 0;
    let activeValidation: Promise<void> | null = null;
    let scheduleTimer: number | null = null;
    let expiryLogout: Promise<void> | null = null;
    let expiryWarningShown = false;
    let deadlineTimer: number | null = null;

    const forceLogout = async (reason: string) => {
      if (reason !== "offline_expired") await logAuditEvent("auth.logout", { reason });
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut(reason === "offline_expired" ? { scope: "local" } : undefined);
      if (!disposed) {
        await navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined, plan: undefined, profession: undefined, returnTo: undefined } });
      }
    };

    const onOfflineExpired = () => {
      if (disposed || expiryLogout) return;
      setOfflineBlocked(true);
      expiryLogout = (async () => {
        toast.error("O prazo offline de três dias terminou. Conecte-se e entre novamente.");
        await forceLogout("offline_expired");
        if (!disposed) setOfflineBlocked(false);
      })().catch(() => { /* Fail closed; a restart retries pending cleanup. */ })
        .finally(() => { expiryLogout = null; });
    };
    const checkOfflineDeadline = async () => {
      if (!isDentalFlowDesktop() || disposed) return;
      try {
        const identity = await getProvisionedDesktopIdentity();
        if (deadlineTimer !== null) window.clearTimeout(deadlineTimer);
        deadlineTimer = identity ? window.setTimeout(checkOfflineDeadline,
          Math.min(offlineAccessDeadline(identity) - Date.now(), 2_147_483_647)) : null;
        if (identity && navigator.onLine === false && !expiryWarningShown) {
          expiryWarningShown = true;
          const hours = Math.max(1, Math.ceil((offlineAccessDeadline(identity) - Date.now()) / 3_600_000));
          toast.warning(`Acesso offline: até ${hours} horas restantes. Ao vencer, os dados locais e alterações não sincronizadas serão apagados. Conecte-se para sincronizar.`, { duration: 15_000 });
        }
      } catch {
        // Cleanup failures retain the expired identity for retry, but may not
        // keep a clinical screen open. Do not signOut/clear that retry receipt.
        if (!disposed) {
          setOfflineBlocked(true);
          await qc.cancelQueries(); qc.clear();
          navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined, plan: undefined, profession: undefined, returnTo: undefined } });
        }
      }
    };

    const revalidate = () => {
      if (disposed || document.visibilityState !== "visible" || navigator.onLine === false) return Promise.resolve();
      const now = Date.now();
      if (now - lastValidationAt < SESSION_REVALIDATE_COOLDOWN_MS) return Promise.resolve();
      if (activeValidation) return activeValidation;

      lastValidationAt = now;
      activeValidation = (async () => {
        // getSession é local na situação normal. Só fazemos a chamada remota de
        // getUser quando realmente existe uma sessão que precisa ser verificada.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session || disposed) return;

        const { data, error } = await supabase.auth.getUser();
        if (!disposed && (!data.user || error)) {
          await forceLogout("revoked");
        }
      })()
        .catch((error) => {
          // Falha de rede transitória não deve derrubar a sessão local nem bloquear UI.
          console.warn("[DentalFlow] Não foi possível revalidar a sessão neste instante", error);
        })
        .finally(() => {
          activeValidation = null;
        });

      return activeValidation;
    };

    const scheduleValidation = () => {
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      if (scheduleTimer !== null) window.clearTimeout(scheduleTimer);
      scheduleTimer = window.setTimeout(() => {
        scheduleTimer = null;
        void revalidate();
      }, SESSION_REVALIDATE_DEBOUNCE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleValidation();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", scheduleValidation);
    window.addEventListener(OFFLINE_ACCESS_EXPIRED_EVENT, onOfflineExpired);
    window.addEventListener("offline", checkOfflineDeadline);
    window.addEventListener("focus", checkOfflineDeadline);
    const expiryTimer = isDentalFlowDesktop() ? window.setInterval(checkOfflineDeadline, 30_000) : null;
    void checkOfflineDeadline();

    return () => {
      disposed = true;
      if (scheduleTimer !== null) window.clearTimeout(scheduleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", scheduleValidation);
      window.removeEventListener(OFFLINE_ACCESS_EXPIRED_EVENT, onOfflineExpired);
      window.removeEventListener("offline", checkOfflineDeadline);
      window.removeEventListener("focus", checkOfflineDeadline);
      if (expiryTimer !== null) window.clearInterval(expiryTimer);
      if (deadlineTimer !== null) window.clearTimeout(deadlineTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return offlineBlocked;
}

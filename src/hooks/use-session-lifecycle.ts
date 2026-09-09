import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/audit";

const SESSION_REVALIDATE_COOLDOWN_MS = 60_000;
const SESSION_REVALIDATE_DEBOUNCE_MS = 450;

/**
 * Gerencia o ciclo de vida da sessão sem transformar focus + visibilitychange
 * em duas validações concorrentes. A checagem remota continua existindo para
 * detectar sessões revogadas, mas é single-flight, debounced e respeita offline.
 */
export function useSessionLifecycle() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let disposed = false;
    let lastValidationAt = 0;
    let activeValidation: Promise<void> | null = null;
    let scheduleTimer: number | null = null;

    const forceLogout = async (reason: string) => {
      await logAuditEvent("auth.logout", { reason });
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      if (!disposed) {
        navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined, returnTo: undefined } });
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

    return () => {
      disposed = true;
      if (scheduleTimer !== null) window.clearTimeout(scheduleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", scheduleValidation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

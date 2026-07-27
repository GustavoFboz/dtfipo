import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/audit";

const INACTIVITY_MS = 30 * 60 * 1000; // 30 min
const WARN_BEFORE_MS = 60 * 1000; // aviso 60s antes

/**
 * Gerencia ciclo de vida da sessão:
 * - Auto-logout por inatividade (30 min), com toast de aviso 60s antes.
 * - Revalida sessão ao voltar o foco / aba visível: se a sessão foi
 *   revogada no servidor (troca de senha, delete de conta, expiração),
 *   força logout local imediato para não servir dados obsoletos.
 */
export function useSessionLifecycle() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const timers = useRef<{ logout?: ReturnType<typeof setTimeout>; warn?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    const clearTimers = () => {
      if (timers.current.logout) clearTimeout(timers.current.logout);
      if (timers.current.warn) clearTimeout(timers.current.warn);
      timers.current = {};
    };

    const forceLogout = async (reason: string) => {
      clearTimers();
      await logAuditEvent("auth.logout", { reason });
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined } });
    };

    const scheduleTimers = () => {
      clearTimers();
      // Só ativa se houver sessão
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        timers.current.warn = setTimeout(() => {
          toast("Sua sessão expira em 1 minuto por inatividade.", {
            action: {
              label: "Continuar conectado",
              onClick: () => scheduleTimers(),
            },
            duration: WARN_BEFORE_MS,
          });
        }, INACTIVITY_MS - WARN_BEFORE_MS);
        timers.current.logout = setTimeout(() => {
          void forceLogout("inactivity");
        }, INACTIVITY_MS);
      });
    };

    const onActivity = () => scheduleTimers();

    const revalidate = async () => {
      const { data, error } = await supabase.auth.getUser();
      // Se antes havia sessão local mas o servidor não reconhece mais, força logout.
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session && (!data.user || error)) {
        void forceLogout("revoked");
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void revalidate();
        scheduleTimers();
      }
    };

    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "touchstart", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    scheduleTimers();

    return () => {
      clearTimers();
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

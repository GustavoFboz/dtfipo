import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/audit";

/**
 * Gerencia ciclo de vida da sessão:
 * - Revalida sessão ao voltar o foco / aba visível: se a sessão foi
 *   revogada no servidor (troca de senha, delete de conta), força logout
 *   local para não servir dados obsoletos.
 * - NÃO há logout automático por inatividade (removido a pedido).
 */
export function useSessionLifecycle() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const forceLogout = async (reason: string) => {
      await logAuditEvent("auth.logout", { reason });
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined } });
    };

    const revalidate = async () => {
      const { data, error } = await supabase.auth.getUser();
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session && (!data.user || error)) {
        void forceLogout("revoked");
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void revalidate();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

/**
 * Grava um evento na tabela `admin_logs`. Usado para trilha de auditoria
 * de eventos sensíveis: login, logout, troca de clínica etc.
 * Falhas são silenciosas — auditoria nunca deve quebrar o fluxo do usuário.
 */
export async function logAuditEvent(
  action: string,
  details: Record<string, unknown> = {},
) {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;
    const enrichedDetails = {
      ...details,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      at: new Date().toISOString(),
    };
    await supabase.from("admin_logs").insert({
      admin_id: userId,
      target_user_id: userId,
      action,
      details: enrichedDetails,
    });
  } catch {
    // noop — auditoria não pode quebrar UX
  }
}

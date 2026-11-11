import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireMasterSession, type MasterSessionCheck, type MasterSessionScope } from "./auth/master-session";
import { withDesktopCloudTimeout } from "./desktop-cloud";

type Client = Pick<SupabaseClient<Database>, "auth" | "rpc">;
type Company = {
  id: string; name: string; billing_exempt: boolean; subscription_id: string | null;
  status: string | null; plan_code: string | null; provider_environment: string | null;
  current_period_end: string | null; provider_linked: boolean;
};
type Payment = {
  id: string; clinic_id: string; status: string; amount_cents: number;
  currency: string; provider_environment: string; created_at: string; paid_at: string | null;
};
export type MasterReviewEvent = {
  provider_event_id: string; event_type: string; provider_environment: string;
  status: string; attempt_count: number; received_at: string;
};
export type MasterSnapshot = {
  companies: Company[]; queue: Record<string, number>;
  recent_payments: Payment[]; review_events: MasterReviewEvent[]; generated_at: string;
};
export const masterDashboardKey = (scope: MasterSessionScope, search?: string) =>
  ["platform-master-dashboard", scope.ownerId, scope.sessionId, scope.generation, ...(search === undefined ? [] : [search])] as const;

export async function loadMasterDashboard(
  client: Client, scope: MasterSessionScope, isCurrent: MasterSessionCheck, search: string, signal: AbortSignal,
): Promise<MasterSnapshot> {
  const session = await requireMasterSession(client.auth, scope, isCurrent, signal);
  const { data, error } = await client.rpc("platform_master_dashboard", { p_search: search })
    .setHeader("Authorization", `Bearer ${session.access_token}`).abortSignal(signal);
  await requireMasterSession(client.auth, scope, isCurrent, signal);
  if (error) throw error;
  return data as unknown as MasterSnapshot;
}

export async function replayMasterEvent(
  client: Client, scope: MasterSessionScope, isCurrent: MasterSessionCheck, event: MasterReviewEvent, reason: string,
) {
  const session = await requireMasterSession(client.auth, scope, isCurrent, undefined, true);
  const { data, error } = await client.rpc("platform_master_replay_asaas_event", {
    p_environment: event.provider_environment, p_event_id: event.provider_event_id, p_reason: reason.trim(),
  }).setHeader("Authorization", `Bearer ${session.access_token}`);
  await requireMasterSession(client.auth, scope, isCurrent, undefined, true);
  if (error) throw error;
  if (data !== true) throw new Error("O evento já não está em revisão.");
}

// This is an online administrative review, never a clinical/offline outbox
// instruction. The database rechecks operator, AAL2, state and billing links.
export async function closeExternalSandboxTest(
  client: Client, scope: MasterSessionScope, isCurrent: MasterSessionCheck,
  event: MasterReviewEvent, reason: string, confirmed: boolean,
) {
  if (event.provider_environment !== "sandbox" || event.status !== "dead_letter"
    || !["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE"].includes(event.event_type)
    || confirmed !== true) throw new Error("Confirme que este é um teste manual externo no Sandbox.");
  if (reason.trim().length < 16 || reason.trim().length > 300 || /[\u0000-\u001f\u007f]/.test(reason))
    throw new Error("Informe uma justificativa de 16 a 300 caracteres, sem quebras de linha.");
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new Error("Conecte-se à internet para concluir a revisão.");
  const controller = new AbortController();
  try {
    await withDesktopCloudTimeout("revisão do teste Sandbox", async () => {
      const session = await requireMasterSession(client.auth, scope, isCurrent, controller.signal, true);
      const { data, error } = await client.rpc("platform_master_close_external_sandbox_test", {
        p_environment: "sandbox", p_event_id: event.provider_event_id, p_reason: reason.trim(),
        p_confirm_manual_external: true,
      }).setHeader("Authorization", `Bearer ${session.access_token}`).abortSignal(controller.signal);
      await requireMasterSession(client.auth, scope, isCurrent, controller.signal, true);
      if (error) throw new Error(error.message === "PLATFORM_MASTER_EXTERNAL_TEST_HAS_BILLING_LINK"
        ? "Há vínculo com uma cobrança do DentalFlow. Mantenha o evento em revisão."
        : "O servidor não permitiu encerrar este teste. Atualize o painel e confira a elegibilidade.");
      if (data !== true) throw new Error("O evento já não está disponível para esta revisão.");
    });
  } finally { controller.abort(); }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireMasterSession, type MasterSessionCheck, type MasterSessionScope } from "./auth/master-session";

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

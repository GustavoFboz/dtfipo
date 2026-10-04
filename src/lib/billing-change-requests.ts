import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { withDesktopCloudTimeout } from "@/lib/desktop-cloud";
import { requireMasterSession, type MasterSessionCheck, type MasterSessionScope } from "@/lib/auth/master-session";

// The shared observer labels an authenticated session; Master authorization is
// checked by the Master RPC only. These company RPCs check the billing manager.
export type BillingSessionScope = MasterSessionScope;
export type BillingSessionCheck = MasterSessionCheck;
const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().datetime({ offset: true });
const environment = z.enum(["sandbox", "production"]);
const quoteSchema = z.object({
  subscription_id: z.string().uuid(), kind: z.enum(["cancel", "change_plan"]),
  current_plan_code: z.string().min(1), current_plan_name: z.string().min(1), current_amount_cents: amount,
  currency: z.literal("BRL"), paid_period_end: timestamp.nullable(), provider_environment: environment,
  target_plan_code: z.string().min(1).nullable(), target_plan_name: z.string().min(1).nullable(),
  target_amount_cents: amount.nullable(), target_max_members: count.nullable(), target_max_sessions: count.nullable(),
  target_storage_bytes: count.nullable(), storage_used_bytes: count.nullable(), members_used: count.nullable(), sessions_used: count.nullable(),
  block_reason: z.enum(["paid_period_required", "storage_limit", "member_limit", "session_limit"]).nullable(),
  quote_token: z.string().regex(/^[a-f0-9]{32}$/),
}).refine((q) => q.kind === "cancel"
  ? q.target_plan_code === null && q.target_plan_name === null && q.target_amount_cents === null
  : q.target_plan_code !== null && q.target_plan_name !== null && q.target_amount_cents !== null
    && q.target_max_members !== null && q.target_max_sessions !== null && q.target_storage_bytes !== null,
{ message: "Inconsistent billing quote" });
const requestSchema = z.object({
  id: z.string().uuid(), subscription_id: z.string().uuid(), kind: z.enum(["cancel", "change_plan"]),
  status: z.enum(["awaiting_provider", "withdrawn"]), provider_environment: environment,
  current_plan_name: z.string().min(1), current_amount_cents: amount,
  target_plan_name: z.string().min(1).nullable(), target_amount_cents: amount.nullable(), currency: z.literal("BRL"),
  paid_period_end: timestamp.nullable(), effective_not_before: timestamp, created_at: timestamp, withdrawn_at: timestamp.nullable(),
}).refine((r) => (r.kind === "cancel" ? r.target_plan_name === null && r.target_amount_cents === null
  : r.target_plan_name !== null && r.target_amount_cents !== null)
  && (r.status === "withdrawn" ? r.withdrawn_at !== null : r.withdrawn_at === null),
{ message: "Inconsistent billing request" });
const contextSchema = z.object({
  clinic_id: z.string().uuid(), cancellation_quote: quoteSchema.nullable(),
  plan_quotes: z.array(quoteSchema), requests: z.array(requestSchema),
}).refine((c) => (!c.cancellation_quote || c.cancellation_quote.kind === "cancel")
  && c.plan_quotes.every((q) => q.kind === "change_plan" && q.subscription_id === c.cancellation_quote?.subscription_id),
{ message: "Inconsistent billing context" });
export type BillingChangeQuote = z.infer<typeof quoteSchema>;
export type BillingChangeRequest = z.infer<typeof requestSchema>;
export type BillingChangeContext = z.infer<typeof contextSchema>;
export type MasterBillingChangeRequest = BillingChangeRequest & { clinic_name: string };
export const billingChangeContextKey = (scope: BillingSessionScope, clinicId: string) =>
  ["billing_change_context", scope.ownerId, scope.sessionId, scope.generation, clinicId] as const;
export const masterBillingRequestsKey = (scope: BillingSessionScope, search?: string) =>
  ["master_billing_requests", scope.ownerId, scope.sessionId, scope.generation, ...(search === undefined ? [] : [search])] as const;

// Financial instructions require online, server-validated identity on every
// platform. They never enter the clinical outbox or alter offline entitlement.
async function financialRpc(scope: BillingSessionScope, isCurrent: BillingSessionCheck,
  rpc: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Conecte-se à internet para consultar ou enviar uma solicitação.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    return await withDesktopCloudTimeout("solicitações de assinatura", async () => {
      signal?.throwIfAborted();
      const session = await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal);
      const verified = await supabase.auth.getUser(session.access_token);
      if (verified.error || verified.data.user?.id !== scope.ownerId) throw new Error("Entre novamente para validar sua sessão online.");
      await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal);
      const { data, error } = await (supabase as any).rpc(rpc, args)
        .setHeader("Authorization", `Bearer ${session.access_token}`).abortSignal(controller.signal);
      await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal);
      if (error) throw error;
      return data;
    });
  } finally { controller.abort(); signal?.removeEventListener("abort", abort); }
}

export async function fetchBillingChangeContext(scope: BillingSessionScope, isCurrent: BillingSessionCheck,
  clinicId: string, signal?: AbortSignal): Promise<BillingChangeContext> {
  const data = await financialRpc(scope, isCurrent, "billing_company_change_context", { p_clinic_id: clinicId }, signal);
  const parsed = contextSchema.safeParse(data);
  if (!parsed.success || parsed.data.clinic_id !== clinicId) throw new Error("O servidor não confirmou as solicitações desta empresa.");
  return parsed.data;
}

export async function submitBillingChangeRequest(scope: BillingSessionScope, isCurrent: BillingSessionCheck,
  clinicId: string, quote: BillingChangeQuote): Promise<BillingChangeRequest> {
  const validQuote = quoteSchema.parse(quote);
  if (validQuote.block_reason) throw new Error("Revise os limites e o período pago antes de solicitar a troca.");
  const data = await financialRpc(scope, isCurrent, "billing_submit_change_request", {
    p_clinic_id: clinicId, p_subscription_id: validQuote.subscription_id, p_kind: validQuote.kind,
    p_target_plan_code: validQuote.target_plan_code, p_quote_token: validQuote.quote_token,
  });
  const parsed = requestSchema.safeParse(data);
  if (!parsed.success || parsed.data.status !== "awaiting_provider" || parsed.data.subscription_id !== validQuote.subscription_id
    || parsed.data.kind !== validQuote.kind || parsed.data.current_amount_cents !== validQuote.current_amount_cents
    || parsed.data.target_amount_cents !== validQuote.target_amount_cents || parsed.data.target_plan_name !== validQuote.target_plan_name
    || parsed.data.provider_environment !== validQuote.provider_environment
    || parsed.data.paid_period_end !== validQuote.paid_period_end) {
    throw new Error("Não foi possível confirmar o envio. Atualize as solicitações antes de reenviar.");
  }
  return parsed.data;
}

export async function withdrawBillingChangeRequest(scope: BillingSessionScope, isCurrent: BillingSessionCheck,
  clinicId: string, request: BillingChangeRequest): Promise<BillingChangeRequest> {
  const data = await financialRpc(scope, isCurrent, "billing_withdraw_change_request", { p_clinic_id: clinicId, p_request_id: request.id });
  const parsed = requestSchema.safeParse(data);
  if (!parsed.success || parsed.data.id !== request.id || parsed.data.subscription_id !== request.subscription_id
    || parsed.data.status !== "withdrawn") throw new Error("Não foi possível confirmar a retirada. Atualize as solicitações.");
  return parsed.data;
}

export async function fetchMasterBillingChangeRequests(scope: BillingSessionScope, isCurrent: BillingSessionCheck,
  search: string, signal?: AbortSignal): Promise<MasterBillingChangeRequest[]> {
  const data = await financialRpc(scope, isCurrent, "platform_master_billing_change_requests", { p_search: search }, signal);
  const parsed = z.array(requestSchema.and(z.object({ clinic_name: z.string().min(1) }))).safeParse(data);
  if (!parsed.success || parsed.data.some((r) => r.status !== "awaiting_provider")) throw new Error("Não foi possível conferir a fila de solicitações.");
  return parsed.data;
}

export function friendlyBillingChangeError(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = String((error as { message?: unknown })?.message ?? "");
  const key = /BILLING_CHANGE_[A-Z_]+/.exec(`${code} ${message}`)?.[0];
  const messages: Record<string, string> = {
    BILLING_CHANGE_FORBIDDEN: "Somente o responsável autorizado pode gerenciar esta assinatura.",
    BILLING_CHANGE_NOT_ELIGIBLE: "Esta assinatura ainda não permite esta solicitação.",
    BILLING_CHANGE_QUOTE_STALE: "O contrato ou o plano mudou. Atualize as opções e confirme novamente.",
    BILLING_CHANGE_PENDING: "Já existe uma solicitação em andamento. Atualize para acompanhá-la.",
    BILLING_CHANGE_LIMIT_REVIEW: "O uso atual supera o novo plano, ou o período pago precisa de revisão. Atualize as opções.",
    BILLING_CHANGE_INVALID_PLAN: "Este plano não está disponível. Atualize as opções.",
    BILLING_CHANGE_REVIEW_REQUIRED: "Esta solicitação precisa de revisão. Atualize as solicitações.",
  };
  if (key) return messages[key] ?? "Atualize as opções antes de enviar a solicitação.";
  if (message.includes("MASTER_SESSION") || message.includes("MASTER_MFA")) return "Sua sessão mudou. Entre novamente para continuar.";
  if (message.includes("PLATFORM_MASTER_FORBIDDEN")) return "Acesso Master indisponível para esta conta.";
  if (code === "DENTALFLOW_DESKTOP_CLOUD_TIMEOUT") return "Não foi possível confirmar a operação. Atualize as solicitações antes de tentar novamente.";
  if (/^(Conecte-se à internet|Entre novamente|O servidor não confirmou|Não foi possível confirmar)/.test(message)) return message;
  return "Solicitações indisponíveis. Conecte-se à internet e tente novamente.";
}

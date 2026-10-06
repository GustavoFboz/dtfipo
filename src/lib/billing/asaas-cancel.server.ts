import { z } from "zod";
import { AsaasClient, loadAsaasConfig, type AsaasSubscription } from "./asaas.server";
import { readCheckoutBody, requestOriginAllowed } from "./asaas-checkout.server";

const inputSchema = z.object({ requestId: z.string().uuid(), environment: z.enum(["sandbox", "production"]),
  reason: z.string().trim().min(16).max(300).refine((s) => !/[\u0000-\u001f\u007f]/.test(s)),
  reconcileOnly: z.boolean() }).strict();
const claimSchema = z.object({ done: z.literal(false), request_id: z.string().uuid(), lease_token: z.string().uuid(),
  subscription_id: z.string().uuid(), external_subscription_id: z.string().regex(/^sub_[A-Za-z0-9]+$/),
  external_customer_id: z.string().regex(/^cus_[A-Za-z0-9]+$/), amount_cents: z.number().int().positive(),
  environment: z.enum(["sandbox", "production"]), reconcile_only: z.boolean() });
type CancelInput = z.infer<typeof inputSchema>;
type Claim = z.infer<typeof claimSchema>;
export type CancelResult = { ok: true; requestId: string; environment: "sandbox" | "production";
  status: "completed" | "review_required" } | { ok: false; code: string; error: string; status: number };
type Dependencies = {
  environment: "sandbox" | "production";
  claim: (input: CancelInput) => Promise<unknown>;
  beginWrite: (claim: Claim) => Promise<boolean>;
  finish: (claim: Claim, proof: AsaasSubscription | null, errorCode: string | null) => Promise<unknown>;
  client: Pick<AsaasClient, "getSubscription" | "updateSubscription">;
};

function verifiedResource(value: AsaasSubscription, claim: Claim): AsaasSubscription {
  const cents = Number(value?.value) * 100;
  if (!value || value.id !== claim.external_subscription_id || value.customer !== claim.external_customer_id
    || value.externalReference !== `dentalflow:subscription:${claim.subscription_id}` || value.cycle !== "MONTHLY"
    || value.deleted !== false || !["ACTIVE", "INACTIVE"].includes(value.status ?? "")
    || !Number.isFinite(cents) || Math.abs(cents - claim.amount_cents) > 0.000001) {
    throw new Error("BILLING_CANCEL_PROVIDER_MISMATCH");
  }
  return value;
}

async function loadDependencies(request: Request): Promise<Dependencies> {
  const token = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || token.split(".").length !== 3) throw new Error("BILLING_CANCEL_FORBIDDEN");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("BILLING_CANCEL_CONFIGURATION");
  const { createClient } = await import("@supabase/supabase-js");
  // A user JWT reaches PostgREST unchanged: the claim/begin RPCs verify AAL2,
  // operator and live Auth session themselves. The worker credential cannot claim.
  const actorClient = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: actor, error: actorError } = await actorClient.auth.getUser(token);
  if (actorError || !actor.user) throw new Error("BILLING_CANCEL_FORBIDDEN");
  const config = loadAsaasConfig();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const call = async (client: typeof actorClient, name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  };
  return { environment: config.environment, client: new AsaasClient({ ...config, timeoutMs: 2_500, maxGetRetries: 0 }),
    claim: (input) => call(actorClient, "platform_master_claim_cancel_request", {
      p_request_id: input.requestId, p_environment: config.environment, p_reason: input.reason,
      p_reconcile_only: input.reconcileOnly }),
    beginWrite: async (claim) => (await call(actorClient, "platform_master_begin_cancel_write", {
      p_request_id: claim.request_id, p_lease_token: claim.lease_token })) === true,
    finish: (claim, proof, errorCode) => call(supabaseAdmin as unknown as typeof actorClient,
      "billing_finish_cancel_request", { p_request_id: claim.request_id, p_lease_token: claim.lease_token,
        p_verified_subscription: proof ? { id: proof.id, customer: proof.customer,
          externalReference: proof.externalReference, value: proof.value, cycle: proof.cycle,
          status: proof.status, deleted: proof.deleted } : null, p_error_code: errorCode }),
  };
}

function safeFailure(error: unknown): Extract<CancelResult, { ok: false }> {
  const raw = error instanceof Error ? error.message : "";
  const code = /\bBILLING_CANCEL_[A-Z_]+\b/.exec(raw)?.[0] ?? "BILLING_CANCEL_UNAVAILABLE";
  const status = /FORBIDDEN|MFA|SESSION/.test(code) ? 403 : /BUSY|STALE|NOT_ELIGIBLE|PLAN_NOT_READY/.test(code) ? 409 : 503;
  return { ok: false, code, status, error: status === 403
    ? "Confirme sua identidade e permissão Master para esta ação."
    : status === 409 ? "A solicitação precisa ser atualizada ou conferida antes de continuar."
    : "Não foi possível confirmar o resultado. Atualize e confira o cancelamento antes de tentar novamente." };
}

/** A single leased inactivation. Readback can recover an ambiguous write; a
 * reconciliation or expired lease can NEVER issue another provider mutation. */
export async function executeAsaasCancelRequest(request: Request, input: unknown, dependencies?: Dependencies): Promise<CancelResult> {
  if (!requestOriginAllowed(request)) return safeFailure(new Error("BILLING_CANCEL_FORBIDDEN"));
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "BILLING_CANCEL_INVALID", status: 400, error: "Revise os dados e a justificativa." };
  let claim: Claim | undefined;
  let deps: Dependencies | undefined;
  let writeAttempted = false;
  try {
    deps = dependencies ?? await loadDependencies(request);
    if (parsed.data.environment !== deps.environment) throw new Error("BILLING_CANCEL_NOT_ELIGIBLE");
    const raw = await deps.claim(parsed.data);
    if (raw && typeof raw === "object" && "done" in raw && raw.done === true
      && "request_id" in raw && raw.request_id === parsed.data.requestId) {
      return { ok: true, requestId: parsed.data.requestId, environment: deps.environment, status: "completed" };
    }
    claim = claimSchema.parse(raw);
    if (claim.request_id !== parsed.data.requestId || claim.environment !== deps.environment
      || (parsed.data.reconcileOnly && !claim.reconcile_only)) throw new Error("BILLING_CANCEL_CLAIM_INVALID");
    const current = verifiedResource(await deps.client.getSubscription(claim.external_subscription_id), claim);
    if (current.status === "ACTIVE" && !claim.reconcile_only) {
      if (!await deps.beginWrite(claim)) throw new Error("BILLING_CANCEL_WRITE_NOT_AUTHORIZED");
      writeAttempted = true;
      // PUT has no automatic retry. Even when its response is lost, only GET
      // follows it. Existing paid/open invoices are retained by this transport.
      try { await deps.client.updateSubscription(claim.external_subscription_id, { status: "INACTIVE" }); }
      catch { /* The readback, rather than the transport outcome, decides. */ }
    }
    const proof = current.status === "INACTIVE" ? current
      : verifiedResource(await deps.client.getSubscription(claim.external_subscription_id), claim);
    const confirmed = proof.status === "INACTIVE";
    const result = await deps.finish(claim, confirmed ? proof : null,
      confirmed ? null : "PROVIDER_STILL_ACTIVE");
    if (result !== (confirmed ? "completed" : "review_required")) throw new Error("BILLING_CANCEL_RESULT_UNCONFIRMED");
    return { ok: true, requestId: claim.request_id, environment: claim.environment,
      status: confirmed ? "completed" : "review_required" };
  } catch (error) {
    if (claim && deps) {
      // No raw provider error, payload or token is persisted or returned.
      await deps.finish(claim, null, writeAttempted ? "PROVIDER_RESULT_UNCONFIRMED" : "PROVIDER_REVIEW_REQUIRED")
        .catch(() => undefined);
    }
    return safeFailure(error);
  }
}

function json(request: Request, value: unknown, status: number): Response {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("origin");
  if (origin && requestOriginAllowed(request)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return Response.json(value, { status, headers });
}
export async function handleAsaasCancelRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return requestOriginAllowed(request)
    ? new Response(null, { status: 204, headers: json(request, {}, 200).headers }) : json(request, {}, 403);
  if (request.method !== "POST") return json(request, {}, 405);
  try {
    const result = await executeAsaasCancelRequest(request, await readCheckoutBody(request));
    return json(request, result, result.ok ? 200 : result.status);
  } catch { return json(request, { ok: false, code: "BILLING_CANCEL_INVALID", error: "Requisição inválida.", status: 400 }, 400); }
}

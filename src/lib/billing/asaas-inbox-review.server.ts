import { z } from "zod";
import { AsaasApiError, AsaasClient, loadAsaasConfig, loadAsaasWorkerToken } from "./asaas.server";
import type { AsaasProviderEnvironment } from "./asaas-contract";
import { isAsaasWorkerAuthorized } from "./asaas-worker-health.server";

export const INBOX_REVIEW_CONTRACT = "dentalflow-inbox-review-v1";
const paymentId = /^pay_[A-Za-z0-9]{1,90}$/;
const subscriptionId = /^sub_[A-Za-z0-9]{1,90}$/;
const customerId = /^cus_[A-Za-z0-9]{1,90}$/;
const rowSchema = z.object({ id: z.string().uuid(), event_type: z.string().regex(/^[A-Z_]{5,80}$/),
  provider_environment: z.literal("sandbox"), status: z.literal("dead_letter"),
  attempt_count: z.number().int().min(0).max(1_000_000), error_message: z.string().nullable(),
  payload: z.record(z.unknown()) });
const providerSchema = z.object({ id: z.string(), customer: z.string().regex(customerId),
  subscription: z.string().regex(subscriptionId).nullable().optional(),
  status: z.string().optional(), deleted: z.boolean().optional() });
const knownStatuses = new Set(["PENDING", "AWAITING_RISK_ANALYSIS", "AUTHORIZED", "CONFIRMED",
  "RECEIVED", "RECEIVED_IN_CASH", "OVERDUE", "REFUNDED", "PARTIALLY_REFUNDED", "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED", "DUNNING_RECEIVED", "ACTIVE", "INACTIVE"]);
type Dependencies = { workerToken: string; environment: AsaasProviderEnvironment;
  readEvents: (signal: AbortSignal) => Promise<unknown>;
  getPayment: (id: string) => Promise<unknown>; getSubscription: (id: string) => Promise<unknown>;
  now?: () => number };
function json(value: object, status: number) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
function lookupFailure(error: unknown): string {
  if (error instanceof z.ZodError || (error instanceof Error && error.message === "RESOURCE_ID_MISMATCH"))
    return "ASAAS_INVALID_RESPONSE";
  if (error instanceof AsaasApiError) {
    if (error.status !== null && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599)
      return `ASAAS_HTTP_${error.status}`;
    if (["ASAAS_TIMEOUT", "ASAAS_NETWORK_ERROR", "ASAAS_INVALID_RESPONSE", "ASAAS_EMPTY_RESPONSE",
      "ASAAS_RESPONSE_READ_FAILED"].includes(error.code)) return error.code;
  }
  return "ASAAS_LOOKUP_FAILED";
}

/** Punctual Sandbox diagnosis only. Reads at most two existing dead letters and
 * the corresponding provider resources. Never claims/replays an event, writes
 * the ledger, changes access or interprets the inbox snapshot as ownership proof. */
export async function inspectAsaasInboxReview(request: Request, dependencies?: Dependencies): Promise<Response> {
  if (request.method !== "GET") return json({ available: false }, 405);
  let token: string;
  try { token = dependencies?.workerToken ?? loadAsaasWorkerToken(); }
  catch { return json({ available: false }, 401); }
  if (!isAsaasWorkerAuthorized(request, token)) return json({ available: false }, 401);
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => key !== "check") || search.getAll("check").length !== 1
    || search.get("check") !== "inbox-review") return json({ available: false }, 400);
  let deps: Dependencies;
  try {
    if (dependencies) deps = dependencies;
    else {
      const config = loadAsaasConfig();
      // A diagnostic has no write method or automatic retry. Bound each GET as
      // well as the whole batch, including time spent reading the database.
      const client = new AsaasClient({ ...config, timeoutMs: 2_500, maxGetRetries: 0 });
      deps = { workerToken: token, environment: config.environment, readEvents: async (signal) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("billing_events")
          .select("id,event_type,provider_environment,status,attempt_count,error_message,payload")
          .eq("provider", "asaas").eq("provider_environment", "sandbox").eq("status", "dead_letter")
          .order("received_at", { ascending: true }).order("id", { ascending: true }).limit(3).abortSignal(signal);
        if (error) throw error;
        return data;
      }, getPayment: (id) => client.getPayment(id), getSubscription: (id) => client.getSubscription(id) };
    }
  } catch { return json({ available: false, code: "INBOX_REVIEW_CONFIGURATION_FAILED" }, 503); }
  if (deps.environment !== "sandbox" || request.headers.get("x-billing-environment") !== "sandbox")
    return json({ available: false, code: "INBOX_REVIEW_SANDBOX_ONLY" }, 409);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = async () => {
      const rows = z.array(rowSchema).max(3).parse(await deps.readEvents(controller.signal));
      controller.signal.throwIfAborted();
      const events = [];
      for (const row of rows.slice(0, 2)) {
        controller.signal.throwIfAborted();
        const payment = row.event_type.startsWith("PAYMENT_");
        const subscription = row.event_type.startsWith("SUBSCRIPTION_");
        const id = payment ? row.payload.paymentId : subscription ? row.payload.subscriptionId : null;
        const valid = typeof id === "string" && (payment ? paymentId : subscriptionId).test(id);
        const result = { id: row.id, event_type: row.event_type, attempt_count: row.attempt_count,
          stored_error_code: row.error_message && /^[A-Z0-9_]{1,80}$/.test(row.error_message) ? row.error_message : null,
          resource_kind: payment ? "payment" : subscription ? "subscription" : null,
          resource_id: valid ? id : null, provider_http_status: null as number | null,
          provider_status: null as string | null, provider_deleted: null as boolean | null,
          snapshot_customer_matches: null as boolean | null, snapshot_subscription_matches: null as boolean | null,
          lookup_code: !payment && !subscription ? "UNSUPPORTED_EVENT" : "MISSING_RESOURCE_ID",
          requires_manual_review: true };
        if (valid) {
          try {
            const value = providerSchema.parse(await (payment ? deps.getPayment(id) : deps.getSubscription(id)));
            controller.signal.throwIfAborted();
            if (value.id !== id) throw new Error("RESOURCE_ID_MISMATCH");
            result.provider_http_status = 200;
            result.provider_status = value.status && knownStatuses.has(value.status) ? value.status : null;
            result.provider_deleted = value.deleted ?? null;
            result.snapshot_customer_matches = typeof row.payload.customerId === "string" && customerId.test(row.payload.customerId)
              ? value.customer === row.payload.customerId : null;
            result.snapshot_subscription_matches = payment && typeof row.payload.subscriptionId === "string"
              && subscriptionId.test(row.payload.subscriptionId) ? value.subscription === row.payload.subscriptionId : null;
            result.lookup_code = "RESOURCE_READ";
          } catch (error) {
            controller.signal.throwIfAborted();
            result.lookup_code = lookupFailure(error);
            if (error instanceof AsaasApiError && error.status !== null && Number.isInteger(error.status)
              && error.status >= 400 && error.status <= 599) result.provider_http_status = error.status;
          }
        }
        events.push(result);
      }
      return json({ available: true, contract: INBOX_REVIEW_CONTRACT, environment: "sandbox",
        checked_at: new Date((deps.now ?? Date.now)()).toISOString(), has_more: rows.length > 2, events,
        provider_writes_invoked: false, financial_processing_invoked: false, replay_invoked: false }, 200);
    };
    return await Promise.race([run(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("TIMEOUT")); }, 8_000);
    })]);
  } catch { return json({ available: false, code: "INBOX_REVIEW_UNAVAILABLE" }, 503); }
  finally { if (timer) clearTimeout(timer); controller.abort(); }
}

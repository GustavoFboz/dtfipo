import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadAsaasProductionPreflightSecrets } from "./asaas.server";

export const PRODUCTION_PREFLIGHT_CONTRACT = "dentalflow-production-preflight-v2";
export const PRODUCTION_WEBHOOK_PREFLIGHT_CONTRACT = "dentalflow-production-webhook-preflight-v1";
const automatedEvents = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED",
  "SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED", "SUBSCRIPTION_INACTIVATED"];
const reviewEvents = ["PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS", "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL", "SUBSCRIPTION_DELETED"];
const knownEvents = new Set([...automatedEvents, ...reviewEvents]);
const webhookListSchema = z.object({ hasMore: z.boolean(), data: z.array(z.object({
  id: z.string().max(100).nullish(), url: z.string().max(2048), enabled: z.boolean(), interrupted: z.boolean(),
  apiVersion: z.number().int().min(1).max(99), sendType: z.string().max(32),
  authToken: z.string().max(255).nullish(), events: z.array(z.string().max(160)).max(300),
})).max(100) });
const accountState = z.enum(["PENDING", "AWAITING_APPROVAL", "APPROVED", "REJECTED", "EXPIRED"]);
const accountSchema = z.object({ general: accountState, commercialInfo: accountState,
  bankAccountInfo: accountState, documentation: accountState });
type Dependencies = { source?: Record<string, string | undefined>; fetch?: typeof fetch; now?: () => number };
function json(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
const transportCodes = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "EHOSTUNREACH",
  "ENETUNREACH", "ETIMEDOUT", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "ERR_SSL_WRONG_VERSION_NUMBER"]);
function safeTransportCode(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const item = error as { code?: unknown; cause?: unknown };
  const cause = typeof item.cause === "object" && item.cause !== null ? item.cause as { code?: unknown } : null;
  for (const code of [cause?.code, item.code]) {
    if (typeof code === "string" && transportCodes.has(code)) return code;
  }
  return null;
}
function authorized(request: Request, source: Record<string, string | undefined>) {
  const expected = source.BILLING_PRODUCTION_WORKER_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (expected.length < 32 || expected.length > 255 || /\s/.test(expected) || expected.startsWith("$aact_") ||
      expected === source.BILLING_WORKER_TOKEN?.trim() || expected === source.ASAAS_WEBHOOK_TOKEN?.trim() ||
      expected === source.BILLING_REPLAY_TOKEN?.trim() || expected === source.BILLING_PRODUCTION_REPLAY_TOKEN?.trim() ||
      expected === source.ASAAS_PRODUCTION_WEBHOOK_TOKEN?.trim() || !supplied) return false;
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only GET /myAccount/status/ on the fixed Production origin. No database,
 * financial client, webhook mutation, worker invocation or activation write. */
export async function inspectAsaasProductionSetup(request: Request, dependencies: Dependencies = {}): Promise<Response> {
  if (request.method !== "GET") return json({ available: false }, 405);
  const source = dependencies.source ?? process.env;
  if (!authorized(request, source)) return json({ available: false }, 401);
  let credentials: ReturnType<typeof loadAsaasProductionPreflightSecrets>;
  try { credentials = loadAsaasProductionPreflightSecrets(source); }
  catch { return json({ available: false, code: "PRODUCTION_CONFIGURATION_FAILED" }, 503); }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let providerHttpStatus: number | null = null;
  try {
    const fetchImpl = dependencies.fetch ?? globalThis.fetch;
    const probe = async () => {
      const response = await fetchImpl("https://api.asaas.com/v3/myAccount/status/", {
        // Never follow redirects or forward the key to a second destination.
        // Manual mode preserves the refusal while exposing the HTTP status.
        method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": credentials.userAgent, access_token: credentials.apiKey },
      });
      providerHttpStatus = response.status;
      // Never echo a provider body/error: it may include personal data or tokens.
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403
          ? "PRODUCTION_CREDENTIAL_REFUSED" : "PRODUCTION_PROVIDER_UNAVAILABLE";
        return json({ available: false, code, provider_http_status: response.status }, 502);
      }
      const parsed = accountSchema.safeParse(await response.json());
      if (!parsed.success) return json({ available: false, code: "PRODUCTION_STATUS_INVALID", provider_http_status: 200 }, 502);
      const account = parsed.data;
      const currentEnvironment = source.ASAAS_ENVIRONMENT?.trim();
      return json({ available: true, contract: PRODUCTION_PREFLIGHT_CONTRACT, environment: "production",
        checked_at: new Date((dependencies.now ?? Date.now)()).toISOString(),
        configuration_valid: true, credentials_valid: true, account,
        // Asaas defines general approval separately from each registration field.
        account_approved: account.general === "APPROVED",
        account_setup_complete: Object.values(account).every((status) => status === "APPROVED"),
        runtime_environment: currentEnvironment === "sandbox" || currentEnvironment === "production" ? currentEnvironment : null,
        production_enabled: currentEnvironment === "production" && source.ASAAS_PRODUCTION_ENABLED === "true",
        webhook_delivery_verified: false, financial_processing_invoked: false,
      }, 200);
    };
    return await Promise.race([probe(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("PRODUCTION_PREFLIGHT_TIMEOUT")); }, 10_000);
    })]);
  } catch (error) {
    const code = error instanceof Error && error.message === "PRODUCTION_PREFLIGHT_TIMEOUT"
      ? "PRODUCTION_PREFLIGHT_TIMEOUT" : providerHttpStatus === 200
        ? "PRODUCTION_STATUS_INVALID" : "PRODUCTION_PROVIDER_UNAVAILABLE";
    return json({ available: false, code, provider_http_status: providerHttpStatus,
      transport_code: providerHttpStatus === null ? safeTransportCode(error) : null }, 502);
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
}

/** Private configuration read only. Never creates, enables, updates, removes or
 * tests delivery of a webhook; never exposes its URL, email or auth token. */
export async function inspectAsaasProductionWebhook(request: Request, dependencies: Dependencies = {}): Promise<Response> {
  if (request.method !== "GET") return json({ available: false }, 405);
  const source = dependencies.source ?? process.env;
  if (!authorized(request, source)) return json({ available: false }, 401);
  let credentials: ReturnType<typeof loadAsaasProductionPreflightSecrets>;
  try { credentials = loadAsaasProductionPreflightSecrets(source); }
  catch { return json({ available: false, code: "PRODUCTION_CONFIGURATION_FAILED" }, 503); }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let providerHttpStatus: number | null = null;
  try {
    const probe = async () => {
      const response = await (dependencies.fetch ?? globalThis.fetch)("https://api.asaas.com/v3/webhooks?offset=0&limit=100", {
        method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": credentials.userAgent, access_token: credentials.apiKey },
      });
      providerHttpStatus = response.status;
      if (!response.ok) return json({ available: false, provider_http_status: response.status,
        code: response.status === 401 || response.status === 403 ? "PRODUCTION_CREDENTIAL_REFUSED" : "PRODUCTION_PROVIDER_UNAVAILABLE" }, 502);
      const parsed = webhookListSchema.safeParse(await response.json());
      if (!parsed.success) return json({ available: false, code: "PRODUCTION_WEBHOOK_STATUS_INVALID", provider_http_status: 200 }, 502);
      const webhooks = parsed.data.data.filter((item) => item.url === "https://dtfipo.lovable.app/api/billing/asaas-webhook").map((item) => {
        const supplied = item.authToken;
        let tokenMatches: boolean | null = null;
        if (typeof supplied === "string" && supplied.length > 0 && !/^\*+$/.test(supplied)) {
          const a = Buffer.from(supplied), b = Buffer.from(credentials.webhookToken);
          tokenMatches = a.length === b.length && timingSafeEqual(a, b);
        }
        const id = item.id && (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
          || /^whk_[A-Za-z0-9_-]{1,90}$/.test(item.id)) ? item.id : null;
        return { id, enabled: item.enabled, interrupted: item.interrupted, api_version: item.apiVersion,
          send_type: item.sendType === "SEQUENTIALLY" || item.sendType === "NON_SEQUENTIALLY" ? item.sendType : null,
          token_matches: tokenMatches, configured_events: [...new Set(item.events.filter((event) => knownEvents.has(event)))],
          missing_automated_events: automatedEvents.filter((event) => !item.events.includes(event)),
          missing_review_events: reviewEvents.filter((event) => !item.events.includes(event)),
          unknown_events_count: item.events.filter((event) => !knownEvents.has(event)).length };
      });
      const listingComplete = !parsed.data.hasMore;
      const webhookPrepared = listingComplete && webhooks.length === 1 && webhooks.every((item) =>
        !item.enabled && !item.interrupted && item.api_version === 3 && item.send_type === "SEQUENTIALLY"
        && item.token_matches === true && item.missing_automated_events.length === 0
        && item.missing_review_events.length === 0 && item.unknown_events_count === 0);
      return json({ available: true, contract: PRODUCTION_WEBHOOK_PREFLIGHT_CONTRACT, environment: "production",
        checked_at: new Date((dependencies.now ?? Date.now)()).toISOString(), configuration_valid: true, credentials_valid: true,
        listing_complete: listingComplete, matching_webhooks: webhooks.length, webhook_prepared: webhookPrepared, webhooks,
        webhook_delivery_verified: false, financial_processing_invoked: false }, 200);
    };
    return await Promise.race([probe(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("PRODUCTION_PREFLIGHT_TIMEOUT")); }, 10_000);
    })]);
  } catch (error) {
    const code = error instanceof Error && error.message === "PRODUCTION_PREFLIGHT_TIMEOUT" ? "PRODUCTION_PREFLIGHT_TIMEOUT"
      : providerHttpStatus === 200 ? "PRODUCTION_WEBHOOK_STATUS_INVALID" : "PRODUCTION_PROVIDER_UNAVAILABLE";
    return json({ available: false, code, provider_http_status: providerHttpStatus,
      transport_code: providerHttpStatus === null ? safeTransportCode(error) : null }, 502);
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
}

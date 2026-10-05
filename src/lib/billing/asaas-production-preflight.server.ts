import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadAsaasProductionPreflightSecrets } from "./asaas.server";

export const PRODUCTION_PREFLIGHT_CONTRACT = "dentalflow-production-preflight-v1";
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
        account_approved: Object.values(account).every((status) => status === "APPROVED"),
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

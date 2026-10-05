import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectAsaasProductionSetup, PRODUCTION_PREFLIGHT_CONTRACT } from "./asaas-production-preflight.server";
import { loadAsaasConfig } from "./asaas.server";

const source = {
  ASAAS_ENVIRONMENT: "sandbox", ASAAS_PRODUCTION_ENABLED: "false", ASAAS_USER_AGENT: "DentalFlow/tests",
  ASAAS_API_KEY: "$aact_hmlg_fixture_not_a_real_key_0123456789",
  ASAAS_WEBHOOK_TOKEN: "sandbox-webhook-fixture-not-a-real-secret-0123456789",
  BILLING_WORKER_TOKEN: "sandbox-worker-fixture-not-a-real-secret-0123456789",
  ASAAS_PRODUCTION_API_KEY: "$aact_prod_fixture_not_a_real_key_0123456789",
  ASAAS_PRODUCTION_WEBHOOK_TOKEN: "production-webhook-fixture-not-a-real-secret-0123456789",
  BILLING_PRODUCTION_WORKER_TOKEN: "production-worker-fixture-not-a-real-secret-0123456789",
  BILLING_PRODUCTION_REPLAY_TOKEN: "production-replay-fixture-not-a-real-secret-0123456789",
};
const account = { general: "APPROVED", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED", documentation: "APPROVED" };
const request = (token = source.BILLING_PRODUCTION_WORKER_TOKEN, method = "GET") =>
  new Request("https://dtfipo.lovable.app/api/billing/asaas-worker?check=production-setup", {
    method, headers: { Authorization: `Bearer ${token}` },
  });
const now = () => Date.parse("2026-10-05T05:00:00Z");
afterEach(() => vi.useRealTimers());

describe("private readonly staged Production account diagnostic", () => {
  it.each(["POST", "PUT", "DELETE"])("rejects %s without an external request", async (method) => {
    const fetch = vi.fn();
    expect((await inspectAsaasProductionSetup(request(undefined, method), { source, fetch })).status).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["", "wrong", source.BILLING_WORKER_TOKEN, source.ASAAS_PRODUCTION_WEBHOOK_TOKEN, source.ASAAS_PRODUCTION_API_KEY])(
    "requires the separate Production worker credential before any provider request", async (token) => {
      const fetch = vi.fn();
      expect((await inspectAsaasProductionSetup(request(token), { source, fetch })).status).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    });

  it("makes only the fixed GET, removes private response fields, and leaves financial Production disabled", async () => {
    const original = { ...source };
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.asaas.com/v3/myAccount/status/");
      expect(init?.method).toBe("GET"); expect(init?.body).toBeUndefined(); expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("access_token")).toBe(source.ASAAS_PRODUCTION_API_KEY);
      return Response.json({ ...account, id: "private-account-id", email: "private@example.invalid", apiKey: source.ASAAS_PRODUCTION_API_KEY });
    });
    const response = await inspectAsaasProductionSetup(request(), { source, fetch, now });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ available: true, contract: PRODUCTION_PREFLIGHT_CONTRACT,
      environment: "production", checked_at: "2026-10-05T05:00:00.000Z", configuration_valid: true,
      credentials_valid: true, account, account_approved: true, runtime_environment: "sandbox",
      production_enabled: false, webhook_delivery_verified: false, financial_processing_invoked: false });
    expect(source).toEqual(original); expect(fetch).toHaveBeenCalledOnce();
    expect(() => loadAsaasConfig({ ...source, ASAAS_ENVIRONMENT: "production" })).toThrow(/produção permanece bloqueado/i);
  });

  it.each(["PENDING", "AWAITING_APPROVAL", "REJECTED", "EXPIRED"])(
    "separates a valid key from outstanding account approval (%s)", async (state) => {
      const fetch = vi.fn(async () => Response.json({ ...account, commercialInfo: state }));
      const response = await inspectAsaasProductionSetup(request(), { source, fetch, now });
      expect(await response.json()).toMatchObject({ credentials_valid: true, account_approved: false,
        account: { general: "APPROVED", commercialInfo: state } });
    });

  it.each([401, 403, 429, 500])("returns a fixed refusal for provider HTTP %s without reading a private error body", async (status) => {
    const fetch = vi.fn(async () => new Response("private credential and personal data", { status }));
    const response = await inspectAsaasProductionSetup(request(), { source, fetch });
    expect(response.status).toBe(502); expect(await response.json()).toEqual({ available: false,
      code: status === 401 || status === 403 ? "PRODUCTION_CREDENTIAL_REFUSED" : "PRODUCTION_PROVIDER_UNAVAILABLE",
      provider_http_status: status });
  });

  it("redacts network/redirect errors and rejects invalid account states", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error(source.ASAAS_PRODUCTION_API_KEY))
      .mockResolvedValueOnce(Response.json({ ...account, general: "APPROVED-with-private-data" }));
    const failed = await inspectAsaasProductionSetup(request(), { source, fetch });
    expect(await failed.json()).toEqual({ available: false, code: "PRODUCTION_PROVIDER_UNAVAILABLE",
      provider_http_status: null, transport_code: null });
    const invalid = await inspectAsaasProductionSetup(request(), { source, fetch });
    expect(await invalid.json()).toEqual({ available: false, code: "PRODUCTION_STATUS_INVALID", provider_http_status: 200 });
  });

  it.each(["ENOTFOUND", "ECONNREFUSED", "CERT_HAS_EXPIRED", "UND_ERR_CONNECT_TIMEOUT"])(
    "exposes only the permitted transport code %s, without messages or credentials", async (code) => {
      const fetch = vi.fn().mockRejectedValue(Object.assign(new Error(source.ASAAS_PRODUCTION_API_KEY),
        { cause: { code, message: source.ASAAS_PRODUCTION_API_KEY } }));
      const response = await inspectAsaasProductionSetup(request(), { source, fetch });
      expect(await response.json()).toEqual({ available: false, code: "PRODUCTION_PROVIDER_UNAVAILABLE",
        provider_http_status: null, transport_code: code });
    });

  it("does not expose an unknown transport code and classifies malformed provider JSON", async () => {
    const fetch = vi.fn().mockRejectedValueOnce({ code: source.ASAAS_PRODUCTION_API_KEY,
      cause: { code: source.ASAAS_PRODUCTION_API_KEY } })
      .mockResolvedValueOnce(new Response(source.ASAAS_PRODUCTION_API_KEY, { status: 200 }));
    expect(await (await inspectAsaasProductionSetup(request(), { source, fetch })).json()).toEqual({ available: false,
      code: "PRODUCTION_PROVIDER_UNAVAILABLE", provider_http_status: null, transport_code: null });
    expect(await (await inspectAsaasProductionSetup(request(), { source, fetch })).json()).toEqual({ available: false,
      code: "PRODUCTION_STATUS_INVALID", provider_http_status: 200, transport_code: null });
  });

  it.each(["ASAAS_PRODUCTION_API_KEY", "ASAAS_PRODUCTION_WEBHOOK_TOKEN", "BILLING_PRODUCTION_REPLAY_TOKEN"])(
    "does not fill a missing %s with a Sandbox secret", async (name) => {
    const incomplete: Record<string, string | undefined> = { ...source };
    delete incomplete[name];
    const fetch = vi.fn();
    const response = await inspectAsaasProductionSetup(request(), { source: incomplete, fetch });
    expect(await response.json()).toEqual({ available: false, code: "PRODUCTION_CONFIGURATION_FAILED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a reused Production worker token before contacting Asaas", async () => {
    const reused = { ...source, BILLING_PRODUCTION_WORKER_TOKEN: source.BILLING_WORKER_TOKEN };
    const fetch = vi.fn();
    expect((await inspectAsaasProductionSetup(request(source.BILLING_WORKER_TOKEN), { source: reused, fetch })).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds a stalled provider read and aborts it without echoing secrets", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | null | undefined;
    const fetch = vi.fn((_url, init) => { signal = init?.signal; return new Promise<Response>(() => {}); });
    const pending = inspectAsaasProductionSetup(request(), { source, fetch });
    await vi.advanceTimersByTimeAsync(10_001);
    const response = await pending;
    expect(signal?.aborted).toBe(true); expect(fetch).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ available: false, code: "PRODUCTION_PREFLIGHT_TIMEOUT",
      provider_http_status: null, transport_code: null });
  });
});

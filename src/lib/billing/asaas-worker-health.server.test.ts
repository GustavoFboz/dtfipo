import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectAsaasWorker, WORKER_HEALTH_CONTRACT } from "./asaas-worker-health.server";
const token = "health-worker-test-token-0123456789-0123456789";
const request = (secret = token, method = "GET", environment = "sandbox") => new Request("https://dtfipo.lovable.app/api/billing/asaas-worker", {
  method, headers: { Authorization: `Bearer ${secret}`, "X-Billing-Environment": environment },
});
const now = Date.parse("2026-10-04T01:30:00Z");
const heartbeat = { status: "ok", started_at: "2026-10-04T01:20:00Z", finished_at: "2026-10-04T01:20:01Z", last_healthy_at: "2026-10-04T01:20:01Z" };
const deps = (value: unknown = heartbeat) => ({ environment: "sandbox" as const, workerToken: token,
  now: () => now, readHealth: vi.fn().mockResolvedValue(value) });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("private readonly worker publication probe", () => {
  it.each(["POST","DELETE"])("refuses %s and an invalid token before any read", async (method) => {
    const d = deps(); expect((await inspectAsaasWorker(request(token,method),d)).status).toBe(405);
    expect((await inspectAsaasWorker(request("wrong"),d)).status).toBe(401);
    expect(d.readHealth).not.toHaveBeenCalled();
  });
  it("checks environment before the database read", async () => {
    const d = deps(); expect((await inspectAsaasWorker(request(token,"GET","production"),d)).status).toBe(409);
    expect(d.readHealth).not.toHaveBeenCalled();
  });
  it("returns only the contract, environment and safe telemetry projection", async () => {
    const d = deps(); const r = await inspectAsaasWorker(request(),d);
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ available: true, contract: WORKER_HEALTH_CONTRACT, environment: "sandbox",
      checked_at: "2026-10-04T01:30:00.000Z", worker: { ...heartbeat, started_age_seconds: 600, healthy_age_seconds: 599 } });
    expect(d.readHealth).toHaveBeenCalledOnce();
  });
  it("confirms publication/database access separately from a missing heartbeat", async () => {
    const r = await inspectAsaasWorker(request(),deps(null));
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ available: true, worker: null });
  });
  it.each([{}, { ...heartbeat, run_id: "private" }, { ...heartbeat, status: "running" },
    { ...heartbeat, last_healthy_at: "invalid" }])("rejects invalid or private-bearing projections: %s", async (value) => {
    const r = await inspectAsaasWorker(request(),deps(value));
    expect(r.status).toBe(503); expect(await r.text()).not.toContain("private");
  });
  it("redacts unexpected database details", async () => {
    const d = deps(); d.readHealth.mockRejectedValue(new Error("private database credential"));
    const r = await inspectAsaasWorker(request(),d);
    expect(r.status).toBe(503); expect(await r.json()).toEqual({ available: false, code: "HEALTH_READ_FAILED" });
  });
  it("has a finite timeout and aborts the read without a worker invocation", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const d = deps(); d.readHealth.mockImplementation((s) => { signal=s; return new Promise(() => {}); });
    const pending = inspectAsaasWorker(request(),d);
    await vi.advanceTimersByTimeAsync(3_001);
    const r = await pending; expect(r.status).toBe(503); expect(signal?.aborted).toBe(true);
    expect(await r.json()).toEqual({ available: false, code: "HEALTH_READ_TIMEOUT" });
  });
  it("validates configuration locally and returns a fixed failure code", async () => {
    vi.stubEnv("BILLING_WORKER_TOKEN",token); vi.stubEnv("ASAAS_ENVIRONMENT","");
    const r = await inspectAsaasWorker(request());
    expect(r.status).toBe(503); expect(await r.json()).toEqual({ available: false, code: "CONFIGURATION_FAILED" });
  });
  it("uses the selected environment credential before consulting the database", async () => {
    const productionToken = "production-worker-fixture-not-a-real-secret-0123456789";
    for (const [name, value] of Object.entries({ ASAAS_ENVIRONMENT: "production", ASAAS_PRODUCTION_ENABLED: "true",
      ASAAS_PRODUCTION_API_KEY: "$aact_prod_fixture_not_a_real_key_0123456789",
      ASAAS_PRODUCTION_WEBHOOK_TOKEN: "production-webhook-fixture-not-a-real-secret-0123456789",
      BILLING_PRODUCTION_WORKER_TOKEN: productionToken, BILLING_WORKER_TOKEN: token, ASAAS_USER_AGENT: "DentalFlow/tests" })) {
      vi.stubEnv(name, value);
    }
    expect((await inspectAsaasWorker(request(token))).status).toBe(401);
    // Authenticated with Production token, but Sandbox header fails before the DB import/read.
    expect((await inspectAsaasWorker(request(productionToken))).status).toBe(409);
  });
});

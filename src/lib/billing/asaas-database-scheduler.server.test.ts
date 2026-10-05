import { afterEach, describe, expect, it, vi } from "vitest";
import { DATABASE_SCHEDULER_CONTRACT, manageAsaasDatabaseScheduler } from "./asaas-database-scheduler.server";

const source = { ASAAS_ENVIRONMENT: "sandbox", ASAAS_PRODUCTION_ENABLED: "false", ASAAS_USER_AGENT: "DentalFlow/tests",
  ASAAS_API_KEY: "$aact_hmlg_fixture_not_a_real_key_0123456789", ASAAS_WEBHOOK_TOKEN: "sandbox-webhook-fixture-not-a-real-secret-0123456789",
  BILLING_WORKER_TOKEN: "sandbox-worker-fixture-not-a-real-secret-0123456789",
  ASAAS_PRODUCTION_API_KEY: "$aact_prod_fixture_not_a_real_key_0123456789",
  ASAAS_PRODUCTION_WEBHOOK_TOKEN: "production-webhook-fixture-not-a-real-secret-0123456789",
  BILLING_PRODUCTION_WORKER_TOKEN: "production-worker-fixture-not-a-real-secret-0123456789",
  BILLING_PRODUCTION_REPLAY_TOKEN: "production-replay-fixture-not-a-real-secret-0123456789" };
const registration = { provider_environment: "sandbox", scheduled: true, cron_job_id: 1, schedule: "1-59/5 * * * *" };
const status = { provider_environment: "sandbox", enabled: true, cron_job_id: 1, cron_active: true,
  schedule: registration.schedule, configured_at: "2026-10-05T19:00:00Z", last_dispatched_at: null,
  last_response_http_status: null, last_response_timed_out: null };
const request = (method = "POST", body: unknown = { expected_environment: "sandbox" }, token = source.BILLING_PRODUCTION_WORKER_TOKEN) =>
  new Request("https://dtfipo.lovable.app/api/billing/asaas-worker?check=database-scheduler", {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
afterEach(() => vi.useRealTimers());

describe("private database scheduler bootstrap", () => {
  it.each(["PUT", "DELETE"])("refuses %s without a database call", async (method) => {
    const configure = vi.fn(); expect((await manageAsaasDatabaseScheduler(request(method), { source, configure })).status).toBe(405);
    expect(configure).not.toHaveBeenCalled();
  });
  it.each(["wrong", source.BILLING_WORKER_TOKEN, source.ASAAS_PRODUCTION_WEBHOOK_TOKEN])("requires the separate operator token", async (token) => {
    const configure = vi.fn(); expect((await manageAsaasDatabaseScheduler(request("POST", undefined, token), { source, configure })).status).toBe(401);
    expect(configure).not.toHaveBeenCalled();
  });
  it("copies only the backend current worker credential and strips private RPC fields", async () => {
    const configure = vi.fn(async (environment, token, signal) => {
      expect(environment).toBe("sandbox"); expect(token).toBe(source.BILLING_WORKER_TOKEN); expect(signal).toBeInstanceOf(AbortSignal);
      return { ...registration, token, private: "PRIVATE_MARKER" };
    });
    const original = { ...source };
    const response = await manageAsaasDatabaseScheduler(request(), { source, configure });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result).toMatchObject({ contract: DATABASE_SCHEDULER_CONTRACT, environment: "sandbox", scheduler: registration,
      immediate_worker_invoked: false });
    expect(JSON.stringify(result)).not.toContain(source.BILLING_WORKER_TOKEN); expect(JSON.stringify(result)).not.toContain("PRIVATE_MARKER");
    expect(configure).toHaveBeenCalledOnce(); expect(source).toEqual(original);
  });
  it.each([{ expected_environment: "production" }, { expected_environment: "sandbox", token: "caller-controlled" },
    { expected_environment: "sandbox", url: "https://private.invalid" }, { expected_environment: "sandbox", schedule: "* * * * *" }, null])(
    "rejects drift or caller configuration before database mutation", async (body) => {
      const configure = vi.fn(); const response = await manageAsaasDatabaseScheduler(request("POST", body), { source, configure });
      expect([400, 409]).toContain(response.status); expect(configure).not.toHaveBeenCalled();
    });
  it("keeps Production bootstrap blocked until the backend feature flag is enabled", async () => {
    const configure = vi.fn(); expect((await manageAsaasDatabaseScheduler(request("POST", { expected_environment: "production" }), {
      source: { ...source, ASAAS_ENVIRONMENT: "production" }, configure })).status).toBe(503);
    expect(configure).not.toHaveBeenCalled();
  });
  it("uses exclusive Production credentials only when explicitly enabled and matched", async () => {
    const configure = vi.fn(async (_environment, token) => { expect(token).toBe(source.BILLING_PRODUCTION_WORKER_TOKEN);
      return { ...registration, provider_environment: "production" }; });
    expect((await manageAsaasDatabaseScheduler(request("POST", { expected_environment: "production" }), {
      source: { ...source, ASAAS_ENVIRONMENT: "production", ASAAS_PRODUCTION_ENABLED: "true" }, configure })).status).toBe(200);
  });
  it.each([{ ...registration, provider_environment: "production" }, { ...registration, scheduled: false },
    { ...registration, cron_job_id: "PRIVATE_MARKER" }, { ...registration, schedule: "PRIVATE_MARKER" }])(
    "rejects an invalid registration result without exposing it", async (value) => {
      const configure = vi.fn(async () => value); const response = await manageAsaasDatabaseScheduler(request(), { source, configure });
      expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE_MARKER");
    });
  it("bounds database latency and hides private SQL errors", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const configure = vi.fn((_env, _token, s) => { signal = s; return new Promise<unknown>(() => {}); });
    const pending = manageAsaasDatabaseScheduler(request(), { source, configure });
    await vi.advanceTimersByTimeAsync(8_001);
    expect((await pending).status).toBe(503); expect(signal?.aborted).toBe(true);
    const failed = await manageAsaasDatabaseScheduler(request(), { source, configure: vi.fn().mockRejectedValue(new Error(source.BILLING_WORKER_TOKEN)) });
    expect(await failed.json()).toEqual({ available: false, code: "DATABASE_SCHEDULER_UNAVAILABLE" });
  });
  it("reads safe status only, including an unconfigured scheduler, without invoking configuration", async () => {
    const configure = vi.fn(), readStatus = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ ...status, token: "PRIVATE_MARKER" });
    expect(await (await manageAsaasDatabaseScheduler(request("GET"), { source, configure, readStatus })).json()).toMatchObject({ scheduler: null });
    const response = await manageAsaasDatabaseScheduler(request("GET"), { source, configure, readStatus });
    const result = await response.json(); expect(result.scheduler).toEqual(status); expect(JSON.stringify(result)).not.toContain("PRIVATE_MARKER");
    expect(configure).not.toHaveBeenCalled();
  });
});

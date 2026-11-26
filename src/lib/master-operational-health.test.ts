import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { fetchMasterOperationalHealth, masterOperationalHealthKey, operationalAlerts } from "./master-operational-health";
const client = vi.hoisted(() => ({ auth: { getSession: vi.fn(), getUser: vi.fn() }, rpc: vi.fn(), header: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: client }));
const scope = { ownerId: "operator", sessionId: "login-1", generation: 1 };
const empty = { worker: null, queue: { waiting: 0, processing: 0, failed: 0, dead_letter: 0, expired_leases: 0, late_due: 0, oldest_due_at: null },
  checkout: { failed_24h: 0, uncertain: 0, expired_leases: 0 },
  subscriptions: { linked: 0, reconciliation_late: 0, expired_grace: 0, paid_period_without_ledger: 0 } };
const health = { generated_at: "2026-10-04T01:00:00Z", environments: [
  { ...empty, environment: "sandbox" as const }, { ...empty, environment: "production" as const }],
  storage: { reserved: 9, reserved_bytes: 1112944862, reserved_over_24h: 9 } };
let captured: Session;
function response(value: unknown, error: unknown = null, before = () => {}) {
  client.rpc.mockImplementation(() => { const request = {
    setHeader(...args: unknown[]) { client.header(...args); return request; },
    abortSignal: async () => { before(); return { data: value, error }; },
  }; return request; });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("navigator", { onLine: true });
  const exp = Math.floor(Date.now()/1000)+3600;
  captured = { user: { id: "operator" }, expires_at: exp,
    access_token: `test.${btoa(JSON.stringify({ sub: "operator", session_id: "login-1", aal: "aal1", exp }))}.test` } as Session;
  client.auth.getSession.mockResolvedValue({ data: { session: captured }, error: null });
  client.auth.getUser.mockResolvedValue({ data: { user: captured.user }, error: null });
  response(health);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("private operational monitoring", () => {
  it("validates cloud identity, pins the JWT and separates session caches", async () => {
    expect(await fetchMasterOperationalHealth(scope, () => true)).toEqual(health);
    expect(client.auth.getUser).toHaveBeenCalledWith(captured.access_token);
    expect(client.header).toHaveBeenCalledWith("Authorization", `Bearer ${captured.access_token}`);
    expect(masterOperationalHealthKey(scope)).not.toEqual(masterOperationalHealthKey({ ...scope, sessionId: "login-2" }));
  });
  it("blocks offline and mismatched cloud users before the RPC", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(fetchMasterOperationalHealth(scope, () => true)).rejects.toThrow("OFFLINE");
    vi.stubGlobal("navigator", { onLine: true });
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(fetchMasterOperationalHealth(scope, () => true)).rejects.toThrow("SESSION_CHANGED");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("discards a late response after the owner/session changes", async () => {
    let current = true; response(health, null, () => { current = false; });
    await expect(fetchMasterOperationalHealth(scope, () => current)).rejects.toThrow("SESSION_CHANGED");
  });
  it.each([null, {}, { ...health, environments: [health.environments[0], health.environments[0]] },
    { ...health, environments: [{ ...health.environments[0], queue: { ...empty.queue, failed: -1 } }, health.environments[1]] },
    { ...health, secret: "private" }, { ...health, storage: { ...health.storage, reserved_bytes: Number.MAX_SAFE_INTEGER+1 } }])(
    "refuses malformed or secret-bearing snapshots %s", async (value) => {
      response(value); await expect(fetchMasterOperationalHealth(scope, () => true)).rejects.toThrow("INVALID_RESPONSE");
    });
  it("bounds unavailable transport and cancels the pending query", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    client.rpc.mockImplementation(() => { const request = { setHeader: () => request, abortSignal: (s: AbortSignal) => {
      signal=s; return new Promise(() => {});
    } }; return request; });
    const result = fetchMasterOperationalHealth(scope, () => true).catch((e) => e);
    await vi.advanceTimersByTimeAsync(12_001);
    expect((await result).code).toBe("DENTALFLOW_DESKTOP_CLOUD_TIMEOUT"); expect(signal?.aborted).toBe(true);
  });
  it("does not query after a read has already been cancelled", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(fetchMasterOperationalHealth(scope, () => true, controller.signal)).rejects.toThrow();
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("does not label an unused production environment as a stopped worker", () => {
    expect(operationalAlerts(health.environments[1], health.generated_at)).toEqual([]);
    const active = { ...health.environments[0], subscriptions: { ...empty.subscriptions, linked: 1 } };
    expect(operationalAlerts(active, health.generated_at)[0]).toContain("15 minutos");
  });
  it("uses server time to flag stale workers, pending failures and uncertain checkout", () => {
    const active = { ...health.environments[0], worker: { started_at: "2026-10-04T00:50:00Z", finished_at: null,
      last_healthy_at: "2026-10-04T00:44:00Z", status: "running" as const, counters: {} },
      queue: { ...empty.queue, failed: 1 }, checkout: { ...empty.checkout, uncertain: 1 },
      subscriptions: { ...empty.subscriptions, linked: 1, reconciliation_late: 1 } };
    expect(operationalAlerts(active, health.generated_at)).toEqual(expect.arrayContaining([
      expect.stringContaining("15 minutos"),expect.stringContaining("5 minutos"),expect.stringContaining("nova tentativa"),
      expect.stringContaining("incerta"),expect.stringContaining("2 horas"),
    ]));
  });
});

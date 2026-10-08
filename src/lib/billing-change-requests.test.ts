// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { billingChangeContextKey, fetchBillingChangeContext, fetchMasterBillingChangeRequests,
  friendlyBillingChangeError, submitBillingChangeRequest, withdrawBillingChangeRequest,
  type BillingChangeQuote, type BillingChangeRequest } from "./billing-change-requests";

const { auth, rpc, header, aborted } = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), getUser: vi.fn() }, rpc: vi.fn(), header: vi.fn(), aborted: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth, rpc } }));
const owner = "78000000-0000-4000-8000-000000000001";
const clinic = "78000000-0000-4000-8000-000000000010";
const sub = "78000000-0000-4000-8000-000000000011";
const scope = { ownerId: owner, sessionId: "login-1", generation: 1 };
let capturedSession: Session;
const quote: BillingChangeQuote = { subscription_id: sub, kind: "cancel", current_plan_code: "company_advanced",
  current_plan_name: "Avançado", current_amount_cents: 74900, currency: "BRL", paid_period_end: "2040-01-01T00:00:00+00:00",
  provider_environment: "sandbox", target_plan_code: null, target_plan_name: null, target_amount_cents: null,
  target_max_members: null, target_max_sessions: null, target_storage_bytes: null, storage_used_bytes: null,
  members_used: null, sessions_used: null, block_reason: null, quote_token: "a".repeat(32) };
const request: BillingChangeRequest = { id: "78000000-0000-4000-8000-000000000012", subscription_id: sub, kind: "cancel",
  status: "awaiting_provider", provider_environment: "sandbox", current_plan_name: "Avançado", current_amount_cents: 74900,
  target_plan_name: null, target_amount_cents: null, currency: "BRL", paid_period_end: quote.paid_period_end,
  effective_not_before: "2040-01-01T00:00:00+00:00", created_at: "2026-10-03T23:35:00+00:00", withdrawn_at: null };
function session(): Session {
  const expires_at = Math.floor(Date.now()/1000) + 3600;
  return { user: { id: owner }, expires_at,
    access_token: `test.${btoa(JSON.stringify({ sub: owner, session_id: scope.sessionId, aal: "aal1", exp: expires_at }))}.test` } as Session;
}
function response(value: unknown, error: unknown = null) {
  rpc.mockImplementation(() => {
    const builder = { setHeader: (...args: unknown[]) => { header(...args); return builder; },
      abortSignal: (signal: AbortSignal) => { aborted(signal); return Promise.resolve({ data: value, error }); } };
    return builder;
  });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("navigator", { onLine: true });
  capturedSession = session();
  auth.getSession.mockResolvedValue({ data: { session: capturedSession }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  response({ clinic_id: clinic, cancellation_quote: quote, plan_quotes: [], requests: [] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("billing request identity and response boundary", () => {
  it("checks the cloud user and pins the captured JWT on every platform", async () => {
    const data = await fetchBillingChangeContext(scope, () => true, clinic);
    expect(data.cancellation_quote?.current_amount_cents).toBe(74900);
    expect(auth.getUser).toHaveBeenCalledWith(capturedSession.access_token);
    expect(header).toHaveBeenCalledWith("Authorization", `Bearer ${capturedSession.access_token}`);
    expect(rpc).toHaveBeenCalledWith("billing_company_change_context", { p_clinic_id: clinic });
  });
  it("refuses financial reads and mutations offline without an outbox", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(fetchBillingChangeContext(scope, () => true, clinic)).rejects.toThrow("internet");
    await expect(submitBillingChangeRequest(scope, () => true, clinic, quote)).rejects.toThrow("internet");
    expect(rpc).not.toHaveBeenCalled(); expect(auth.getUser).not.toHaveBeenCalled();
  });
  it("rejects a synthetic device session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: owner }, access_token: "dentalflow-local-device-session" } }, error: null });
    await expect(fetchBillingChangeContext(scope, () => true, clinic)).rejects.toThrow("MASTER_SESSION_CHANGED");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects an online user mismatch before any RPC", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "another-owner" } }, error: null });
    await expect(submitBillingChangeRequest(scope, () => true, clinic, quote)).rejects.toThrow("sessão online");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, {}, { clinic_id: owner, cancellation_quote: quote, plan_quotes: [], requests: [] }])(
    "fails closed for an empty or foreign context: %s", async (data) => {
      response(data); await expect(fetchBillingChangeContext(scope, () => true, clinic)).rejects.toThrow("não confirmou");
    });
  it("discards a response arriving after the active session changes", async () => {
    let current = true;
    rpc.mockImplementation(() => {
      const builder = { setHeader: () => builder, abortSignal: async () => {
        current = false; return { data: request, error: null };
      } }; return builder;
    });
    await expect(submitBillingChangeRequest(scope, () => current, clinic, quote)).rejects.toThrow("MASTER_SESSION_CHANGED");
  });
  it("sends a stale-selection token and returns a pending request rather than a cancellation", async () => {
    response(request); await expect(submitBillingChangeRequest(scope, () => true, clinic, quote)).resolves.toEqual(request);
    expect(rpc).toHaveBeenCalledWith("billing_submit_change_request", { p_clinic_id: clinic, p_subscription_id: sub,
      p_kind: "cancel", p_target_plan_code: null, p_quote_token: quote.quote_token });
  });
  it.each([{ ...request, current_amount_cents: 100 }, { ...request, kind: "change_plan" }, { ...request, provider_environment: "production" }])(
    "does not acknowledge a mismatched submission: %s", async (data) => {
      response(data); await expect(submitBillingChangeRequest(scope, () => true, clinic, quote)).rejects.toThrow("Atualize");
    });
  it("does not acknowledge an ambiguous withdrawal", async () => {
    response(request); await expect(withdrawBillingChangeRequest(scope, () => true, clinic, request)).rejects.toThrow("retirada");
    response({ ...request, status: "withdrawn", withdrawn_at: request.created_at });
    expect((await withdrawBillingChangeRequest(scope, () => true, clinic, request)).status).toBe("withdrawn");
  });
  it("requires refresh after a timeout and aborts the pending transport", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    rpc.mockImplementation(() => { const builder = { setHeader: () => builder, abortSignal: (value: AbortSignal) => {
      signal = value; return new Promise(() => {});
    } }; return builder; });
    const pending = submitBillingChangeRequest(scope, () => true, clinic, quote).catch((error) => error);
    await vi.advanceTimersByTimeAsync(12_001);
    expect(friendlyBillingChangeError(await pending)).toContain("Atualize as solicitações");
    expect(signal?.aborted).toBe(true);
  });
  it("does not contact the RPC after an already-aborted read", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(fetchBillingChangeContext(scope, () => true, clinic, controller.signal)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires a valid pending-only Master queue and isolates session cache keys", async () => {
    response([{ ...request, clinic_name: "Fixture" }]);
    expect(await fetchMasterBillingChangeRequests(scope, () => true, "")).toEqual([{ ...request, clinic_name: "Fixture" }]);
    response([{ ...request, status: "withdrawn", withdrawn_at: request.created_at, clinic_name: "Fixture" }]);
    await expect(fetchMasterBillingChangeRequests(scope, () => true, "")).rejects.toThrow("fila");
    expect(billingChangeContextKey(scope, clinic)).not.toEqual(billingChangeContextKey({ ...scope, sessionId: "login-2", generation: 2 }, clinic));
  });
});

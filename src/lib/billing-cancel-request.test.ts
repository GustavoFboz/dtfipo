// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { executeBillingCancellation } from "./billing-cancel-request";
import type { BillingChangeRequest } from "./billing-change-requests";
const { auth, desktop, native } = vi.hoisted(() => ({ auth: { getSession: vi.fn(), getUser: vi.fn() },
  desktop: vi.fn(), native: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/desktop-local", () => ({ isDentalFlowDesktop: desktop }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: native } }));
const owner = "80600000-0000-4000-8000-000000000010";
const scope = { ownerId: owner, sessionId: "fixture-session", generation: 1 };
const request = { id: "80600000-0000-4000-8000-000000000011", kind: "cancel", status: "awaiting_provider",
  provider_environment: "sandbox" } as BillingChangeRequest;
const reason = "Pedido de encerramento conferido pelo operador";
let fetchMock: ReturnType<typeof vi.fn>;
let session: Session;
beforeEach(() => {
  vi.clearAllMocks(); desktop.mockReturnValue(false); native.mockReturnValue(false);
  vi.stubGlobal("navigator", { onLine: true });
  const exp = Math.floor(Date.now()/1000)+3600;
  session = { user: { id: owner }, expires_at: exp, access_token: `test.${btoa(JSON.stringify({ sub: owner,
    session_id: scope.sessionId, aal: "aal2", exp }))}.test` } as Session;
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, requestId: request.id, environment: "sandbox", status: "completed" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("current-session cancellation adapter", () => {
  it.each(["web", "desktop", "mobile"])("pins the verified AAL2 token on %s without a clinical outbox", async (platform) => {
    desktop.mockReturnValue(platform === "desktop"); native.mockReturnValue(platform === "mobile");
    expect(await executeBillingCancellation(scope, () => true, request, reason, false)).toBe("completed");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(platform === "web" ? "/api/billing/asaas-cancel" : "https://dtfipo.lovable.app/api/billing/asaas-cancel");
    expect(options.headers.Authorization).toBe(`Bearer ${session.access_token}`);
    expect(JSON.parse(options.body)).toEqual({ requestId: request.id, environment: "sandbox", reason, reconcileOnly: false });
  });
  it("cannot mutate offline or with an AAL1/synthetic identity", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(executeBillingCancellation(scope, () => true, request, reason, false)).rejects.toThrow("internet");
    vi.stubGlobal("navigator", { onLine: true });
    session.access_token = `test.${btoa(JSON.stringify({ sub: owner, session_id: scope.sessionId, aal: "aal1", exp: session.expires_at }))}.test`;
    await expect(executeBillingCancellation(scope, () => true, request, reason, false)).rejects.toThrow("MASTER_MFA_REQUIRED");
    session.access_token = "dentalflow-local-device-session";
    await expect(executeBillingCancellation(scope, () => true, request, reason, false)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("forces a reviewed/processing request to read-only reconciliation", async () => {
    await executeBillingCancellation(scope, () => true, { ...request, status: "review_required" }, reason, false);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reconcileOnly).toBe(true);
  });
  it("ignores a result arriving after the active account changes", async () => {
    let current = true;
    fetchMock.mockImplementation(async () => { current = false; return Response.json({ ok: true,
      requestId: request.id, environment: "sandbox", status: "completed" }); });
    await expect(executeBillingCancellation(scope, () => current, request, reason, false)).rejects.toThrow("MASTER_SESSION_CHANGED");
  });
  it("requires refresh after an ambiguous timeout and aborts the client request", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url, options) => { signal = options.signal; return new Promise(() => {}); });
    const result = executeBillingCancellation(scope, () => true, request, reason, false).catch((e) => e);
    await vi.advanceTimersByTimeAsync(12_001);
    expect((await result).code).toBe("DENTALFLOW_DESKTOP_CLOUD_TIMEOUT"); expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([{ ok: true, requestId: "foreign", environment: "sandbox", status: "completed" },
    { ok: true, requestId: request.id, environment: "production", status: "completed" },
    { ok: true, requestId: request.id, environment: "sandbox", status: "paid" }])("refuses unconfirmed responses (%s)", async (result) => {
    fetchMock.mockResolvedValue(Response.json(result));
    await expect(executeBillingCancellation(scope, () => true, request, reason, false)).rejects.toThrow("Atualize");
  });
});

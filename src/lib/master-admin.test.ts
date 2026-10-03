import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { observeMasterSession, type MasterSessionState } from "./auth/master-session";
import { loadMasterDashboard, masterDashboardKey, replayMasterEvent, type MasterReviewEvent } from "./master-admin";

const snapshot = { companies: [{ id: "private", name: "Private operator company" }], queue: {}, recent_payments: [], review_events: [], generated_at: "test" };
const event = { provider_environment: "sandbox", provider_event_id: "test-event" } as MasterReviewEvent;
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
function session(ownerId = "operator", sessionId = "login-1", aal = "aal2"): Session {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  return { user: { id: ownerId }, expires_at, access_token: `test.${btoa(JSON.stringify({ sub: ownerId, session_id: sessionId, exp: expires_at, aal }))}.test` } as Session;
}
async function fixture(initial = session()) {
  let current: Session | null = initial;
  let listener!: (event: AuthChangeEvent, session: Session | null) => void;
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 200 }));
  const client = createClient<Database>("https://master-tests.invalid", "public-test-key", {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  vi.spyOn(client.auth, "getSession").mockImplementation(async () => current
    ? { data: { session: current }, error: null } : { data: { session: null }, error: null });
  vi.spyOn(client.auth, "onAuthStateChange").mockImplementation((callback) => {
    listener = callback; return { data: { subscription: { unsubscribe() {}, id: "test", callback } } };
  });
  let state: MasterSessionState = { ready: false, scope: null };
  const observer = observeMasterSession(client.auth, (next) => { state = next; });
  cleanup.push(observer.dispose); await Promise.resolve();
  return { client, fetcher, observer, get scope() { return state.scope!; },
    emit(event: AuthChangeEvent, next: Session | null) { current = next; listener(event, next); } };
}

describe("Master RPC request/session isolation", () => {
  it("pins the request to the checked JWT and keeps tokens out of cache keys/data", async () => {
    const f = await fixture(); const scope = f.scope;
    const result = await loadMasterDashboard(f.client, scope, f.observer.isCurrent, "", new AbortController().signal);
    const headers = new Headers(f.fetcher.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${session().access_token}`);
    expect(result).toEqual(snapshot);
    expect(JSON.stringify(masterDashboardKey(scope, ""))).not.toContain("test.");
    expect(JSON.stringify(result)).not.toContain("test.");
  });
  it("does not submit a request from a scope invalidated by logout", async () => {
    const f = await fixture(); const scope = f.scope; f.emit("SIGNED_OUT", null);
    await expect(loadMasterDashboard(f.client, scope, f.observer.isCurrent, "", new AbortController().signal)).rejects.toThrow("MASTER_SESSION_CHANGED");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("discards an old response instead of putting it in the account's query cache", async () => {
    const f = await fixture(); const scope = f.scope;
    let finish!: (response: Response) => void; let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    f.fetcher.mockImplementationOnce(() => { started(); return new Promise((resolve) => { finish = resolve; }); });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }); cleanup.push(() => cache.clear());
    const pending = cache.fetchQuery({ queryKey: masterDashboardKey(scope, ""),
      queryFn: ({ signal }) => loadMasterDashboard(f.client, scope, f.observer.isCurrent, "", signal) });
    const rejected = expect(pending).rejects.toThrow("MASTER_SESSION_CHANGED");
    await ready; f.emit("SIGNED_IN", session("other", "login-2"));
    finish(new Response(JSON.stringify(snapshot), { status: 200 })); await rejected;
    expect(cache.getQueryData(masterDashboardKey(scope, ""))).toBeUndefined();
    expect(cache.getQueryData(masterDashboardKey(f.scope, ""))).toBeUndefined();
  });
  it("keeps separate keys when the same user signs in again", async () => {
    const f = await fixture(); const key = masterDashboardKey(f.scope, "");
    f.emit("SIGNED_IN", session("operator", "login-2"));
    expect(masterDashboardKey(f.scope, "")).not.toEqual(key);
  });
  it("respects a canceled query before making a network request", async () => {
    const f = await fixture(); const controller = new AbortController(); controller.abort();
    await expect(loadMasterDashboard(f.client, f.scope, f.observer.isCurrent, "", controller.signal)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("retains the backend denial for an unauthorized account", async () => {
    const f = await fixture(session("other", "login-2"));
    f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code: "P0001", message: "PLATFORM_MASTER_FORBIDDEN" }), { status: 403 }));
    await expect(loadMasterDashboard(f.client, f.scope, f.observer.isCurrent, "", new AbortController().signal)).rejects.toMatchObject({ message: "PLATFORM_MASTER_FORBIDDEN" });
  });
  it("refuses replay after a different session replaced the confirmed one", async () => {
    const f = await fixture(); const scope = f.scope; f.emit("SIGNED_IN", session("operator", "login-2"));
    await expect(replayMasterEvent(f.client, scope, f.observer.isCurrent, event, "Reviewed test-only event")).rejects.toThrow("MASTER_SESSION_CHANGED");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("refuses replay in aal1 before contacting the RPC", async () => {
    const f = await fixture(session("operator", "login-1", "aal1"));
    await expect(replayMasterEvent(f.client, f.scope, f.observer.isCurrent, event, "Reviewed test-only event")).rejects.toThrow("MASTER_MFA_REQUIRED");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});

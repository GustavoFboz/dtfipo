import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { observeMasterSession, requireMasterSession, type MasterSessionState } from "./master-session";

function session(ownerId = "operator", sessionId = "login-1", aal = "aal1", lifetime = 3600): Session {
  const expires_at = Math.floor(Date.now() / 1000) + lifetime;
  const claims = { sub: ownerId, session_id: sessionId, aal, exp: expires_at };
  return { user: { id: ownerId }, access_token: `test.${btoa(JSON.stringify(claims))}.test`, expires_at } as Session;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(initial: Session | null = session()) {
  let current = initial;
  let listener!: (event: AuthChangeEvent, session: Session | null) => void;
  const unsubscribe = vi.fn();
  const result = (): Awaited<ReturnType<Parameters<typeof observeMasterSession>[0]["getSession"]>> =>
    current ? { data: { session: current }, error: null } : { data: { session: null }, error: null };
  const auth = {
    getSession: vi.fn(async () => result()),
    onAuthStateChange: vi.fn((callback) => { listener = callback; return { data: { subscription: { unsubscribe } } }; }),
  };
  return { auth, unsubscribe, emit(event: AuthChangeEvent, next: Session | null) { current = next; listener(event, next); } };
}
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach((dispose) => dispose()); vi.useRealTimers(); });
async function watch(f: ReturnType<typeof fixture>) {
  let state: MasterSessionState = { ready: false, scope: null };
  const observer = observeMasterSession(f.auth as unknown as Parameters<typeof observeMasterSession>[0], (next) => { state = next; });
  cleanup.push(observer.dispose);
  await Promise.resolve();
  return { observer, get state() { return state; } };
}

describe("Master account/session lifecycle", () => {
  it("keeps unauthenticated and device-only sessions outside the dashboard", async () => {
    const f = fixture(null); const w = await watch(f);
    expect(w.state).toEqual({ ready: true, scope: null });
    f.emit("SIGNED_IN", { user: { id: "operator" }, access_token: "local-device-session" } as Session);
    expect(w.state.scope).toBeNull();
  });
  it("does not restore an old storage result after logout", async () => {
    const f = fixture(); const read = deferred<Awaited<ReturnType<typeof f.auth.getSession>>>();
    f.auth.getSession.mockReturnValueOnce(read.promise);
    const w = await watch(f); f.emit("SIGNED_OUT", null);
    read.resolve({ data: { session: session() }, error: null }); await Promise.resolve();
    expect(w.state.scope).toBeNull();
  });
  it("does not replace the new account with an older initial read", async () => {
    const f = fixture(); const read = deferred<Awaited<ReturnType<typeof f.auth.getSession>>>();
    f.auth.getSession.mockReturnValueOnce(read.promise);
    const w = await watch(f); f.emit("SIGNED_IN", session("other", "login-2"));
    read.resolve({ data: { session: session() }, error: null }); await Promise.resolve();
    expect(w.state.scope?.ownerId).toBe("other");
  });
  it("accepts a recovered Desktop cloud session after an empty INITIAL_SESSION", async () => {
    const f = fixture(); const read = deferred<Awaited<ReturnType<typeof f.auth.getSession>>>();
    f.auth.getSession.mockReturnValueOnce(read.promise);
    const w = await watch(f); f.emit("INITIAL_SESSION", null);
    read.resolve({ data: { session: session() }, error: null }); await Promise.resolve();
    expect(w.state.scope?.ownerId).toBe("operator");
  });
  it("invalidates the old scope when the same account starts another session", async () => {
    const f = fixture(); const w = await watch(f); const before = w.state.scope!;
    f.emit("SIGNED_IN", session("operator", "login-2"));
    expect(w.observer.isCurrent(before)).toBe(false);
    expect(w.state.scope?.generation).not.toBe(before.generation);
  });
  it("keeps a real MFA upgrade and ordinary refresh in the same scope", async () => {
    const f = fixture(); const w = await watch(f); const before = w.state.scope!;
    f.emit("SIGNED_IN", session());
    f.emit("MFA_CHALLENGE_VERIFIED", session("operator", "login-1", "aal2"));
    f.emit("TOKEN_REFRESHED", session("operator", "login-1", "aal2", 7200));
    expect(w.state.scope).toBe(before);
    expect(w.observer.isCurrent(before)).toBe(true);
  });
  it("clears the confirmed scope if assurance falls back to aal1", async () => {
    const f = fixture(session("operator", "login-1", "aal2")); const w = await watch(f); const before = w.state.scope!;
    f.emit("TOKEN_REFRESHED", session());
    expect(w.observer.isCurrent(before)).toBe(false);
    expect(w.state.scope).not.toBe(before);
  });
  it("expires the local administrative view and cannot authorize an old operation", async () => {
    vi.useFakeTimers(); const f = fixture(session("operator", "login-1", "aal2", 2));
    const w = await watch(f); const before = w.state.scope!;
    await vi.advanceTimersByTimeAsync(2100);
    expect(w.state.scope).toBeNull();
    await expect(requireMasterSession(f.auth, before, w.observer.isCurrent)).rejects.toThrow("MASTER_SESSION_CHANGED");
  });
  it("rejects a silent account change during the final session check", async () => {
    const f = fixture(); const w = await watch(f); const before = w.state.scope!;
    f.auth.getSession.mockResolvedValueOnce({ data: { session: session("other", "login-2") }, error: null });
    await expect(requireMasterSession(f.auth, before, w.observer.isCurrent)).rejects.toThrow("MASTER_SESSION_CHANGED");
  });
  it("invalidates work and unsubscribes when the view unmounts", async () => {
    const f = fixture(); const w = await watch(f); const before = w.state.scope!; w.observer.dispose();
    expect(w.observer.isCurrent(before)).toBe(false);
    expect(f.unsubscribe).toHaveBeenCalled();
  });
  it("does not let a late MFA result reopen the panel after logout", async () => {
    const f = fixture(); const w = await watch(f);
    f.emit("SIGNED_OUT", null);
    f.emit("MFA_CHALLENGE_VERIFIED", session("operator", "login-1", "aal2"));
    f.emit("SIGNED_IN", session("operator", "login-1", "aal2"));
    expect(w.state.scope).toBeNull();
    f.emit("SIGNED_IN", session("operator", "fresh-login", "aal1"));
    expect(w.state.scope?.sessionId).toBe("fresh-login");
  });
  it("does not accept the previous account's MFA completion in a replacement session", async () => {
    const f = fixture(); const w = await watch(f);
    f.emit("SIGNED_IN", session("other", "login-2"));
    f.emit("MFA_CHALLENGE_VERIFIED", session("operator", "login-1", "aal2"));
    expect(w.state.scope).toBeNull();
  });
});

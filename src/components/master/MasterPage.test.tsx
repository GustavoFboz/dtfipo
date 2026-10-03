// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { MasterPage } from "./MasterPage";

const client = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), getUser: vi.fn(), onAuthStateChange: vi.fn(), mfa: {
    listFactors: vi.fn(), enroll: vi.fn(), challengeAndVerify: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn(), unenroll: vi.fn(),
  } }, rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: client }));
vi.mock("@tanstack/react-router", async () => {
  const { createElement } = await import("react");
  return { Link: ({ to, children }: { to: string; children: React.ReactNode }) => createElement("a", { href: to }, children) };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function session(ownerId = "operator", sessionId = "login-1", aal = "aal1"): Session {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  return { user: { id: ownerId }, expires_at,
    access_token: `test.${btoa(JSON.stringify({ sub: ownerId, session_id: sessionId, aal, exp: expires_at }))}.test` } as Session;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const dashboard = { companies: [{ id: "private", name: "Empresa protegida", billing_exempt: false,
  plan_code: "company_initial", status: "active", current_period_end: null, provider_environment: "sandbox" }],
  queue: {}, recent_payments: [], generated_at: "test", review_events: [{ provider_event_id: "test-event", event_type: "PAYMENT_RECEIVED",
    provider_environment: "sandbox", status: "dead_letter", attempt_count: 1, received_at: "test" }] };
let current: Session | null;
let listeners: Set<(event: AuthChangeEvent, session: Session | null) => void>;
let verifiedFactor: boolean;
let pendingDashboard: ReturnType<typeof deferred<{ data: unknown; error: unknown }>> | null;
let pendingMfa: ReturnType<typeof deferred<void>> | null;
let pendingEnrollment: ReturnType<typeof deferred<void>> | null;
let host: HTMLDivElement;
let root: Root;
let cache: QueryClient;
function emit(event: AuthChangeEvent, next: Session | null) {
  current = next; listeners.forEach((listener) => listener(event, next));
}
const text = () => host.textContent ?? "";
function button(label: string) {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); }
async function click(label: string) { await act(async () => { button(label).click(); }); await settle(); }
async function fill(label: string, value: string) {
  const input = [...host.querySelectorAll("label")].find((item) => item.textContent?.includes(label))?.querySelector("input,textarea");
  if (!input) throw new Error(`Missing field: ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function render() {
  await act(async () => { root.render(createElement(QueryClientProvider, { client: cache }, createElement(MasterPage))); });
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks(); current = session(); listeners = new Set(); verifiedFactor = true;
  pendingDashboard = null; pendingMfa = null; pendingEnrollment = null;
  client.auth.getSession.mockImplementation(async () => ({ data: { session: current }, error: null }));
  client.auth.getUser.mockImplementation(async () => ({ data: { user: current?.user ?? null }, error: null }));
  client.auth.onAuthStateChange.mockImplementation((listener) => {
    listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
  });
  client.auth.mfa.listFactors.mockImplementation(async () => ({ data: {
    totp: verifiedFactor ? [{ id: "factor", status: "verified" }] : [], all: [{ id: "factor", status: verifiedFactor ? "verified" : "unverified" }],
  }, error: null }));
  client.auth.mfa.enroll.mockImplementation(async () => {
    await pendingEnrollment?.promise;
    return { data: { id: "factor", totp: { qr_code: "<svg/>", secret: "only-test-setup-key" } }, error: null };
  });
  client.auth.mfa.challengeAndVerify.mockImplementation(async () => {
    const started = current!; await pendingMfa?.promise;
    const claims = JSON.parse(atob(started.access_token.split(".")[1]));
    emit("MFA_CHALLENGE_VERIFIED", session(started.user.id, claims.session_id, "aal2"));
    return { error: null };
  });
  client.auth.mfa.getAuthenticatorAssuranceLevel.mockImplementation(async () => ({
    data: { currentLevel: current ? JSON.parse(atob(current.access_token.split(".")[1])).aal : "aal1" }, error: null,
  }));
  client.rpc.mockImplementation(() => {
    let ownerId = "";
    const delayed = pendingDashboard; pendingDashboard = null;
    const request = { setHeader(_name: string, value: string) {
      ownerId = JSON.parse(atob(value.split(".")[1])).sub; return request;
    }, abortSignal() { return request; }, then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
      const response = delayed?.promise ?? Promise.resolve(ownerId === "operator"
        ? { data: dashboard, error: null } : { data: null, error: new Error("PLATFORM_MASTER_FORBIDDEN") });
      return response.then(resolve, reject);
    } }; return request;
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => { root.unmount(); }); cache.clear(); host.remove();
});

describe("Master dashboard UI across accounts and sessions", () => {
  it("confirms account MFA while still requiring separate confirmation for replay", async () => {
    await render(); expect(text()).toContain("Empresa protegida");
    await click("Configurar ou confirmar"); await fill("Código de seis dígitos", "123456"); await click("Confirmar identidade");
    expect(text()).toContain("Autenticador confirmado nesta sessão");
    await click("Revisar replay"); await fill("Justificativa", "Revisão autorizada somente para teste");
    expect(button("Enviar para revisão").disabled).toBe(true);
    expect(client.rpc.mock.calls.filter(([name]) => name === "platform_master_replay_asaas_event")).toHaveLength(0);
  });
  it("clears MFA confirmation, selected event and reason in a new session of the same account", async () => {
    await render(); await click("Configurar ou confirmar"); await fill("Código de seis dígitos", "123456"); await click("Confirmar identidade");
    await click("Revisar replay"); await fill("Justificativa", "Justificativa da sessão anterior");
    await fill("Código de seis dígitos", "654321");
    await act(async () => { emit("SIGNED_IN", session("operator", "login-2")); }); await settle();
    expect(text()).toContain("Empresa protegida");
    expect(text()).not.toContain("Autenticador confirmado nesta sessão"); expect(text()).not.toContain("Reprocessar test-event");
    expect(host.querySelector("textarea")).toBeNull();
    await click("Configurar ou confirmar"); expect(host.querySelector<HTMLInputElement>("input[inputmode=numeric]")?.value).toBe("");
  });
  it("removes privileged rows after switching to an unauthorized account", async () => {
    await render(); expect(text()).toContain("Empresa protegida");
    await act(async () => { emit("SIGNED_IN", session("other", "login-2")); }); await settle();
    expect(text()).toContain("Acesso Master indisponível"); expect(text()).not.toContain("Empresa protegida");
    expect(text()).not.toContain("Segurança da conta Master");
  });
  it("does not display a delayed dashboard response from the previous account", async () => {
    const oldRequest = deferred<{ data: unknown; error: unknown }>(); pendingDashboard = oldRequest;
    await render(); expect(text()).not.toContain("Empresa protegida");
    await act(async () => { emit("SIGNED_IN", session("other", "login-2")); }); await settle();
    await act(async () => { oldRequest.resolve({ data: dashboard, error: null }); }); await settle();
    expect(text()).toContain("Acesso Master indisponível"); expect(text()).not.toContain("Empresa protegida");
    expect(cache.getQueryCache().getAll().some((query) => query.state.data)).toBe(false);
  });
  it("does not reopen or confirm the dashboard after a late MFA success following logout", async () => {
    pendingMfa = deferred<void>(); await render(); await click("Configurar ou confirmar");
    await fill("Código de seis dígitos", "123456"); await click("Confirmar identidade");
    expect(client.auth.mfa.challengeAndVerify).toHaveBeenCalledOnce();
    await act(async () => { emit("SIGNED_OUT", null); }); await settle();
    await act(async () => { pendingMfa!.resolve(); }); await settle();
    expect(text()).toContain("Acesso Master indisponível");
    expect(text()).not.toContain("Empresa protegida"); expect(text()).not.toContain("Autenticador confirmado");
  });
  it("never renders an enrollment key returned after an account switch", async () => {
    verifiedFactor = false; pendingEnrollment = deferred<void>(); await render();
    await click("Configurar ou confirmar"); await click("Configurar autenticador");
    expect(client.auth.mfa.enroll).toHaveBeenCalledOnce();
    await act(async () => { emit("SIGNED_IN", session("other", "login-2")); pendingEnrollment!.resolve(); }); await settle();
    expect(host.querySelector("img")).toBeNull(); expect(host.querySelector("input[readonly]")).toBeNull();
    expect(host.innerHTML).not.toContain("only-test-setup-key");
  });
  it("keeps pending enrollment on a repeated sign-in event for the same session", async () => {
    verifiedFactor = false; await render(); await click("Configurar ou confirmar"); await click("Configurar autenticador");
    expect(host.querySelector("input[readonly]")).not.toBeNull();
    await act(async () => { emit("SIGNED_IN", session()); }); await settle();
    expect(host.querySelector("input[readonly]")).not.toBeNull(); expect(client.auth.mfa.enroll).toHaveBeenCalledOnce();
  });
});

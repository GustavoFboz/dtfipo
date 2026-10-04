// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route as ResetRoute } from "./auth.reset";
import { Route as AuthRoute } from "./auth";

const mocks = vi.hoisted(() => ({
  update: vi.fn(), signin: vi.fn(), signup: vi.fn(), navigate: vi.fn(),
  error: vi.fn(), success: vi.fn(),
  plans: { data: [] as Record<string, unknown>[], isPending: false },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: mocks.update, signInWithPassword: mocks.signin, signUp: mocks.signup } },
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...await original<object>(),
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => mocks.navigate, useSearch: () => ({}), redirect: vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => createElement("a", { href: to }, children),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.plans }));
vi.mock("@/lib/subscriptions", () => ({
  fetchBillingPlans: vi.fn(), finalizePendingOnboarding: vi.fn(), validateCompanyInviteCode: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({ error: null });
  mocks.signin.mockResolvedValue({ error: { message: "Login refused by fixture" } });
  mocks.plans.data = [{ code: "company_initial", name: "Inicial", monthly_price_cents: 100, max_sessions: 1 }];
  mocks.plans.isPending = false;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(route: unknown) {
  const component = (route as { component: React.ComponentType & { preload?: () => Promise<unknown> } }).component;
  await component.preload?.();
  await act(async () => root.render(createElement(component)));
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
async function signupTab() {
  const button = [...host.querySelectorAll("button")].find((el) => el.textContent === "Criar conta")!;
  await act(async () => button.click());
}

describe("password boundaries in the actual auth forms", () => {
  it.each(["abcdef", "abcdefg", "😀😀😀😀"])("rejects %s before Auth even if native form validation is bypassed", async (password) => {
    await render(ResetRoute);
    expect(host.querySelector("input")!.minLength).toBe(8);
    await fill(host.querySelector("input")!, password); await submit();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("A senha deve ter pelo menos 8 caracteres.");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("sends an eight-character credential unchanged and confirms only an Auth success", async () => {
    await render(ResetRoute); await fill(host.querySelector("input")!, " 123456 "); await submit();
    expect(mocks.update).toHaveBeenCalledWith({ password: " 123456 " });
    expect(mocks.success).toHaveBeenCalled(); expect(mocks.navigate).toHaveBeenCalled();
  });
  it.each(["reply", "throw"])("restores the submit button after Auth failure: %s", async (failure) => {
    if (failure === "reply") mocks.update.mockResolvedValue({ error: { message: "Auth unavailable" } });
    else mocks.update.mockRejectedValue(new Error("Network failed"));
    await render(ResetRoute); await fill(host.querySelector("input")!, "abcdefgh"); await submit();
    expect(mocks.error).toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });
  it("lets an existing short credential reach Auth instead of blocking legacy login in the browser", async () => {
    await render(AuthRoute);
    const password = host.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    expect(password.hasAttribute("minlength")).toBe(false);
    await fill(password, "abcdef"); await fill(host.querySelector<HTMLInputElement>('input[type="email"]')!, "fixture@example.invalid");
    await submit(); expect(mocks.signin).toHaveBeenCalledWith({ email: "fixture@example.invalid", password: "abcdef" });
  });
  it("applies the same short-password guard to signup before account creation", async () => {
    await render(AuthRoute); await signupTab();
    await fill(host.querySelector<HTMLInputElement>('input[autocomplete="name"]')!, "Fixture User");
    await fill(host.querySelector<HTMLInputElement>('input[autocomplete="new-password"]')!, "abcdefg");
    await submit(); expect(mocks.signup).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("A senha deve ter pelo menos 8 caracteres.");
  });
});

describe("authoritative signup plan amounts", () => {
  it.each([100, 1250])("shows the current backend amount %s rather than a former hardcoded offer", async (amount) => {
    mocks.plans.data[0].monthly_price_cents = amount;
    await render(AuthRoute); await signupTab();
    const expected = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount / 100) + "/mês";
    expect(host.textContent).toContain(expected); expect(host.textContent).not.toContain("249/mês");
  });
  it("does not invent a price while the plan catalogue is unavailable", async () => {
    mocks.plans.data = []; await render(AuthRoute); await signupTab();
    expect(host.textContent).toContain("Valor indisponível"); expect(host.textContent).not.toContain("249/mês");
  });
});

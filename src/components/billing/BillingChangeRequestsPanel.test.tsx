// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingChangeRequests } from "./BillingChangeRequestsPanel";
import type { BillingChangeQuote } from "@/lib/billing-change-requests";
const { fetchContext, submit, withdraw, confirm, success, error } = vi.hoisted(() => ({
  fetchContext: vi.fn(), submit: vi.fn(), withdraw: vi.fn(), confirm: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/lib/billing-change-requests", async (original) => ({ ...await original<object>(),
  fetchBillingChangeContext: fetchContext, submitBillingChangeRequest: submit, withdrawBillingChangeRequest: withdraw }));
vi.mock("@/lib/confirm", () => ({ confirm }));
vi.mock("sonner", () => ({ toast: { success, error } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const quote = { subscription_id: "sub", kind: "cancel", current_plan_name: "Avançado", current_amount_cents: 74900,
  currency: "BRL", paid_period_end: "2040-01-01T00:00:00Z", provider_environment: "sandbox",
  target_plan_code: null, target_plan_name: null, target_amount_cents: null, block_reason: null,
  quote_token: "a".repeat(32) } as BillingChangeQuote;
const plan = { ...quote, kind: "change_plan", target_plan_code: "growth", target_plan_name: "Crescimento", target_amount_cents: 44900,
  target_max_members: 20, target_max_sessions: 2, target_storage_bytes: 107374182400 } as BillingChangeQuote;
const pending = { id: "request", ...quote, status: "awaiting_provider", effective_not_before: quote.paid_period_end,
  created_at: "2026-10-03T23:35:00Z", withdrawn_at: null };
const context = { clinic_id: "company-a", cancellation_quote: quote, plan_quotes: [plan], requests: [] };
let host: HTMLDivElement; let root: Root; let cache: QueryClient; let current: boolean;
const scope = { ownerId: "owner-a", sessionId: "login-a", generation: 1 };
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>((done) => { resolve = done; }), resolve: (v: T) => resolve(v) }; }
async function settle() { await act(async () => { await new Promise((done) => setTimeout(done, 20)); }); }
async function render(next = scope) {
  await act(async () => { root.render(createElement(QueryClientProvider, { client: cache },
    createElement(BillingChangeRequests, { key: next.generation, clinicId: "company-a", scope: next, isCurrent: () => current }))); }); await settle();
}
function button(label: string) { const el = [...host.querySelectorAll<HTMLButtonElement>("button")].find((e) => e.textContent === label);
  if (!el) throw new Error(`Missing button ${label}`); return el; }
async function click(label: string) { await act(async () => { button(label).click(); }); await settle(); }
beforeEach(() => {
  vi.clearAllMocks(); current = true; confirm.mockResolvedValue(false); fetchContext.mockResolvedValue(context);
  submit.mockResolvedValue(pending); withdraw.mockResolvedValue({ ...pending, status: "withdrawn" });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); });
describe("customer billing requests", () => {
  it("shows the contracted price and waits for explicit confirmation", async () => {
    await render(); expect(host.textContent).toContain("749/mês");
    await click("Solicitar cancelamento"); expect(confirm).toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  });
  it("records a request and keeps it explicitly awaiting Asaas confirmation", async () => {
    confirm.mockResolvedValue(true); fetchContext.mockResolvedValueOnce(context).mockResolvedValue({ ...context, requests: [pending] });
    await render(); await click("Solicitar cancelamento");
    expect(submit).toHaveBeenCalledWith(scope, expect.any(Function), "company-a", quote);
    expect(host.textContent).toContain("Aguardando confirmação no Asaas");
    expect(host.textContent).not.toContain("Solicitar troca de plano");
    expect(button("Retirar solicitação").disabled).toBe(false);
  });
  it("blocks a plan that is incompatible with usage", async () => {
    fetchContext.mockResolvedValue({ ...context, plan_quotes: [{ ...plan, block_reason: "storage_limit" }] }); await render();
    const select = host.querySelector("select")!;
    await act(async () => { select.value = "growth"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
    expect(host.textContent).toContain("envios pendentes excedem");
    expect(button("Solicitar troca de plano").disabled).toBe(true); expect(submit).not.toHaveBeenCalled();
  });
  it("keeps the request visible when withdrawal is refused by the server", async () => {
    fetchContext.mockResolvedValue({ ...context, requests: [pending] }); confirm.mockResolvedValue(true);
    withdraw.mockRejectedValue(new Error("BILLING_CHANGE_REVIEW_REQUIRED")); await render(); await click("Retirar solicitação");
    expect(error).toHaveBeenCalledWith("Esta solicitação precisa de revisão. Atualize as solicitações."); expect(host.textContent).toContain("Cancelamento solicitado");
    expect(success).not.toHaveBeenCalled();
  });
  it("does not send a confirmation from a retired session", async () => {
    const delayed = deferred<boolean>(); confirm.mockReturnValue(delayed.promise); await render(); await click("Solicitar cancelamento");
    current = false; fetchContext.mockResolvedValue({ ...context, cancellation_quote: null });
    await render({ ...scope, ownerId: "owner-b", sessionId: "login-b", generation: 2 });
    await act(async () => delayed.resolve(true)); await settle(); expect(submit).not.toHaveBeenCalled();
  });
  it("does not display a late response from another session", async () => {
    const delayed = deferred<typeof context>(); fetchContext.mockReturnValueOnce(delayed.promise); await render();
    fetchContext.mockResolvedValue({ ...context, cancellation_quote: null });
    await render({ ...scope, ownerId: "owner-b", sessionId: "login-b", generation: 2 });
    await act(async () => delayed.resolve(context)); await settle(); expect(host.textContent).not.toContain("Contrato atual");
  });
  it("shows a bounded unavailable state without offering financial actions", async () => {
    fetchContext.mockRejectedValue(new Error("Conecte-se à internet")); await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("internet");
    expect(host.querySelector("select")).toBeNull(); expect(submit).not.toHaveBeenCalled();
  });
});

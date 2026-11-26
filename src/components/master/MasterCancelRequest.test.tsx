// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MasterCancelRequest } from "./MasterCancelRequest";
import type { MasterBillingChangeRequest } from "@/lib/billing-change-requests";
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/billing-cancel-request", () => ({ executeBillingCancellation: execute }));
vi.mock("./MasterMfaChallenge", () => ({ MasterMfaChallenge: ({ onVerified }: { onVerified: () => void }) =>
  createElement("button", { onClick: onVerified }, "Confirmar MFA de teste") }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const request = { id: "request", kind: "cancel", status: "awaiting_provider", clinic_name: "Fixture", provider_environment: "sandbox" } as MasterBillingChangeRequest;
const scope = { ownerId: "master", sessionId: "session-a", generation: 1 };
let root: Root; let host: HTMLDivElement; let cache: QueryClient; let current: boolean;
const completed = vi.fn();
const settle = () => new Promise((r) => setTimeout(r, 10));
async function render(r = request) {
  await act(async () => { root.render(createElement(QueryClientProvider, { client: cache }, createElement(MasterCancelRequest,
    { request: r, scope, isCurrent: () => current, onClose: () => {}, onCompleted: completed }))); await settle(); });
}
const button = (text: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text)!;
async function click(text: string) { await act(async () => { button(text).click(); await settle(); }); }
async function confirmFields() {
  await act(async () => { host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    const field = host.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(field, "Pedido de cancelamento conferido pelo operador");
    field.dispatchEvent(new Event("input", { bubbles: true })); await settle(); });
}
beforeEach(() => {
  vi.clearAllMocks(); current = true; execute.mockResolvedValue("completed");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); });
describe("explicit Master cancellation review", () => {
  it("keeps execution disabled until its own MFA and confirmation", async () => {
    await render(); await confirmFields(); expect(button("Confirmar cancelamento").disabled).toBe(true);
    await click("Confirmar MFA de teste"); expect(button("Confirmar cancelamento").disabled).toBe(false);
    await click("Confirmar cancelamento"); expect(execute).toHaveBeenCalledWith(scope, expect.any(Function), request,
      "Pedido de cancelamento conferido pelo operador", false); expect(completed).toHaveBeenCalledWith("completed");
  });
  it("uses a read-only review for an interrupted request", async () => {
    const reviewed = { ...request, status: "review_required" as const };
    await render(reviewed); await confirmFields(); await click("Confirmar MFA de teste"); await click("Conferir no Asaas");
    expect(execute).toHaveBeenCalledWith(scope, expect.any(Function), reviewed, expect.any(String), true);
  });
  it("does not acknowledge a late result in a retired session", async () => {
    let resolve!: (value: string) => void; execute.mockReturnValue(new Promise((r) => { resolve = r; }));
    await render(); await confirmFields(); await click("Confirmar MFA de teste"); await click("Confirmar cancelamento");
    current = false; await act(async () => { resolve("completed"); await settle(); }); expect(completed).not.toHaveBeenCalled();
  });
  it("keeps an unconfirmed result in review instead of saying completed", async () => {
    execute.mockResolvedValue("review_required"); await render(); await confirmFields(); await click("Confirmar MFA de teste");
    await click("Confirmar cancelamento"); expect(completed).toHaveBeenCalledWith("review_required");
    expect(host.textContent).toContain("pedido permanece em revisão");
  });
});

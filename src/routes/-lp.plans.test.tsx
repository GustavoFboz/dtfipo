// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./lp";

const mocks = vi.hoisted(() => ({ plans: vi.fn() }));
vi.mock("@/lib/subscriptions", () => ({ fetchBillingPlans: mocks.plans }));
vi.mock("@/lib/mobile/native", () => ({ isNativeMobileApp: () => false }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...await original<object>(),
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => createElement("a", { href: to }, children),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement; let root: Root; let client: QueryClient;
const catalog = (amount = 100) => [
  { code: "company_initial", monthly_price_cents: amount, currency: "BRL" },
  { code: "company_growth", monthly_price_cents: 44900, currency: "BRL" },
  { code: "company_advanced", monthly_price_cents: 74900, currency: "BRL" },
];
const money = (amount: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount / 100);
const cards = () => [...host.querySelectorAll<HTMLDivElement>("#planos .grid > div")];
beforeEach(() => {
  vi.clearAllMocks(); mocks.plans.mockResolvedValue(catalog());
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });
async function render() {
  const component = (Route as unknown as { component: React.ComponentType }).component;
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(component))));
}
async function until(check: () => boolean) {
  for (let i = 0; i < 40 && !check(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  expect(check()).toBe(true);
}

describe("landing plan catalog", () => {
  it.each([100, 1250])("renders the current catalog amount %s and preserves the selected plan", async amount => {
    mocks.plans.mockResolvedValue(catalog(amount)); await render();
    await until(() => !!cards()[0]?.textContent?.includes(money(amount)));
    expect(cards()[0].textContent).not.toContain(money(24900));
    expect(cards()[0].querySelector("a")?.getAttribute("href")).toBe("/auth?mode=company&plan=company_initial");
    expect(cards()[1].textContent).toContain(money(44900));
    expect(cards()[2].textContent).toContain(money(74900));
  });
  it("shows a pending state without a fabricated price or plan selection", async () => {
    mocks.plans.mockReturnValue(new Promise(() => {})); await render();
    expect(cards()[0].textContent).toContain("Carregando preço…");
    expect(cards()[0].textContent).not.toMatch(/R\$/);
    expect(cards()[0].querySelector("a")).toBeNull();
    expect(cards()[0].querySelector("button")?.disabled).toBe(true);
  });
  it.each([-100, 100.5])("does not advertise an invalid amount %s", async amount => {
    mocks.plans.mockResolvedValue(catalog(amount)); await render();
    await until(() => !!cards()[0]?.textContent?.includes("Valor indisponível"));
    expect(cards()[0].querySelector("a")).toBeNull();
  });
  it("does not replace a missing plan with its former price", async () => {
    mocks.plans.mockResolvedValue(catalog().slice(1)); await render();
    await until(() => !!cards()[0]?.textContent?.includes("Valor indisponível"));
    expect(cards()[0].textContent).not.toContain(money(24900));
    expect(cards()[1].querySelector("a")).not.toBeNull();
  });
  it("hides stale prices on a failed refresh and lets the visitor retry", async () => {
    await render(); await until(() => !!cards()[0]?.textContent?.includes(money(100)));
    mocks.plans.mockRejectedValue(new Error("Catalog unavailable"));
    await act(async () => { await client.refetchQueries({ queryKey: ["billing_plans", "company"] }); });
    await until(() => host.textContent!.includes("Atualizar preços"));
    expect(cards()[0].textContent).toContain("Valor indisponível");
    expect(cards()[0].textContent).not.toContain(money(100));
    expect(cards()[0].querySelector("a")).toBeNull();
    mocks.plans.mockResolvedValue(catalog(1250));
    const retry = [...host.querySelectorAll("button")].find(b => b.textContent === "Atualizar preços")!;
    await act(async () => retry.click()); await until(() => !!cards()[0]?.textContent?.includes(money(1250)));
    expect(cards()[0].querySelector("a")).not.toBeNull();
  });
});

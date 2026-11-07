// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageUploadReservations } from "./StorageUploadReservations";
import type { ManagedStorageFile } from "@/lib/storage";

const { list, release, refresh, confirm, errorToast } = vi.hoisted(() => ({
  list: vi.fn(), release: vi.fn(), refresh: vi.fn(), confirm: vi.fn(), errorToast: vi.fn(),
}));
vi.mock("@/lib/confirm", () => ({ confirm }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: errorToast } }));
vi.mock("@/lib/storage", async (original) => ({
  ...await original<object>(), fetchStorageUploadReservations: list,
  releaseStorageUploadReservation: release, refreshStorageUsage: refresh,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement; let cache: QueryClient;
const old = { id: "old", original_name: "teste-abandonado.stl", size_bytes: 100, status: "reserved",
  clinic_id: "company-a", created_at: "2026-01-01T00:00:00Z" } as ManagedStorageFile;
const recent = { ...old, id: "recent", original_name: "teste-recente.stl", created_at: new Date().toISOString() };
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
async function settle() { await act(async () => { await new Promise((done) => setTimeout(done, 20)); }); }
async function render(ownerId = "admin-a", clinicId = "company-a") {
  await act(async () => { root.render(createElement(QueryClientProvider, { client: cache },
    createElement(StorageUploadReservations, { key: `${ownerId}:${clinicId}`, ownerId, clinicId }))); });
  await settle();
}
function button(label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`); return found;
}
async function click(label: string) { await act(async () => { button(label).click(); }); await settle(); }
beforeEach(() => {
  vi.clearAllMocks(); list.mockResolvedValue([old, recent]); release.mockResolvedValue({ released: true, releasedBytes: 100 });
  refresh.mockResolvedValue(undefined); confirm.mockResolvedValue(false);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); vi.unstubAllGlobals(); });

describe("pending uploads in storage management", () => {
  it("protects recent uploads and waits for explicit confirmation", async () => {
    await render(); expect(button("Envio recente").disabled).toBe(true);
    await click("Liberar espaço"); expect(confirm).toHaveBeenCalled(); expect(release).not.toHaveBeenCalled();
    expect(host.textContent).toContain(old.original_name); expect(refresh).not.toHaveBeenCalled();
  });
  it("keeps the row and quota while validation is pending, then refreshes after confirmation", async () => {
    const pending = deferred<{ released: boolean; releasedBytes: number }>(); release.mockReturnValue(pending.promise);
    confirm.mockResolvedValue(true); await render(); await click("Liberar espaço");
    expect(host.textContent).toContain(old.original_name); expect(button("Verificando…").disabled).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    list.mockResolvedValue([recent]); await act(async () => pending.resolve({ released: true, releasedBytes: 100 })); await settle();
    expect(host.textContent).not.toContain(old.original_name); expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("preserves the pending row and displays a rejected server validation", async () => {
    release.mockRejectedValue(new Error("O arquivo já existe.")); confirm.mockResolvedValue(true);
    await render(); await click("Liberar espaço");
    expect(host.textContent).toContain(old.original_name); expect(errorToast).toHaveBeenCalledWith("O arquivo já existe.");
    expect(refresh).not.toHaveBeenCalled(); expect(button("Liberar espaço").disabled).toBe(false);
  });
  it("does not display a late response from another company", async () => {
    const pending = deferred<ManagedStorageFile[]>(); list.mockImplementation((id) => id === "company-a" ? pending.promise : Promise.resolve([]));
    await render(); await render("admin-b", "company-b");
    await act(async () => pending.resolve([old])); await settle();
    expect(host.textContent).not.toContain(old.original_name); expect(host.textContent).toContain("Nenhum envio pendente");
  });
  it("does not submit an old confirmation after switching accounts", async () => {
    const pending = deferred<boolean>(); confirm.mockReturnValue(pending.promise);
    await render(); await click("Liberar espaço");
    list.mockResolvedValue([]); await render("admin-b", "company-b");
    await act(async () => pending.resolve(true)); await settle(); expect(release).not.toHaveBeenCalled();
  });
  it("shows a readable unavailable state without hiding the rest of storage", async () => {
    list.mockRejectedValue(new Error("offline")); await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Conecte-se à internet");
    expect(release).not.toHaveBeenCalled(); expect(button("Atualizar envios").disabled).toBe(false);
  });
});

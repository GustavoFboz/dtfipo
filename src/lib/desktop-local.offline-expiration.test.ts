import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), mobile: vi.fn(() => false), mobileGet: vi.fn(), clearMobile: vi.fn() }));
vi.mock("@/lib/mobile/local-runtime", () => ({ isNativeMobileLocalRuntime: mocks.mobile, mobileGetIdentity: mocks.mobileGet }));
vi.mock("./mobile/native", () => ({ clearMobilePrivateBrowserCache: mocks.clearMobile }));
import { getProvisionedDesktopIdentity } from "./desktop-local";
import { MAX_OFFLINE_ACCESS_MS, OFFLINE_ACCESS_EXPIRED_EVENT } from "./offline-access-policy";

const now = Date.parse("2026-10-05T12:00:00Z");
const pendingKey = "dentalflow:offline-browser-cleanup-pending";
function storage() {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k), clear: vi.fn(() => data.clear()) };
}
const expired = { user_id: "expired-owner", validated_at: now - MAX_OFFLINE_ACCESS_MS, valid_until: now, email: null, full_name: null, clinic_id: null };
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(now);
  mocks.mobile.mockReturnValue(false); mocks.clearMobile.mockResolvedValue(undefined);
  mocks.invoke.mockImplementation(async (command) => command === "device_identity_get" ? expired : undefined);
  vi.stubGlobal("window", { __TAURI__: { core: { invoke: mocks.invoke } },
    localStorage: storage(), sessionStorage: storage(), dispatchEvent: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("expired installed identities cannot reach local-first callers", () => {
  it("returns null, removes clinical drafts and asks the native runtime to clear browser data", async () => {
    window.localStorage.setItem("stock-item-draft:private", "clinical");
    window.localStorage.setItem("df-theme", "dark");
    window.sessionStorage.setItem("case", "clinical");
    expect(await getProvisionedDesktopIdentity()).toBeNull();
    expect(mocks.invoke).toHaveBeenCalledWith("desktop_clear_private_webview_cache", undefined);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.getItem("stock-item-draft:private")).toBeNull();
    expect(window.localStorage.getItem("df-theme")).toBe("dark");
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: OFFLINE_ACCESS_EXPIRED_EVENT }));
  });
  it("keeps a retry receipt and refuses access when native browser cleanup fails", async () => {
    mocks.invoke.mockImplementation(async (command) => {
      if (command === "device_identity_get") return expired;
      throw new Error("Native cache unavailable");
    });
    await expect(getProvisionedDesktopIdentity()).rejects.toThrow("Native cache unavailable");
    expect(window.localStorage.getItem(pendingKey)).toBe("expired-owner");
    mocks.invoke.mockImplementation(async (command) => command === "device_identity_get" ? null : undefined);
    expect(await getProvisionedDesktopIdentity()).toBeNull();
    expect(window.localStorage.getItem(pendingKey)).toBeNull();
  });
  it("does not clear an unexpired owner's data", async () => {
    const valid = { ...expired, validated_at: now - 1, valid_until: now + MAX_OFFLINE_ACCESS_MS - 1 };
    mocks.invoke.mockResolvedValue(valid);
    expect(await getProvisionedDesktopIdentity()).toBe(valid);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
  it("uses the same expiration contract on mobile", async () => {
    mocks.mobile.mockReturnValue(true); mocks.mobileGet.mockResolvedValue(expired);
    expect(await getProvisionedDesktopIdentity()).toBeNull();
    expect(mocks.clearMobile).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

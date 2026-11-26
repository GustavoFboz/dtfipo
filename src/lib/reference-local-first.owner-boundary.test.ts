import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  installed: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  owner: vi.fn(),
  identity: vi.fn(),
  canCloud: vi.fn(),
}));
vi.mock("./api", () => ({ fetchProfile: mocks.profile }));
vi.mock("./desktop-local", () => ({
  isDentalFlowDesktop: mocks.installed,
  localCacheGet: mocks.get,
  localCachePut: mocks.put,
}));
vi.mock("./desktop-identity", () => ({
  resolveDesktopOwnerId: mocks.owner,
  resolveDesktopIdentity: mocks.identity,
  canUseDentalFlowCloud: mocks.canCloud,
}));
import { fetchProfileLocalFirst } from "./reference-local-first";

const profile = (id: string, clinic_id = "clinic-a") => ({ id, clinic_id, full_name: "Fixture", role: "USER" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
  mocks.installed.mockReturnValue(true);
  mocks.owner.mockResolvedValue("account-a");
  mocks.identity.mockImplementation(async () => ({ userId: "account-a", source: "cloud" }));
  mocks.canCloud.mockResolvedValue(true);
  mocks.put.mockResolvedValue(undefined);
  mocks.get.mockResolvedValue(null);
  mocks.profile.mockResolvedValue(profile("account-a"));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("installed account-specific reference snapshots", () => {
  it("accepts only a profile matching the owner and caches it under that owner", async () => {
    const result = await fetchProfileLocalFirst();
    expect(result?.id).toBe("account-a");
    expect(mocks.put).toHaveBeenCalledWith("account-a", "reference-data:v1", "profile", result);
  });

  it("drops a late A request after active cloud login changes to B", async () => {
    let release!: (value: unknown) => void;
    mocks.profile.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = fetchProfileLocalFirst();
    await vi.waitFor(() => expect(mocks.profile).toHaveBeenCalledTimes(1));
    mocks.identity.mockImplementation(async () => ({ userId: "account-b", source: "cloud" }));
    release(profile("account-a"));
    await expect(pending).rejects.toThrow("REFERENCE_OWNER_CHANGED");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rejects a response for another profile even when the session still reports A", async () => {
    mocks.profile.mockResolvedValue(profile("account-b", "clinic-b"));
    await expect(fetchProfileLocalFirst()).rejects.toThrow("REFERENCE_PROFILE_MISMATCH");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("blocks B from reading a cached profile in the still-provisioned A namespace", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    mocks.identity.mockResolvedValue({ userId: "account-b", source: "cloud" });
    mocks.get.mockResolvedValue({ payload: profile("account-a") });
    await expect(fetchProfileLocalFirst()).rejects.toThrow("REFERENCE_OWNER_CHANGED");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("rejects a poisoned cached profile with a mismatched account id", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    mocks.identity.mockResolvedValue({ userId: "account-a", source: "device" });
    mocks.get.mockResolvedValue({ payload: profile("account-b", "clinic-b") });
    await expect(fetchProfileLocalFirst()).rejects.toThrow("REFERENCE_PROFILE_MISMATCH");
  });

  it("allows a previously authorized device A to read A's local profile offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    mocks.identity.mockResolvedValue({ userId: "account-a", source: "device" });
    mocks.get.mockResolvedValue({ payload: profile("account-a") });
    const result = await fetchProfileLocalFirst();
    expect(result?.id).toBe("account-a");
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("refuses a late local cache read after native owner changes before resolution", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    mocks.identity.mockResolvedValue({ userId: "account-a", source: "device" });
    let release!: (value: unknown) => void;
    mocks.get.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = fetchProfileLocalFirst();
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
    mocks.owner.mockResolvedValue("account-b");
    release({ payload: profile("account-a") });
    await expect(pending).rejects.toThrow("REFERENCE_OWNER_CHANGED");
  });
});

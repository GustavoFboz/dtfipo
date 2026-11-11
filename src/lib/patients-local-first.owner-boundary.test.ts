import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(), requireOwner: vi.fn(), identity: vi.fn(),
  installed: vi.fn(), get: vi.fn(), put: vi.fn(), enqueue: vi.fn(),
  pending: vi.fn(), profile: vi.fn(), create: vi.fn(), select: vi.fn(),
}));
vi.mock("@/lib/desktop-identity", () => ({
  resolveDesktopOwnerId: mocks.owner,
  requireDesktopOwnerId: mocks.requireOwner,
  resolveDesktopIdentity: mocks.identity,
}));
vi.mock("@/lib/desktop-local", () => ({
  isDentalFlowDesktop: mocks.installed,
  localCacheGet: mocks.get, localCachePut: mocks.put,
  localCacheDelete: vi.fn(), enqueueOutbox: mocks.enqueue,
  getPendingOutbox: mocks.pending, clearDoneOutbox: vi.fn(),
  markOutbox: vi.fn(),
}));
vi.mock("./reference-local-first", () => ({ fetchProfileLocalFirst: mocks.profile }));
vi.mock("./creation-rpc", () => ({ createPatientConfirmed: mocks.create }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: (...args: unknown[]) => mocks.select(...args),
      }),
    }),
  },
}));
import { fetchPatientsLocalFirst, savePatientLocalFirst, syncPendingPatientChanges } from "./patients-local-first";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { onLine: false });
  mocks.installed.mockReturnValue(true);
  mocks.owner.mockResolvedValue("actor-a");
  mocks.requireOwner.mockResolvedValue("actor-a");
  mocks.identity.mockResolvedValue({ userId: "actor-a", source: "device" });
  mocks.profile.mockResolvedValue({ id: "actor-a", clinic_id: "company-a" });
  mocks.get.mockResolvedValue({ payload: [] });
  mocks.put.mockResolvedValue(undefined);
  mocks.enqueue.mockResolvedValue("queued");
  mocks.pending.mockResolvedValue([]);
  mocks.select.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("patient creation and cache remain scoped to the active user", () => {
  it("rejects a cached or cloud profile belonging to a different actor", async () => {
    mocks.profile.mockResolvedValue({ id: "actor-b", clinic_id: "company-b" });
    await expect(savePatientLocalFirst({ name: "Fictitious patient" })).rejects.toThrow("PATIENT_PROFILE_OWNER_MISMATCH");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("offline creation stores an explicit verified company in the owner's outbox", async () => {
    const result = await savePatientLocalFirst({ name: "Fictitious patient", clinic_id: "company-b" }, null,
      { key: "attempt-test", patientId: "synthetic-id" });
    expect(result.queued).toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "actor-a", entityType: "patients", operation: "create",
      payload: expect.objectContaining({
        id: "synthetic-id", clinic_id: "company-a", idempotency_key: "attempt-test",
      }),
    }));
  });

  it("refuses creation if the active owner switches while the profile loads", async () => {
    mocks.profile.mockImplementation(async () => {
      mocks.requireOwner.mockResolvedValue("actor-b");
      return { id: "actor-a", clinic_id: "company-a" };
    });
    await expect(savePatientLocalFirst({ name: "Fictitious patient" })).rejects.toThrow("PATIENT_OWNER_CHANGED");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("never sends A's queued patient writes using B's cloud session", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    mocks.identity.mockResolvedValue({ userId: "actor-b", source: "cloud" });
    await expect(syncPendingPatientChanges()).resolves.toEqual({ processed: 0, failed: 0, conflicts: 0 });
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not cache a delayed patient list after the cloud actor changes", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    mocks.identity.mockResolvedValue({ userId: "actor-a", source: "cloud" });
    let release!: (response: unknown) => void;
    mocks.select.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = fetchPatientsLocalFirst();
    await vi.waitFor(() => expect(mocks.select).toHaveBeenCalledOnce());
    mocks.identity.mockResolvedValue({ userId: "actor-b", source: "cloud" });
    release({ data: [{ id: "patient-a", name: "Fixture" }], error: null });
    await expect(pending).rejects.toThrow("PATIENT_OWNER_CHANGED");
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

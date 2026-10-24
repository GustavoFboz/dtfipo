import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedStorageFile } from "./storage";

const { rpc, remove, from, query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
  return { rpc: vi.fn(), remove: vi.fn(), from: vi.fn(() => query), query };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, from, storage: { from: () => ({ remove }) } },
}));
vi.mock("@/lib/desktop-local", () => ({
  isDentalFlowDesktop: () => false, localCacheGet: vi.fn(), localCachePut: vi.fn(),
}));
vi.mock("@/lib/desktop-identity", () => ({ resolveDesktopOwnerId: vi.fn() }));

const upload = {
  sizeBytes: 100, bucket: "case-files", objectPath: "case/file.stl",
  sourceType: "case_attachment", originalName: "file.stl",
};

describe("mandatory storage reservations", () => {
  beforeEach(() => { vi.resetModules(); rpc.mockReset(); remove.mockReset(); });

  it("rejects a missing reservation backend and restores the visible usage", async () => {
    const storage = await import("./storage");
    rpc.mockResolvedValueOnce({ data: { used_bytes: 300, limit_bytes: 1000 }, error: null });
    await storage.refreshStorageUsage();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "schema cache" } });
    await expect(storage.reserveStorageUpload(upload)).rejects.toThrow("reserva de armazenamento está indisponível");
    expect(storage.getStorageUsageSnapshot().data?.used_bytes).toBe(300);
  });

  it("rejects an empty success response instead of allowing an unreserved upload", async () => {
    const storage = await import("./storage");
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(storage.reserveStorageUpload(upload)).rejects.toThrow("confirmar a reserva");
  });

  it("returns the authoritative reservation ID with quota enforcement", async () => {
    const storage = await import("./storage");
    rpc.mockResolvedValue({ data: [{ file_id: "reservation-from-server" }], error: null });
    await expect(storage.reserveStorageUpload(upload)).resolves.toEqual({
      reservationId: "reservation-from-server", quotaEnforced: true,
    });
    expect(rpc).toHaveBeenCalledWith("reserve_storage_upload", expect.objectContaining({ _size_bytes: 100 }));
  });

  it("does not report a completed upload when finalization is unavailable", async () => {
    const storage = await import("./storage");
    const error = { code: "PGRST202", message: "schema cache" };
    rpc.mockResolvedValue({ data: null, error });
    await expect(storage.completeStorageUpload("reservation-from-server")).rejects.toBe(error);
  });

  it("keeps quota accounted for when deleting the storage object fails", async () => {
    const storage = await import("./storage");
    const error = new Error("Storage unavailable");
    remove.mockResolvedValue({ error });
    const file = { id: "existing-file", bucket: "case-files", object_path: "case/file.stl", size_bytes: 100 } as ManagedStorageFile;
    await expect(storage.deleteManagedStorageFile(file)).rejects.toBe(error);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("storage amount display", () => {
  it.each([
    [7.02, "7.02 GB"], [7.05, "7.05 GB"], [7.2, "7.2 GB"], [7, "7 GB"],
    [25, "25 GB"], [100, "100 GB"], [500, "500 GB"],
  ])("keeps significant decimal digits for %s GiB", async (gib, expected) => {
    const { formatStorageBytes } = await import("./storage");
    expect(formatStorageBytes(gib * 1024 ** 3)).toBe(expected);
  });
});

describe("reservation cancellation does not invent free space", () => {
  beforeEach(() => { vi.resetModules(); rpc.mockReset(); });
  async function measured() {
    const storage = await import("./storage");
    rpc.mockResolvedValueOnce({ data: { used_bytes: 300, limit_bytes: 1000 }, error: null });
    await storage.refreshStorageUsage(); return storage;
  }
  it.each([{ message: "STORAGE_OBJECT_STILL_EXISTS" }, { code: "PGRST202", message: "schema cache" }])("keeps visible bytes when cancellation is refused: %s", async (error) => {
    const storage = await measured(); rpc.mockResolvedValueOnce({ data: null, error });
    await expect(storage.cancelStorageUpload("reservation", 100)).rejects.toBe(error);
    expect(storage.getStorageUsageSnapshot().data?.used_bytes).toBe(300);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("waits for a measurement rather than double-subtracting after an idempotent retry", async () => {
    const storage = await measured();
    rpc.mockImplementation((name) => name === "cancel_storage_upload"
      ? Promise.resolve({ data: null, error: null }) : new Promise(() => {}));
    await storage.cancelStorageUpload("reservation", 100);
    await storage.cancelStorageUpload("reservation", 100);
    expect(storage.getStorageUsageSnapshot().data?.used_bytes).toBe(300);
  });
  it("does not subtract when no reservation was obtained", async () => {
    const storage = await measured(); await storage.cancelStorageUpload(null, 100);
    expect(storage.getStorageUsageSnapshot().data?.used_bytes).toBe(300); expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("manual recovery of abandoned upload reservations", () => {
  const pending = { id: "old-upload", clinic_id: "own-company", bucket: "case-files",
    object_path: "case/old.stl", original_name: "old.stl", status: "reserved", size_bytes: 100,
    created_at: "2026-01-01T00:00:00Z" } as ManagedStorageFile;
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); rpc.mockReset();
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
  });

  it("lists only pending rows from the selected company, oldest first", async () => {
    query.limit.mockResolvedValue({ data: [pending], error: null });
    const storage = await import("./storage");
    expect(await storage.fetchStorageUploadReservations("own-company")).toEqual([pending]);
    expect(query.eq.mock.calls).toEqual([["clinic_id", "own-company"], ["status", "reserved"]]);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(query.limit).toHaveBeenCalledWith(200);
  });

  it.each([null, {}, { id: "different", released: true, released_bytes: 100 },
    { id: pending.id, released: true, released_bytes: 1 },
    { id: pending.id, released: false, released_bytes: 100 }])("does not accept an ambiguous success response: %s", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    const storage = await import("./storage");
    await expect(storage.releaseStorageUploadReservation(pending)).rejects.toThrow("servidor não confirmou");
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not free visible quota before the backend confirms, even when the object now exists", async () => {
    const storage = await import("./storage");
    rpc.mockResolvedValueOnce({ data: { used_bytes: 300, limit_bytes: 1000 }, error: null });
    await storage.refreshStorageUsage();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "STORAGE_OBJECT_STILL_EXISTS" } });
    await expect(storage.releaseStorageUploadReservation(pending)).rejects.toThrow("arquivo já existe");
    expect(storage.getStorageUsageSnapshot().data?.used_bytes).toBe(300);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([true, false])("accepts an authoritative, idempotent result (released=%s) without double-subtracting", async (released) => {
    const storage = await import("./storage");
    rpc.mockResolvedValue({ data: { id: pending.id, released, released_bytes: released ? 100 : 0 }, error: null });
    await expect(storage.releaseStorageUploadReservation(pending)).resolves.toEqual({ released, releasedBytes: released ? 100 : 0 });
    expect(rpc).toHaveBeenCalledWith("release_storage_upload_reservation", { _file_id: pending.id, _clinic_id: "own-company" });
    expect(remove).not.toHaveBeenCalled();
    expect(storage.getStorageUsageSnapshot().data).toBeNull();
  });

  it.each(["STORAGE_RESERVATION_HAS_SOURCE", "STORAGE_MANAGEMENT_NOT_ALLOWED", "STORAGE_RESERVATION_TOO_RECENT", "STORAGE_RESERVATION_NOT_PENDING"])("refuses server guard %s", async (message) => {
    const storage = await import("./storage"); rpc.mockResolvedValue({ data: null, error: { message } });
    await expect(storage.releaseStorageUploadReservation(pending)).rejects.toThrow(); expect(remove).not.toHaveBeenCalled();
  });

  it("refuses a missing backend", async () => {
    const storage = await import("./storage"); rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(storage.releaseStorageUploadReservation(pending)).rejects.toThrow("recuperação de envios pendentes está indisponível");
  });

  it.each([{ ...pending, status: "ready" }, { ...pending, created_at: new Date().toISOString() }, { ...pending, created_at: "invalid" }])("refuses non-reviewable state before calling the server", async (file) => {
    const storage = await import("./storage");
    await expect(storage.releaseStorageUploadReservation(file as ManagedStorageFile)).rejects.toThrow("24 horas");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses an exact 24-hour threshold", async () => {
    const storage = await import("./storage"); const created = Date.parse(pending.created_at);
    expect(storage.canReviewStorageReservation(pending, created + storage.STORAGE_RESERVATION_REVIEW_AGE_MS - 1)).toBe(false);
    expect(storage.canReviewStorageReservation(pending, created + storage.STORAGE_RESERVATION_REVIEW_AGE_MS)).toBe(true);
  });

  it("returns from an unreachable server within a finite deadline", async () => {
    const storage = await import("./storage"); vi.useFakeTimers();
    try {
      rpc.mockReturnValue(new Promise(() => {}));
      const failed = expect(storage.releaseStorageUploadReservation(pending)).rejects.toThrow("servidor não confirmou");
      await vi.advanceTimersByTimeAsync(12_000); await failed;
      expect(remove).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("refuses an offline recovery without touching quota or calling the server", async () => {
    const storage = await import("./storage"); vi.stubGlobal("navigator", { onLine: false });
    try {
      await expect(storage.releaseStorageUploadReservation(pending)).rejects.toThrow("Conecte-se à internet");
      expect(rpc).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
      expect(storage.getStorageUsageSnapshot().data).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});

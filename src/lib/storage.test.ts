import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedStorageFile } from "./storage";

const { rpc, remove } = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, storage: { from: () => ({ remove }) } },
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientAttachment } from "./types";
const mocks = vi.hoisted(() => {
  const query = { insert: vi.fn(), select: vi.fn(), single: vi.fn(), delete: vi.fn(), eq: vi.fn(), update: vi.fn() };
  return { query, from: vi.fn(() => query), upload: vi.fn(), remove: vi.fn(), signed: vi.fn(), getUser: vi.fn(),
    reserve: vi.fn(), complete: vi.fn(), cancel: vi.fn(), delta: vi.fn(), deleted: vi.fn() };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from, auth: { getUser: mocks.getUser },
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.signed }) },
} }));
vi.mock("./storage", () => ({
  reserveStorageUpload: mocks.reserve, completeStorageUpload: mocks.complete,
  cancelStorageUpload: mocks.cancel, applyOptimisticStorageDelta: mocks.delta,
}));
vi.mock("./burrs", () => ({ autoRecordCaseMilling: vi.fn() }));
vi.mock("./optimistic", () => ({ broadcastEntity: vi.fn(), markDeleted: mocks.deleted }));
import { deletePatientAttachment, uploadPatientAttachment, uploadPatientPhoto, uploadUserAvatar, uploadCaseAttachment } from "./api";

const attachment = { id: "patient-file", file_path: "patient/file.stl", size_bytes: 100 } as PatientAttachment;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.insert.mockReturnValue(mocks.query); mocks.query.select.mockReturnValue(mocks.query);
  mocks.query.delete.mockReturnValue(mocks.query); mocks.query.update.mockReturnValue(mocks.query);
  mocks.query.eq.mockResolvedValue({ error: null });
  mocks.query.single.mockResolvedValue({ data: { id: "source" }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.reserve.mockResolvedValue({ reservationId: "reservation", quotaEnforced: true });
  mocks.complete.mockResolvedValue(undefined); mocks.cancel.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
  mocks.signed.mockResolvedValue({ data: { signedUrl: "https://files.example.invalid/file" }, error: null });
});
describe("patient attachment deletion preserves quota and source until confirmation", () => {
  it("retains the source and visible bytes when object deletion fails", async () => {
    const error = new Error("Storage unavailable"); mocks.remove.mockResolvedValue({ error });
    await expect(deletePatientAttachment(attachment)).rejects.toBe(error);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.deleted).not.toHaveBeenCalled(); expect(mocks.delta).not.toHaveBeenCalled();
  });
  it("does not hide the source or subtract bytes when metadata deletion fails", async () => {
    const error = new Error("Database unavailable"); mocks.query.eq.mockResolvedValue({ error });
    await expect(deletePatientAttachment(attachment)).rejects.toBe(error);
    expect(mocks.deleted).not.toHaveBeenCalled(); expect(mocks.delta).not.toHaveBeenCalled();
  });
  it("releases visible bytes only after both deletions succeed", async () => {
    await deletePatientAttachment(attachment);
    expect(mocks.delta).toHaveBeenCalledWith(-100); expect(mocks.deleted).toHaveBeenCalledWith(attachment.id);
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.query.delete.mock.invocationCallOrder[0]);
    expect(mocks.query.eq.mock.invocationCallOrder[0]).toBeLessThan(mocks.delta.mock.invocationCallOrder[0]);
  });
});
describe("available upload entrypoints require a reservation", () => {
  it("stores patient attachment paths rather than reusable bearer URLs", async () => {
    await uploadPatientAttachment("patient", new File(["content"], "photo.jpg", { type: "image/jpeg" }), { title: "Fixture" });
    const saved = mocks.query.insert.mock.calls[0][0];
    expect(saved.file_url).toBe(`storage://patient-files/${saved.file_path}`);
    expect(saved.thumbnail_url).toBe(saved.file_url);
    expect(mocks.signed.mock.calls[0][1]).toBe(300);
  });
  it("returns a renewable patient photo reference after validating upload access", async () => {
    const result = await uploadPatientPhoto("patient", new Blob(["image"], { type: "image/jpeg" }));
    expect(result).toMatch(/^storage:\/\/patient-photos\/patient\/.+\.jpg$/);
    expect(result).not.toContain("token="); expect(mocks.signed.mock.calls[0][1]).toBe(300);
  });
  it("stores only the avatar reference on the owner profile", async () => {
    const result = await uploadUserAvatar(new Blob(["image"], { type: "image/jpeg" }));
    expect(result).toMatch(/^storage:\/\/avatars\/user\/.+\.jpg$/);
    expect(mocks.query.update).toHaveBeenCalledWith({ avatar_url: result });
    expect(mocks.signed.mock.calls[0][1]).toBe(300);
  });
  it.each(["photo", "patient", "avatar", "case"])("does not upload %s when the reservation is refused", async (kind) => {
    const error = new Error("STORAGE_QUOTA_EXCEEDED"); mocks.reserve.mockRejectedValue(error);
    const file = new File(["content"], "file.stl", { type: "application/octet-stream" });
    const action = kind === "photo" ? () => uploadPatientPhoto("patient", file)
      : kind === "patient" ? () => uploadPatientAttachment("patient", file, { title: "Fixture" })
      : kind === "avatar" ? () => uploadUserAvatar(file) : () => uploadCaseAttachment("case", file);
    await expect(action()).rejects.toBe(error); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("does not create a patient attachment with an empty or refused signed URL", async () => {
    mocks.signed.mockResolvedValue({ data: null, error: null });
    await expect(uploadPatientAttachment("patient", new File(["content"], "file.stl"), { title: "Fixture" })).rejects.toThrow("confirmar o acesso");
    expect(mocks.query.insert).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalled(); expect(mocks.cancel).toHaveBeenCalledWith("reservation", 7);
  });
  it("keeps a reservation when cleanup of an inaccessible object fails", async () => {
    mocks.signed.mockResolvedValue({ data: null, error: new Error("Signing failed") });
    const error = new Error("Storage cleanup failed"); mocks.remove.mockResolvedValue({ error });
    await expect(uploadPatientAttachment("patient", new File(["content"], "file.stl"), { title: "Fixture" })).rejects.toBe(error);
    expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.query.insert).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
});


describe("uploaded object rollback", () => {
  const file = () => new File(["content"], "file.stl", { type: "application/octet-stream" });
  const action = (kind: string) => kind === "photo" ? uploadPatientPhoto("patient", file())
    : kind === "avatar" ? uploadUserAvatar(file())
    : kind === "patient" ? uploadPatientAttachment("patient", file(), { title: "Fixture" })
    : uploadCaseAttachment("case", file());

  it.each(["photo", "avatar"])("rejects an empty %s signed URL and confirms removal before cancellation", async (kind) => {
    mocks.signed.mockResolvedValue({ data: null, error: null });
    await expect(action(kind)).rejects.toThrow("confirmar o acesso");
    expect(mocks.query.update).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledWith("reservation", 7);
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.cancel.mock.invocationCallOrder[0]);
  });

  it.each(["photo", "avatar"])("preserves the %s reservation when signing and cleanup fail", async (kind) => {
    mocks.signed.mockResolvedValue({ data: null, error: new Error("Signing failed") });
    const cleanup = new Error("Removal failed");
    mocks.remove.mockResolvedValue({ error: cleanup });
    await expect(action(kind)).rejects.toBe(cleanup);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each(["avatar", "patient", "case"])("preserves the %s reservation if saving metadata and cleanup fail", async (kind) => {
    const original = new Error("Database unavailable");
    mocks.query.eq.mockResolvedValue({ error: original });
    mocks.query.single.mockResolvedValue({ data: null, error: original });
    const cleanup = new Error("Removal failed");
    mocks.remove.mockResolvedValue({ error: cleanup });
    await expect(action(kind)).rejects.toBe(cleanup);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each(["avatar", "patient", "case"])("releases the %s reservation after confirmed metadata-failure cleanup", async (kind) => {
    const original = new Error("Database unavailable");
    mocks.query.eq.mockResolvedValue({ error: original });
    mocks.query.single.mockResolvedValue({ data: null, error: original });
    await expect(action(kind)).rejects.toBe(original);
    expect(mocks.cancel).toHaveBeenCalledWith("reservation", 7);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.cancel.mock.invocationCallOrder[0]);
  });
});

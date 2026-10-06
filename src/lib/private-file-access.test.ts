import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuth: vi.fn(), sign: vi.fn(), bucket: vi.fn(),
  installed: vi.fn(), identity: vi.fn(), read: vi.fn(), write: vi.fn(), list: vi.fn(), remove: vi.fn(), readImage: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuth }, storage: { from: mocks.bucket },
} }));
vi.mock("./desktop-local", () => ({
  isDentalFlowDesktop: mocks.installed, getProvisionedDesktopIdentity: mocks.identity,
  localCacheGet: mocks.read, localCachePut: mocks.write, localCacheList: mocks.list, localCacheDelete: mocks.remove,
}));
vi.mock("./desktop-cloud", () => ({ withDesktopCloudTimeout: (_label: string, task: Promise<unknown>) => task }));
vi.mock("./desktop-runtime-optimizations", () => ({ readPrivateAttachmentImage: mocks.readImage }));

const source = "storage://patient-photos/patient/photo.jpg";
const signed = "https://project.supabase.co/storage/v1/object/sign/patient-photos/patient/photo.jpg?token=new-token";
const session = (owner: string) => ({ data: { session: { user: { id: owner }, access_token: "private-jwt" } }, error: null });
let listener: (event: string, session: any) => void;
let api: typeof import("./private-file-access");

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  mocks.getSession.mockResolvedValue(session("alice"));
  mocks.onAuth.mockImplementation((callback) => { listener = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  mocks.bucket.mockReturnValue({ createSignedUrl: mocks.sign });
  mocks.sign.mockResolvedValue({ data: { signedUrl: signed }, error: null });
  mocks.installed.mockReturnValue(false);
  mocks.identity.mockResolvedValue({ user_id: "alice", validated_at: Date.now(), valid_until: Date.now() + 72 * 3_600_000 });
  mocks.read.mockResolvedValue(null); mocks.list.mockResolvedValue([]); mocks.write.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined);
  mocks.readImage.mockResolvedValue(null);
  vi.stubGlobal("navigator", { get onLine() { return true; } });
  vi.stubGlobal("window", new EventTarget());
  api = await import("./private-file-access"); api.subscribePrivateFileScope(() => undefined);
  await Promise.resolve(); await Promise.resolve();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("private file signatures belong to the current account", () => {
  it("deduplicates a repeated path and requests only five minutes", async () => {
    const [a, b] = await Promise.all([api.resolvePrivateFile(source), api.resolvePrivateFile(source)]);
    expect(a.url).toBe(signed); expect(b).toEqual(a);
    expect(mocks.sign).toHaveBeenCalledTimes(1); expect(mocks.sign).toHaveBeenCalledWith("patient/photo.jpg", 300);
  });
  it("re-signs an expired legacy bearer rather than reusing it", async () => {
    const legacy = signed.replace("new-token", "expired-legacy");
    expect((await api.resolvePrivateFile(legacy)).url).toBe(signed);
    expect(mocks.sign).toHaveBeenCalledWith("patient/photo.jpg", 300);
  });
  it("does not render the old bearer if current Storage authorization fails", async () => {
    mocks.sign.mockResolvedValue({ data: null, error: { status: 403 } });
    await expect(api.resolvePrivateFile(signed.replace("new-token", "old-token"))).rejects.toThrow("PRIVATE_FILE_ACCESS_DENIED");
  });
  it("rejects a signed result for a different path", async () => {
    mocks.sign.mockResolvedValue({ data: { signedUrl: signed.replace("patient/photo.jpg", "other/photo.jpg") }, error: null });
    await expect(api.resolvePrivateFile(source)).rejects.toThrow("PRIVATE_FILE_RESPONSE_INVALID");
  });
  it("discards an old account's late response after a switch", async () => {
    let release!: (value: unknown) => void;
    mocks.sign.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const old = api.resolvePrivateFile(source);
    await vi.waitFor(() => expect(mocks.sign).toHaveBeenCalledTimes(1));
    mocks.getSession.mockResolvedValue(session("bob")); listener("SIGNED_IN", session("bob").data.session);
    const next = await api.resolvePrivateFile(source);
    release({ data: { signedUrl: signed }, error: null });
    await expect(old).rejects.toThrow("PRIVATE_FILE_SESSION_CHANGED");
    expect(next.url).toBe(signed); expect(mocks.sign).toHaveBeenCalledTimes(2);
  });
  it("clears the in-memory signature on logout, even before the token request", async () => {
    await api.resolvePrivateFile(source); listener("SIGNED_OUT", null);
    await expect(api.resolvePrivateFile(source)).rejects.toThrow("PRIVATE_FILE_SESSION_CHANGED");
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });
  it("rejects an unobserved identity mismatch", async () => {
    mocks.getSession.mockResolvedValue(session("bob"));
    await expect(api.resolvePrivateFile(source)).rejects.toThrow("PRIVATE_FILE_SESSION_CHANGED");
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("renews an expiring in-memory URL through Storage again", async () => {
    await api.resolvePrivateFile(source);
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 301_000);
    await api.resolvePrivateFile(source); expect(mocks.sign).toHaveBeenCalledTimes(2);
  });
  it("writes pixels to the installed owner mirror without persisting a bearer", async () => {
    mocks.installed.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })));
    await api.resolvePrivateFile(source);
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    const [owner, namespace, key, payload] = mocks.write.mock.calls[0];
    expect(owner).toBe("alice"); expect(namespace).toBe("private-images:v1");
    expect(key).toBe(JSON.stringify(["patient-photos", "patient/photo.jpg"]));
    expect(payload.dataUrl).toBe("data:image/jpeg;base64,AQID"); expect(JSON.stringify(payload)).not.toContain("token");
  });
});

describe("installed image mirrors do not extend offline entitlement", () => {
  const cache = () => ({ payload: { dataUrl: "data:image/jpeg;base64,YQ==", authorizedAt: Date.now() - 1000, bucket: "patient-photos", path: "patient/photo.jpg" } });
  it("reads only the verified owner's image mirror without signing offline", async () => {
    mocks.installed.mockReturnValue(true); vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.identity.mockResolvedValue({ user_id: "alice", validated_at: Date.now() - 1000, valid_until: Date.now() + 72 * 3_600_000 });
    mocks.read.mockResolvedValue(cache());
    const value = await api.resolvePrivateFile(source);
    expect(value.url).toBe("data:image/jpeg;base64,YQ==");
    expect(mocks.read).toHaveBeenCalledWith("alice", "private-images:v1", JSON.stringify(["patient-photos", "patient/photo.jpg"]));
    expect(mocks.sign).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it("refuses an expired identity before reading any cached pixels", async () => {
    mocks.installed.mockReturnValue(true); vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.identity.mockResolvedValue({ user_id: "alice", validated_at: Date.now() - 73 * 3_600_000, valid_until: Date.now() + 72 * 3_600_000 });
    await expect(api.resolvePrivateFile(source)).rejects.toThrow("PRIVATE_FILE_OFFLINE_EXPIRED");
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("refuses a device provisioned for another owner", async () => {
    mocks.installed.mockReturnValue(true); vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.identity.mockResolvedValue({ user_id: "bob", validated_at: Date.now(), valid_until: Date.now() + 72 * 3_600_000 });
    await expect(api.resolvePrivateFile(source)).rejects.toThrow("PRIVATE_FILE_OFFLINE_EXPIRED");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("refuses a cached payload whose path does not match", async () => {
    mocks.installed.mockReturnValue(true); vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.identity.mockResolvedValue({ user_id: "alice", validated_at: Date.now(), valid_until: Date.now() + 72 * 3_600_000 });
    const value = cache(); value.payload.path = "other/photo.jpg"; mocks.read.mockResolvedValue(value);
    await expect(api.resolvePrivateFile(source)).rejects.toThrow("PRIVATE_FILE_NOT_CACHED");
  });
  it("preserves an existing downloaded case image and releases its temporary URL", async () => {
    mocks.installed.mockReturnValue(true); vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.readImage.mockResolvedValue(new Blob(["image"], { type: "image/jpeg" }));
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cached-image");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const result = await api.resolvePrivateFile("storage://case-files/case/photo.jpg");
    expect(result.url).toBe("blob:cached-image");
    expect(mocks.readImage).toHaveBeenCalledWith("alice", "case/photo.jpg");
    expect(mocks.sign).not.toHaveBeenCalled(); expect(create).toHaveBeenCalledTimes(1);
    result.release?.(); expect(revoke).toHaveBeenCalledWith("blob:cached-image");
  });
});

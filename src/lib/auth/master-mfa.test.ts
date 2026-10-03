import { describe, expect, it, vi } from "vitest";
import { cancelMasterFactor, enrollMasterFactor, verifyMasterFactor } from "./master-mfa";

const pending = { ownerId: "operator", id: "new-factor", qrCode: "<svg/>", secret: "test-only" };
function authFixture() {
  return {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "operator" } }, error: null }),
    mfa: {
      listFactors: vi.fn().mockResolvedValue({ data: { all: [{ id: "new-factor", status: "unverified" }], totp: [] }, error: null }),
      enroll: vi.fn().mockResolvedValue({ data: { id: "new-factor", totp: { qr_code: "<svg/>", secret: "test-only" } }, error: null }),
      challengeAndVerify: vi.fn().mockResolvedValue({ error: null }),
      getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal2" }, error: null }),
      unenroll: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}
type Auth = Parameters<typeof enrollMasterFactor>[0];
const asAuth = (fixture: ReturnType<typeof authFixture>) => fixture as unknown as Auth;

describe("Master MFA enrollment account and factor boundaries", () => {
  it("rejects missing authenticated identity before creating a factor", async () => {
    const auth = authFixture(); auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(enrollMasterFactor(asAuth(auth))).rejects.toThrow("MFA_SESSION_CHANGED");
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });
  it("preserves existing verified protection instead of adding another factor", async () => {
    const auth = authFixture(); auth.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [{ status: "verified" }] }, error: null });
    await expect(enrollMasterFactor(asAuth(auth))).rejects.toThrow("MFA_ALREADY_CONFIGURED");
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });
  it("does not return a setup secret after an account switch during enrollment", async () => {
    const auth = authFixture(); auth.getUser.mockResolvedValueOnce({ data: { user: { id: "operator" } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: "operator" } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: "other" } }, error: null });
    await expect(enrollMasterFactor(asAuth(auth))).rejects.toThrow("MFA_SESSION_CHANGED");
  });
  it("does not submit malformed verification codes", async () => {
    const auth = authFixture();
    await expect(verifyMasterFactor(asAuth(auth), pending, "12345")).rejects.toThrow("MFA_CODE_INVALID");
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
  it("does not verify a factor for a different account", async () => {
    const auth = authFixture(); auth.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(verifyMasterFactor(asAuth(auth), pending, "123456")).rejects.toThrow("MFA_SESSION_CHANGED");
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
  it("does not accept success if assurance remains aal1", async () => {
    const auth = authFixture(); auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1" }, error: null });
    await expect(verifyMasterFactor(asAuth(auth), pending, "123456")).rejects.toThrow("MFA_REQUIRED");
  });
  it("requires verification and aal2 for enrollment completion", async () => {
    const auth = authFixture(); await verifyMasterFactor(asAuth(auth), pending, "123456");
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "new-factor", code: "123456" });
  });
  it("cancels only the factor created by this flow", async () => {
    const auth = authFixture(); await cancelMasterFactor(asAuth(auth), pending);
    expect(auth.mfa.unenroll).toHaveBeenCalledExactlyOnceWith({ factorId: "new-factor" });
  });
  it("does not remove a factor that was verified before cancellation", async () => {
    const auth = authFixture(); auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "new-factor", status: "verified" }], totp: [] }, error: null });
    await cancelMasterFactor(asAuth(auth), pending);
    expect(auth.mfa.unenroll).not.toHaveBeenCalled();
  });
  it("does not remove factors after an account switch", async () => {
    const auth = authFixture(); auth.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(cancelMasterFactor(asAuth(auth), pending)).rejects.toThrow("MFA_SESSION_CHANGED");
    expect(auth.mfa.unenroll).not.toHaveBeenCalled();
  });
});

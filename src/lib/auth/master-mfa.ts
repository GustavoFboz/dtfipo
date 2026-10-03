import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = Pick<SupabaseClient["auth"], "getUser" | "mfa">;
export type PendingMasterFactor = { ownerId: string; id: string; qrCode: string; secret: string };

async function assertOwner(auth: Auth, ownerId?: string) {
  const { data, error } = await auth.getUser();
  if (error || !data.user || (ownerId && data.user.id !== ownerId)) throw new Error("MFA_SESSION_CHANGED");
  return data.user.id;
}

export async function enrollMasterFactor(auth: Auth): Promise<PendingMasterFactor> {
  const ownerId = await assertOwner(auth);
  const factors = await auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  if (factors.data.totp.some((factor) => factor.status === "verified")) throw new Error("MFA_ALREADY_CONFIGURED");
  await assertOwner(auth, ownerId);
  const result = await auth.mfa.enroll({ factorType: "totp", friendlyName: `DentalFlow ${Date.now()}` });
  if (result.error) throw result.error;
  await assertOwner(auth, ownerId);
  return { ownerId, id: result.data.id, qrCode: result.data.totp.qr_code, secret: result.data.totp.secret };
}

export async function verifyMasterFactor(auth: Auth, factor: PendingMasterFactor, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("MFA_CODE_INVALID");
  await assertOwner(auth, factor.ownerId);
  const verified = await auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (verified.error) throw verified.error;
  await assertOwner(auth, factor.ownerId);
  const assurance = await auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data?.currentLevel !== "aal2") throw new Error("MFA_REQUIRED");
}

/** Cancel only the unverified factor created by this enrollment, never existing protection. */
export async function cancelMasterFactor(auth: Auth, factor: PendingMasterFactor) {
  await assertOwner(auth, factor.ownerId);
  const factors = await auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  const current = factors.data.all.find((entry) => entry.id === factor.id);
  if (!current || current.status === "verified") return;
  await assertOwner(auth, factor.ownerId);
  const result = await auth.mfa.unenroll({ factorId: factor.id });
  if (result.error) throw result.error;
}

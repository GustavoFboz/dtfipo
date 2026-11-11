// Shared installed-client policy. This is an application access boundary, not
// tamper-proof DRM or secure physical erasure of a user's device.
export const MAX_OFFLINE_ACCESS_MS = 3 * 24 * 60 * 60 * 1000;
export const OFFLINE_ACCESS_EXPIRED_EVENT = "dentalflow:offline-access-expired";

export function offlineAccessDeadline(identity: { validated_at: number; valid_until: number }): number {
  if (!Number.isSafeInteger(identity.validated_at) || identity.validated_at <= 0
    || !Number.isSafeInteger(identity.valid_until)) return 0;
  return Math.min(identity.valid_until, identity.validated_at + MAX_OFFLINE_ACCESS_MS);
}

export function hasOfflineAccess(identity: { validated_at: number; valid_until: number }, now = Date.now()): boolean {
  return now >= identity.validated_at && now < offlineAccessDeadline(identity);
}

export function clearInstalledSessionSnapshots() {
  if (typeof window === "undefined") return;
  // Session snapshots can include clinical form drafts. Preferences and auth
  // storage are retained here; local signOut owns credential removal.
  window.sessionStorage.clear();
  const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i));
  for (const key of keys) {
    if (key && /^(case_tab:|stock-item-draft:|cadista:|dentes:)/.test(key)) window.localStorage.removeItem(key);
  }
}

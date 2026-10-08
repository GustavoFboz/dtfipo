import { describe, expect, it } from "vitest";
import { hasOfflineAccess, MAX_OFFLINE_ACCESS_MS, offlineAccessDeadline } from "./offline-access-policy";

describe("installed offline authorization", () => {
  const validated_at = Date.parse("2026-10-01T12:00:00Z");
  const identity = { validated_at, valid_until: validated_at + MAX_OFFLINE_ACCESS_MS };
  it("allows the last millisecond and blocks exactly at 72 hours", () => {
    expect(hasOfflineAccess(identity, identity.valid_until - 1)).toBe(true);
    expect(hasOfflineAccess(identity, identity.valid_until)).toBe(false);
  });
  it.each([14, 30])("caps an existing %i-day authorization without extending it", (days) => {
    const legacy = { validated_at, valid_until: validated_at + days * 86_400_000 };
    expect(offlineAccessDeadline(legacy)).toBe(identity.valid_until);
    expect(hasOfflineAccess(legacy, identity.valid_until)).toBe(false);
  });
  it("preserves an earlier revocation and refuses a backwards clock", () => {
    expect(hasOfflineAccess({ ...identity, valid_until: validated_at + 100 }, validated_at + 100)).toBe(false);
    expect(hasOfflineAccess(identity, validated_at - 1)).toBe(false);
  });
  it.each([NaN, Infinity, -1, 0, 1.5])("does not authorize malformed validation time %s", (validated_at) => {
    expect(hasOfflineAccess({ validated_at, valid_until: Date.now() + MAX_OFFLINE_ACCESS_MS })).toBe(false);
  });
});

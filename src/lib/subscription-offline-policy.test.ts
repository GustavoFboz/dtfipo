import { describe, expect, it } from "vitest";
import type { MySubscriptionContext } from "./subscriptions";
import { restrictOfflineSubscriptionContext } from "./subscription-offline-policy";

const NOW = Date.parse("2026-10-31T16:00:00.000Z");

function snapshot(overrides: Record<string, unknown> = {}): MySubscriptionContext {
  return {
    account_type: "company_admin",
    effective_access: "full",
    company: {
      subscription_id: "synthetic",
      scope: "company",
      plan_code: "company_growth",
      plan_name: "Growth",
      status: "active",
      access_mode: "full",
      billing_day: 5,
      current_period_end: "2026-11-01T16:00:00.000Z",
      grace_until: null,
      monthly_price_cents: 44900,
      currency: "BRL",
      max_sessions: 2,
      max_members: 5,
      storage_bytes: 100000,
      features: {},
      sessions: ["laboratory"],
      internal_full_access: false,
      ...overrides,
    },
  } as MySubscriptionContext;
}

describe("offline SaaS subscription policy", () => {
  it("keeps a valid paid period, without modifying the snapshot", () => {
    const original = snapshot();
    expect(restrictOfflineSubscriptionContext(original, NOW)).toBe(original);
  });

  it("ends clinical access exactly at the paid period boundary", () => {
    const original = snapshot({ current_period_end: new Date(NOW).toISOString() });
    expect(restrictOfflineSubscriptionContext(original, NOW - 1).effective_access).toBe("full");
    const restricted = restrictOfflineSubscriptionContext(original, NOW);
    expect(restricted.effective_access).toBe("billing_only");
    expect(restricted.company?.access_mode).toBe("billing_only");
    expect(original.effective_access).toBe("full");
  });

  it.each([null, "", "not-a-date", "2026-10-01T00:00:00Z"])(
    "fails closed when ordinary paid account has missing, malformed or expired period %s",
    (current_period_end) => {
      expect(restrictOfflineSubscriptionContext(snapshot({ current_period_end }), NOW).effective_access).toBe("billing_only");
    },
  );

  it("preserves explicitly server-confirmed courtesy access without a paid period", () => {
    const courtesy = snapshot({ internal_full_access: true, current_period_end: null });
    expect(restrictOfflineSubscriptionContext(courtesy, NOW)).toBe(courtesy);
  });

  it("does not interpret a truthy string as a privileged flag", () => {
    const forged = snapshot({ internal_full_access: "true", current_period_end: null });
    expect(restrictOfflineSubscriptionContext(forged, NOW).effective_access).toBe("billing_only");
  });

  it("does not elevate a previously restricted or suspended account", () => {
    const restricted = { ...snapshot({ internal_full_access: true, current_period_end: null }), effective_access: "billing_only" } as MySubscriptionContext;
    expect(restrictOfflineSubscriptionContext(restricted, NOW)).toBe(restricted);
  });

  it("does not grant full access when the company object is absent", () => {
    const malformed = { ...snapshot(), company: null };
    expect(restrictOfflineSubscriptionContext(malformed, NOW).effective_access).toBe("billing_only");
  });
});

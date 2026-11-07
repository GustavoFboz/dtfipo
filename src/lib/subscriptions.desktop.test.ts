import { describe, expect, it } from "vitest";

import { locallySafeContext } from "./subscriptions.desktop";
import type { MySubscriptionContext } from "./subscriptions";

function context(access: "full" | "billing_only", end: string | null): MySubscriptionContext {
  return {
    account_type: "company_admin",
    effective_access: access,
    company: {
      subscription_id: "server-verified",
      scope: "company",
      plan_code: "company_advanced",
      plan_name: "Plano",
      status: access === "full" ? "active" : "suspended",
      access_mode: access,
      billing_day: null,
      current_period_end: end,
      grace_until: null,
      monthly_price_cents: 0,
      currency: "BRL",
      max_sessions: 3,
      max_members: 10,
      storage_bytes: 1,
      features: {},
      sessions: [],
    },
  };
}

describe("locallySafeContext", () => {
  it("preserva acesso lifetime confirmado pelo servidor", () => {
    const verified = context("full", "9999-12-31T23:59:59.000Z");
    expect(locallySafeContext(verified)).toBe(verified);
  });

  it("preserva conta comum ativa dentro do período confirmado", () => {
    expect(locallySafeContext(context("full", "2999-01-01T00:00:00.000Z")).effective_access).toBe("full");
  });

  it("não promove conta comum inativa", () => {
    expect(locallySafeContext(context("billing_only", "2999-01-01T00:00:00.000Z")).effective_access).toBe("billing_only");
  });

  it("rebaixa somente o fallback offline cujo período confirmado expirou", () => {
    expect(locallySafeContext(context("full", "2000-01-01T00:00:00.000Z")).effective_access).toBe("billing_only");
  });
});
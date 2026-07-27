import type { RuleStrategy } from "../types";

export const percentageStrategy: RuleStrategy = {
  type: "PERCENTAGE",
  calculate: ({ rule, resolveBase }) => {
    const pct = Number(rule.percentage ?? 0);
    if (!pct) return { total: 0, parts: [] };
    const base = resolveBase(rule.percentage_base ?? null);
    const total = base * (pct / 100);
    return {
      total,
      parts: [
        {
          label: `${pct}% sobre ${rule.percentage_base ?? "recebido"}`,
          amount: total,
          kind: "percentage",
          meta: { pct, base, base_kind: rule.percentage_base ?? "received" },
        },
      ],
    };
  },
};
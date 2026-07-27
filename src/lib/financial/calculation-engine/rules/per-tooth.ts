import type { RuleStrategy } from "../types";

export const perToothStrategy: RuleStrategy = {
  type: "PER_TOOTH",
  calculate: ({ rule, teeth }) => {
    const per = Number(rule.amount_per_tooth ?? 0);
    if (!per || teeth <= 0) return { total: 0, parts: [] };
    const total = per * teeth;
    return {
      total,
      parts: [{ label: `Por dente × ${teeth}`, amount: total, kind: "per_tooth", meta: { per, teeth } }],
    };
  },
};
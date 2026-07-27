import type { RuleStrategy } from "../types";

export const perCaseStrategy: RuleStrategy = {
  type: "PER_CASE",
  calculate: ({ rule }) => {
    const amount = Number(rule.amount_per_case ?? 0);
    if (!amount) return { total: 0, parts: [] };
    return {
      total: amount,
      parts: [{ label: "Por caso", amount, kind: "per_case" }],
    };
  },
};

import type { RuleStrategy } from "../types";

export const fixedStrategy: RuleStrategy = {
  type: "FIXED",
  calculate: ({ rule }) => {
    const amount = Number(rule.fixed_amount ?? 0);
    if (!amount) return { total: 0, parts: [] };
    return { total: amount, parts: [{ label: "Fixo", amount, kind: "fixed" }] };
  },
};

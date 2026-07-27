import type { RuleStrategy } from "../types";

export const customStrategy: RuleStrategy = {
  type: "CUSTOM",
  calculate: ({ rule, participant, case: c, customEvaluator }) => {
    if (!customEvaluator) {
      return {
        total: 0,
        parts: [
          {
            label: "CUSTOM sem evaluator",
            amount: 0,
            kind: "custom",
            meta: { reason: "no_evaluator" },
          },
        ],
      };
    }
    return customEvaluator({
      rule: { ...rule, rule_type: "CUSTOM" },
      participant,
      case: c,
    });
  },
};
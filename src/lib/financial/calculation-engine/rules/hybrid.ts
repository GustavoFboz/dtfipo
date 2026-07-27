import type { CalculationPart, RuleStrategy } from "../types";

export const hybridStrategy: RuleStrategy = {
  type: "HYBRID",
  calculate: ({ rule, teeth, resolveBase }) => {
    const parts: CalculationPart[] = [];

    const fixed = Number(rule.fixed_amount ?? 0);
    if (fixed) parts.push({ label: "Fixo", amount: fixed, kind: "fixed" });

    const perCase = Number(rule.amount_per_case ?? 0);
    if (perCase) parts.push({ label: "Por caso", amount: perCase, kind: "per_case" });

    const perTooth = Number(rule.amount_per_tooth ?? 0);
    if (perTooth && teeth > 0) {
      parts.push({
        label: `Por dente × ${teeth}`,
        amount: perTooth * teeth,
        kind: "per_tooth",
        meta: { per: perTooth, teeth },
      });
    }

    const pct = Number(rule.percentage ?? 0);
    if (pct) {
      const base = resolveBase(rule.percentage_base ?? null);
      parts.push({
        label: `${pct}% sobre ${rule.percentage_base ?? "recebido"}`,
        amount: base * (pct / 100),
        kind: "percentage",
        meta: { pct, base },
      });
    }

    for (const c of rule.components ?? []) {
      if (c.kind === "fixed" && c.amount) {
        parts.push({ label: "Fixo (componente)", amount: c.amount, kind: "fixed" });
      } else if (c.kind === "per_case" && c.amount) {
        parts.push({ label: "Por caso (componente)", amount: c.amount, kind: "per_case" });
      } else if (c.kind === "per_tooth" && c.amount && teeth > 0) {
        parts.push({
          label: `Por dente × ${teeth} (componente)`,
          amount: c.amount * teeth,
          kind: "per_tooth",
          meta: { per: c.amount, teeth },
        });
      } else if (c.kind === "percentage" && c.percentage) {
        const base = resolveBase(c.base ?? null);
        parts.push({
          label: `${c.percentage}% sobre ${c.base ?? "recebido"} (componente)`,
          amount: base * (c.percentage / 100),
          kind: "percentage",
          meta: { pct: c.percentage, base },
        });
      }
    }

    const total = parts.reduce((s, p) => s + p.amount, 0);
    return { total, parts };
  },
};
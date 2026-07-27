import { describe, it, expect } from "vitest";
import { calculateFinancials } from "../engine";
import type { CalculationInput, FinancialProfessionalRule } from "../types";

const baseCase: CalculationInput["case"] = {
  id: "case-1",
  clinic_id: "clinic-1",
  status: "FINALIZADO",
  teeth_count: 4,
  gross_amount: 1000,
  net_amount: 900,
  received_amount: 800,
};

function ruleOf(patch: Partial<FinancialProfessionalRule>): FinancialProfessionalRule {
  return {
    id: patch.id ?? "rule-x",
    clinic_id: "clinic-1",
    user_id: "u",
    name: "r",
    description: null,
    rule_type: patch.rule_type ?? "FIXED",
    fixed_amount: null,
    amount_per_case: null,
    amount_per_tooth: null,
    percentage: null,
    percentage_base: null,
    components: [],
    formula: null,
    parameters: {},
    applies_to_case_type_id: null,
    applies_to_material: null,
    applies_to_phase_id: null,
    applies_to_stage_id: null,
    applies_to_filters: {},
    start_date: "2000-01-01",
    end_date: null,
    is_active: true,
    priority: 0,
    currency: "BRL",
    metadata: {},
    created_by: null,
    created_at: "",
    updated_at: "",
    ...patch,
  };
}

describe("calculateFinancials", () => {
  it("skips when status is not eligible", () => {
    const res = calculateFinancials({
      case: { ...baseCase, status: "NOVO" },
      participants: [{ id: "p1", professional_id: "u1", fixed_amount: 100 }],
    });
    expect(res.total).toBe(0);
    expect(res.participants[0].skipped).toBe(true);
    expect(res.participants[0].skip_reason).toBe("status_not_eligible");
  });

  it("computes FIXED via inline rule", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [
        { id: "p1", professional_id: "u1", inline_rule: { rule_type: "FIXED", fixed_amount: 250 } },
      ],
    });
    expect(res.total).toBe(250);
    expect(res.participants[0].rule_type).toBe("FIXED");
  });

  it("computes PER_TOOTH using case teeth_count", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [
        { id: "p1", professional_id: "u1", inline_rule: { rule_type: "PER_TOOTH", amount_per_tooth: 30 } },
      ],
    });
    expect(res.total).toBe(120);
  });

  it("computes PERCENTAGE against selected base", () => {
    const rules = { r1: ruleOf({ id: "r1", rule_type: "PERCENTAGE", percentage: 10, percentage_base: "gross" }) };
    const res = calculateFinancials({
      case: baseCase,
      rules,
      participants: [{ id: "p1", professional_id: "u1", payment_rule_id: "r1" }],
    });
    expect(res.total).toBe(100);
  });

  it("computes HYBRID sum of fixed + per_tooth + percentage", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [
        {
          id: "p1",
          professional_id: "u1",
          inline_rule: {
            rule_type: "HYBRID",
            fixed_amount: 50,
            amount_per_tooth: 10,
            percentage: 5,
            percentage_base: "received",
          },
        },
      ],
    });
    // 50 + 4*10 + 5% of 800 = 50 + 40 + 40 = 130
    expect(res.total).toBe(130);
  });

  it("uses scalar participant overrides when no rule given (percentage)", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [{ id: "p1", professional_id: "u1", percentage: 25 }],
    });
    // 25% of received (800) = 200
    expect(res.total).toBe(200);
  });

  it("marks CUSTOM as skipped when no evaluator provided", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [{ id: "p1", professional_id: "u1", inline_rule: { rule_type: "CUSTOM" } }],
    });
    expect(res.total).toBe(0);
    // Not "skipped" in our flag terms, but the strategy returns a zero part.
    expect(res.participants[0].parts[0].meta?.reason).toBe("no_evaluator");
  });

  it("runs CUSTOM evaluator when provided", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [{ id: "p1", professional_id: "u1", inline_rule: { rule_type: "CUSTOM" } }],
      customEvaluator: () => ({ total: 42, parts: [{ label: "custom", amount: 42, kind: "custom" }] }),
    });
    expect(res.total).toBe(42);
  });

  it("respects rule.is_active=false", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [
        {
          id: "p1",
          professional_id: "u1",
          inline_rule: { rule_type: "FIXED", fixed_amount: 100, is_active: false },
        },
      ],
    });
    expect(res.total).toBe(0);
    expect(res.participants[0].skip_reason).toBe("rule_inactive");
  });

  it("aggregates multiple participants and rounds correctly", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [
        { id: "p1", professional_id: "u1", inline_rule: { rule_type: "PERCENTAGE", percentage: 33.33, percentage_base: "received" } },
        { id: "p2", professional_id: "u2", inline_rule: { rule_type: "FIXED", fixed_amount: 10 } },
      ],
    });
    // 33.33% of 800 = 266.64 + 10 = 276.64
    expect(res.total).toBeCloseTo(276.64, 2);
    expect(res.participants).toHaveLength(2);
  });

  it("emits logs for the run", () => {
    const res = calculateFinancials({
      case: baseCase,
      participants: [{ id: "p1", professional_id: "u1", inline_rule: { rule_type: "FIXED", fixed_amount: 10 } }],
    });
    expect(res.logs.some((l) => l.message === "calculation.start")).toBe(true);
    expect(res.logs.some((l) => l.message === "calculation.done")).toBe(true);
  });
});
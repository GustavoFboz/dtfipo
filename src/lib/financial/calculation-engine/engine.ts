import type {
  CalculationInput,
  CalculationResult,
  CalculationParticipant,
  FinancialProfessionalRule,
  ParticipantCalculationResult,
  PercentageBase,
  ProfessionalRuleType,
  RuleStrategyContext,
} from "./types";
import { CALCULATION_ELIGIBLE_STATUSES } from "./types";
import { CalculationLogger } from "./logger";
import { getRuleStrategy } from "./rules";

/** Rounds monetary values to 2 decimals without floating point drift. */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function resolveRule(
  participant: CalculationParticipant,
  rules: Record<string, FinancialProfessionalRule> | undefined,
): { rule: Partial<FinancialProfessionalRule> & { rule_type: ProfessionalRuleType }; ruleId: string | null } | null {
  if (participant.inline_rule) {
    return { rule: participant.inline_rule, ruleId: null };
  }
  if (participant.payment_rule_id && rules?.[participant.payment_rule_id]) {
    const r = rules[participant.payment_rule_id];
    return { rule: r, ruleId: r.id };
  }
  // Synthesize a rule from the scalar overrides on the participant itself.
  if (participant.percentage != null && participant.percentage !== 0) {
    return {
      rule: { rule_type: "PERCENTAGE", percentage: participant.percentage, percentage_base: "received" },
      ruleId: null,
    };
  }
  if (participant.fixed_amount != null && participant.fixed_amount !== 0) {
    return { rule: { rule_type: "FIXED", fixed_amount: participant.fixed_amount }, ruleId: null };
  }
  return null;
}

function isRuleActive(
  rule: Partial<FinancialProfessionalRule>,
  refDate: string,
): { active: boolean; reason?: string } {
  if (rule.is_active === false) return { active: false, reason: "rule_inactive" };
  if (rule.start_date && rule.start_date > refDate) return { active: false, reason: "not_started" };
  if (rule.end_date && rule.end_date < refDate) return { active: false, reason: "expired" };
  return { active: true };
}

/**
 * Financial Calculation Engine — pure function.
 * No DB writes. No payments. No side effects beyond the returned logs.
 */
export function calculateFinancials(input: CalculationInput): CalculationResult {
  const logger = new CalculationLogger();
  const clinic_id = input.clinic_id ?? input.case.clinic_id;
  const currency =
    Object.values(input.rules ?? {}).find((r) => r?.currency)?.currency ?? "BRL";
  const refDate =
    (typeof input.reference_date === "string"
      ? input.reference_date
      : input.reference_date?.toISOString().slice(0, 10)) ??
    input.case.reference_date ??
    new Date().toISOString().slice(0, 10);

  logger.info("calculation.start", {
    case_id: input.case.id,
    clinic_id,
    status: input.case.status,
    participants: input.participants.length,
  });

  const statusEligible = CALCULATION_ELIGIBLE_STATUSES.includes(String(input.case.status).toUpperCase());
  if (!statusEligible) {
    logger.warn("calculation.status_not_eligible", { status: input.case.status });
  }

  const bases = {
    gross: Number(input.case.gross_amount ?? 0),
    net: Number(input.case.net_amount ?? input.case.gross_amount ?? 0),
    received: Number(input.case.received_amount ?? input.case.gross_amount ?? 0),
  };

  const results: ParticipantCalculationResult[] = input.participants.map((p) => {
    const base: ParticipantCalculationResult = {
      participant_id: p.id,
      professional_id: p.professional_id,
      role: p.role ?? null,
      rule_type: null,
      rule_id: null,
      total: 0,
      currency,
      parts: [],
      skipped: true,
    };

    if (!statusEligible) {
      base.skip_reason = "status_not_eligible";
      return base;
    }

    const resolved = resolveRule(p, input.rules);
    if (!resolved) {
      logger.warn("participant.no_rule", { participant_id: p.id });
      base.skip_reason = "no_rule";
      return base;
    }

    const active = isRuleActive(resolved.rule, refDate);
    if (!active.active) {
      logger.info("participant.rule_inactive", { participant_id: p.id, reason: active.reason });
      base.rule_id = resolved.ruleId;
      base.rule_type = resolved.rule.rule_type;
      base.skip_reason = active.reason;
      return base;
    }

    const strategy = getRuleStrategy(resolved.rule.rule_type);
    if (!strategy) {
      logger.error("participant.strategy_missing", {
        participant_id: p.id,
        rule_type: resolved.rule.rule_type,
      });
      base.rule_id = resolved.ruleId;
      base.rule_type = resolved.rule.rule_type;
      base.skip_reason = "strategy_missing";
      return base;
    }

    const teeth = p.teeth_count ?? input.case.teeth_count ?? 0;
    const ctx: RuleStrategyContext = {
      rule: resolved.rule,
      participant: p,
      case: input.case,
      teeth,
      bases,
      resolveBase: (b?: PercentageBase | null) => {
        switch (b) {
          case "gross": return bases.gross;
          case "net": return bases.net;
          case "received": return bases.received;
          case "custom": return Number(p.metadata?.custom_base ?? 0);
          default: return bases.received;
        }
      },
      customEvaluator: input.customEvaluator,
    };

    try {
      const { total, parts } = strategy.calculate(ctx);
      const rounded = roundMoney(total);
      logger.debug("participant.calculated", {
        participant_id: p.id,
        rule_type: resolved.rule.rule_type,
        total: rounded,
      });
      return {
        ...base,
        rule_id: resolved.ruleId,
        rule_type: resolved.rule.rule_type,
        total: rounded,
        parts: parts.map((x) => ({ ...x, amount: roundMoney(x.amount) })),
        skipped: false,
        skip_reason: undefined,
      };
    } catch (err) {
      logger.error("participant.calculation_failed", {
        participant_id: p.id,
        error: err instanceof Error ? err.message : String(err),
      });
      base.rule_id = resolved.ruleId;
      base.rule_type = resolved.rule.rule_type;
      base.skip_reason = "exception";
      return base;
    }
  });

  const total = roundMoney(results.reduce((s, r) => s + r.total, 0));
  logger.info("calculation.done", { total, participants: results.length });

  return {
    case_id: input.case.id,
    clinic_id,
    status: input.case.status,
    currency,
    total,
    participants: results,
    logs: logger.drain(),
    generated_at: new Date().toISOString(),
  };
}
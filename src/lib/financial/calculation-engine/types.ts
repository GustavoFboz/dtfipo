// Financial Calculation Engine — types.
// Pure calculation layer. No side effects, no DB writes, no payments.

import type {
  FinancialProfessionalRule,
  PercentageBase,
  ProfessionalRuleType,
  RuleMaterial,
} from "../professional-rules/types";

export type { FinancialProfessionalRule, ProfessionalRuleType, PercentageBase, RuleMaterial };

/** Case status snapshot at calculation time. */
export type CaseStatus =
  | "NOVO"
  | "EM_ANDAMENTO"
  | "FINALIZADO"
  | "ENTREGUE"
  | "PAGO"
  | (string & {});

/** Case input for calculation. Minimum required by the engine. */
export interface CalculationCase {
  id: string;
  clinic_id: string;
  status: CaseStatus;
  /** Total teeth involved in the case. */
  teeth_count?: number;
  /** Financial base amounts, if known. Engine never invents them. */
  gross_amount?: number;
  net_amount?: number;
  received_amount?: number;
  material?: RuleMaterial;
  reference_date?: string;
  /** Free-form extras propagated to CUSTOM rules. */
  extras?: Record<string, number>;
}

/** Participant input — links a professional to a case with an optional inline rule. */
export interface CalculationParticipant {
  id: string;
  professional_id: string;
  role?: string | null;
  /** Reference to a stored rule, resolved by the caller. */
  payment_rule_id?: string | null;
  /** Inline override — takes precedence over payment_rule_id. */
  inline_rule?: Partial<FinancialProfessionalRule> & { rule_type: ProfessionalRuleType };
  /** Simple overrides (used when no full rule is provided). */
  percentage?: number | null;
  fixed_amount?: number | null;
  /** Per-participant tooth count override. Falls back to case.teeth_count. */
  teeth_count?: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CalculationInput {
  case: CalculationCase;
  participants: CalculationParticipant[];
  /** Resolved rules by id — provided by the caller. */
  rules?: Record<string, FinancialProfessionalRule>;
  /** Explicit clinic scope; defaults to case.clinic_id. */
  clinic_id?: string;
  /** Reference date used for rule.activeAt checks. */
  reference_date?: string | Date;
  /** Custom evaluator for CUSTOM rules. */
  customEvaluator?: CustomRuleEvaluator;
}

export type CustomRuleEvaluator = (args: {
  rule: Partial<FinancialProfessionalRule> & { rule_type: "CUSTOM" };
  participant: CalculationParticipant;
  case: CalculationCase;
}) => { total: number; parts: CalculationPart[] };

export interface CalculationPart {
  label: string;
  amount: number;
  kind?: "fixed" | "per_case" | "per_tooth" | "percentage" | "custom";
  meta?: Record<string, unknown>;
}

export interface ParticipantCalculationResult {
  participant_id: string;
  professional_id: string;
  role: string | null;
  rule_type: ProfessionalRuleType | null;
  rule_id: string | null;
  total: number;
  currency: string;
  parts: CalculationPart[];
  /** True when the rule was skipped (inactive, unresolved, unsupported status). */
  skipped: boolean;
  skip_reason?: string;
}

export interface CalculationLogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  details?: Record<string, unknown>;
  at: string;
}

export interface CalculationResult {
  case_id: string;
  clinic_id: string;
  status: CaseStatus;
  currency: string;
  total: number;
  participants: ParticipantCalculationResult[];
  logs: CalculationLogEntry[];
  generated_at: string;
}

/**
 * Contract every rule strategy implements. Adding a new rule type =
 * dropping a new strategy into `rules/` and registering it in the engine.
 */
export interface RuleStrategy {
  type: ProfessionalRuleType;
  calculate: (ctx: RuleStrategyContext) => { total: number; parts: CalculationPart[] };
}

export interface RuleStrategyContext {
  rule: Partial<FinancialProfessionalRule> & { rule_type: ProfessionalRuleType };
  participant: CalculationParticipant;
  case: CalculationCase;
  teeth: number;
  bases: {
    gross: number;
    net: number;
    received: number;
  };
  resolveBase: (base?: PercentageBase | null) => number;
  customEvaluator?: CustomRuleEvaluator;
}

/** Statuses that unlock financial calculation. */
export const CALCULATION_ELIGIBLE_STATUSES: ReadonlyArray<string> = [
  "FINALIZADO",
  "ENTREGUE",
  "PAGO",
];

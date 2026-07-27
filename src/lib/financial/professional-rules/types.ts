// Regras financeiras por profissional.

export type ProfessionalRuleType =
  | "FIXED"
  | "PER_CASE"
  | "PER_TOOTH"
  | "PERCENTAGE"
  | "HYBRID"
  | "CUSTOM";

export type PercentageBase = "gross" | "net" | "received" | "custom";
export type RuleMaterial = "any" | "zirconia" | "dissilicato" | "implant";

export type HybridComponent =
  | { kind: "fixed"; amount: number }
  | { kind: "per_case"; amount: number }
  | { kind: "per_tooth"; amount: number; material?: RuleMaterial }
  | { kind: "percentage"; percentage: number; base?: PercentageBase };

export type FinancialProfessionalRule = {
  id: string;
  clinic_id: string;
  user_id: string;

  name: string;
  description: string | null;

  rule_type: ProfessionalRuleType;

  fixed_amount: number | null;
  amount_per_case: number | null;
  amount_per_tooth: number | null;
  percentage: number | null;
  percentage_base: PercentageBase | null;

  components: HybridComponent[];
  formula: string | null;
  parameters: Record<string, unknown>;

  applies_to_case_type_id: string | null;
  applies_to_material: RuleMaterial | null;
  applies_to_phase_id: string | null;
  applies_to_stage_id: string | null;
  applies_to_filters: Record<string, unknown>;

  start_date: string;
  end_date: string | null;
  is_active: boolean;
  priority: number;

  currency: string;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewFinancialProfessionalRule = Omit<
  FinancialProfessionalRule,
  "id" | "created_at" | "updated_at" | "created_by"
> & { clinic_id?: string };

/** Contexto de cálculo — usado pelo motor futuro. */
export type RuleCalculationContext = {
  teeth_count?: number;
  cases_count?: number;
  received_amount?: number;
  gross_amount?: number;
  net_amount?: number;
  material?: RuleMaterial;
  reference_date?: string;
  extras?: Record<string, number>;
};

export type RuleCalculationBreakdown = {
  rule_id: string;
  rule_type: ProfessionalRuleType;
  total: number;
  parts: Array<{ label: string; amount: number }>;
};

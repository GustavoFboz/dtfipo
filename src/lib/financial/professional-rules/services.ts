import { supabase } from "@/integrations/supabase/client";
import { currentClinicId } from "../services";
import type {
  FinancialProfessionalRule,
  NewFinancialProfessionalRule,
  RuleCalculationBreakdown,
  RuleCalculationContext,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const T = "financial_professional_rules";

export const professionalRulesService = {
  async list(filters: { user_id?: string; is_active?: boolean; clinic_id?: string } = {}): Promise<
    FinancialProfessionalRule[]
  > {
    let q = db.from(T).select("*").order("priority", { ascending: false }).order("created_at", { ascending: false });
    for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== null) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FinancialProfessionalRule[];
  },

  async get(id: string): Promise<FinancialProfessionalRule | null> {
    const { data, error } = await db.from(T).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data ?? null) as FinancialProfessionalRule | null;
  },

  async create(input: Partial<NewFinancialProfessionalRule>): Promise<FinancialProfessionalRule> {
    const clinic_id = input.clinic_id ?? (await currentClinicId());
    const { data, error } = await db.from(T).insert({ ...input, clinic_id }).select("*").single();
    if (error) throw error;
    return data as FinancialProfessionalRule;
  },

  async update(id: string, patch: Partial<FinancialProfessionalRule>): Promise<FinancialProfessionalRule> {
    const { data, error } = await db.from(T).update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data as FinancialProfessionalRule;
  },

  async remove(id: string): Promise<void> {
    const { error } = await db.from(T).delete().eq("id", id);
    if (error) throw error;
  },

  /**
   * Motor de cálculo. Aplica a regra sobre um contexto e retorna o total + breakdown.
   * Preparado para uso futuro em fechamentos e apontamentos automáticos.
   */
  calculate(rule: FinancialProfessionalRule, ctx: RuleCalculationContext): RuleCalculationBreakdown {
    const parts: Array<{ label: string; amount: number }> = [];
    const teeth = ctx.teeth_count ?? 0;
    const cases = ctx.cases_count ?? 0;
    const base = (b?: string | null) => {
      switch (b) {
        case "received": return ctx.received_amount ?? 0;
        case "net": return ctx.net_amount ?? 0;
        case "gross": return ctx.gross_amount ?? 0;
        default: return ctx.received_amount ?? ctx.gross_amount ?? 0;
      }
    };

    const pushFixed = (amt: number | null | undefined) => {
      if (amt && amt !== 0) parts.push({ label: "Fixo", amount: Number(amt) });
    };
    const pushPerCase = (amt: number | null | undefined) => {
      if (amt && cases > 0) parts.push({ label: `Por caso (${cases})`, amount: Number(amt) * cases });
    };
    const pushPerTooth = (amt: number | null | undefined) => {
      if (amt && teeth > 0) parts.push({ label: `Por dente (${teeth})`, amount: Number(amt) * teeth });
    };
    const pushPercentage = (pct: number | null | undefined, b?: string | null) => {
      if (!pct) return;
      const v = base(b) * (Number(pct) / 100);
      parts.push({ label: `${pct}% sobre ${b ?? "recebido"}`, amount: v });
    };

    switch (rule.rule_type) {
      case "FIXED":
        pushFixed(rule.fixed_amount);
        break;
      case "PER_CASE":
        pushPerCase(rule.amount_per_case);
        break;
      case "PER_TOOTH":
        pushPerTooth(rule.amount_per_tooth);
        break;
      case "PERCENTAGE":
        pushPercentage(rule.percentage, rule.percentage_base);
        break;
      case "HYBRID": {
        // Combina campos escalares + components[]
        pushFixed(rule.fixed_amount);
        pushPerCase(rule.amount_per_case);
        pushPerTooth(rule.amount_per_tooth);
        pushPercentage(rule.percentage, rule.percentage_base);
        for (const c of rule.components ?? []) {
          if (c.kind === "fixed") pushFixed(c.amount);
          else if (c.kind === "per_case") pushPerCase(c.amount);
          else if (c.kind === "per_tooth") pushPerTooth(c.amount);
          else if (c.kind === "percentage") pushPercentage(c.percentage, c.base);
        }
        break;
      }
      case "CUSTOM":
        // Parâmetros livres — o cálculo real fica para o consumidor.
        // Aqui apenas ecoamos parts a partir de components para consistência.
        for (const c of rule.components ?? []) {
          if (c.kind === "fixed") pushFixed(c.amount);
          else if (c.kind === "per_case") pushPerCase(c.amount);
          else if (c.kind === "per_tooth") pushPerTooth(c.amount);
          else if (c.kind === "percentage") pushPercentage(c.percentage, c.base);
        }
        break;
    }

    const total = parts.reduce((s, p) => s + p.amount, 0);
    return { rule_id: rule.id, rule_type: rule.rule_type, total, parts };
  },

  /** Filtra as regras ativas na data de referência. */
  activeAt(rules: FinancialProfessionalRule[], date: string | Date = new Date()): FinancialProfessionalRule[] {
    const d = typeof date === "string" ? date : date.toISOString().slice(0, 10);
    return rules.filter(
      (r) => r.is_active && r.start_date <= d && (r.end_date == null || r.end_date >= d),
    );
  },
};

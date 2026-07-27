import { supabase } from "@/integrations/supabase/client";
import type { CalculationResult } from "../calculation-engine/types";
import type {
  EarningBatchEntry,
  EarningLifecycleStatus,
  ProfessionalEarning,
  ProfessionalEarningEvent,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Mapeia um resultado do motor de cálculo para entradas do ledger.
 * Só considera participantes NÃO pulados com valor > 0.
 */
export function calculationToEarningEntries(result: CalculationResult): EarningBatchEntry[] {
  return result.participants
    .filter((p) => !p.skipped && p.total > 0)
    .map((p) => ({
      participant_id: p.participant_id,
      professional_id: p.professional_id,
      role: p.role,
      rule_id: p.rule_id,
      rule_type: p.rule_type,
      rule_snapshot: {},
      calculation_snapshot: {
        status: result.status,
        parts: p.parts,
        currency: p.currency,
      },
      parts: p.parts,
      amount: p.total,
      currency: p.currency,
    }));
}

export const professionalEarningsService = {
  /**
   * Registra em lote os ganhos calculados. Idempotente por (case_id, participant_id, trigger_status).
   * Cria cada ganho como `pending` — nunca gera saldo disponível diretamente.
   */
  async registerFromCalculation(args: {
    clinicId: string;
    caseId: string;
    triggerStatus: string;
    productionRecordId?: string | null;
    result: CalculationResult;
  }): Promise<{ success: boolean; inserted?: number; skipped?: number; error?: string }> {
    const entries = calculationToEarningEntries(args.result);
    if (entries.length === 0) return { success: true, inserted: 0, skipped: 0 };

    const { data, error } = await db.rpc("register_professional_earnings_batch", {
      _clinic_id: args.clinicId,
      _case_id: args.caseId,
      _trigger_status: args.triggerStatus,
      _production_record_id: args.productionRecordId ?? null,
      _entries: entries,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; inserted?: number; skipped?: number; error?: string };
  },

  /** Transiciona o status de um ganho, respeitando o fluxo pendente→aprovado→disponível→pago. */
  async transition(
    earningId: string,
    to: EarningLifecycleStatus,
    notes?: string,
  ): Promise<{ success: boolean; from?: string; to?: string; error?: string }> {
    const { data, error } = await db.rpc("transition_professional_earning", {
      _earning_id: earningId,
      _to_status: to,
      _notes: notes ?? null,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; from?: string; to?: string; error?: string };
  },

  async approve(id: string, notes?: string) { return this.transition(id, "approved", notes); },
  async release(id: string, notes?: string) { return this.transition(id, "available", notes); },
  async pay(id: string, notes?: string)     { return this.transition(id, "paid", notes); },
  async cancel(id: string, notes?: string)  { return this.transition(id, "canceled", notes); },

  async list(filters: {
    clinic_id?: string;
    case_id?: string;
    professional_id?: string;
    lifecycle_status?: EarningLifecycleStatus;
    limit?: number;
  } = {}): Promise<ProfessionalEarning[]> {
    let q = db.from("financial_professional_earnings").select("*")
      .order("created_at", { ascending: false });
    for (const [k, v] of Object.entries(filters)) {
      if (k === "limit") { q = q.limit(v as number); continue; }
      if (v !== undefined && v !== null) q = q.eq(k, v);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ProfessionalEarning[];
  },

  async get(id: string): Promise<ProfessionalEarning | null> {
    const { data, error } = await db.from("financial_professional_earnings")
      .select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data ?? null) as ProfessionalEarning | null;
  },

  async history(earningId: string): Promise<ProfessionalEarningEvent[]> {
    const { data, error } = await db.from("financial_professional_earnings_events")
      .select("*").eq("earning_id", earningId).order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProfessionalEarningEvent[];
  },
};
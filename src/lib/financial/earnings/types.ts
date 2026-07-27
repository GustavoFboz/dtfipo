// Ledger de ganhos profissionais — camada entre o motor de cálculo e a carteira.

export type EarningLifecycleStatus =
  | "pending"
  | "approved"
  | "available"
  | "paid"
  | "canceled";

export interface ProfessionalEarning {
  id: string;
  clinic_id: string;
  case_id: string;
  participant_id: string;
  professional_id: string;
  production_record_id: string | null;
  trigger_status: string;
  role: string | null;
  rule_id: string | null;
  rule_type: string | null;
  rule_snapshot: Record<string, unknown>;
  calculation_snapshot: Record<string, unknown>;
  parts: unknown[];
  amount: number;
  currency: string;
  lifecycle_status: EarningLifecycleStatus;
  approved_at: string | null;
  approved_by: string | null;
  released_at: string | null;
  released_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalEarningEvent {
  id: string;
  clinic_id: string;
  earning_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  amount: number | null;
  actor_id: string | null;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface EarningBatchEntry {
  participant_id: string;
  professional_id: string;
  role?: string | null;
  rule_id?: string | null;
  rule_type?: string | null;
  rule_snapshot?: Record<string, unknown>;
  calculation_snapshot?: Record<string, unknown>;
  parts?: unknown[];
  amount: number;
  currency?: string;
}

/** Transições válidas (espelha o CHECK do banco). */
export const EARNING_TRANSITIONS: Record<EarningLifecycleStatus, EarningLifecycleStatus[]> = {
  pending:   ["approved", "canceled"],
  approved:  ["available", "canceled"],
  available: ["paid", "canceled"],
  paid:      [],
  canceled:  [],
};

export function canTransition(from: EarningLifecycleStatus, to: EarningLifecycleStatus): boolean {
  return EARNING_TRANSITIONS[from]?.includes(to) ?? false;
}
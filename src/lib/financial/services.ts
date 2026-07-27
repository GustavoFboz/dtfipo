// Service layer for the Financeiro module.
// All queries are scoped to the current user's clinic by RLS; we still
// pass clinic_id on inserts to satisfy NOT NULL + policy WITH CHECK.

import { supabase } from "@/integrations/supabase/client";
import type {
  FinancialAccount,
  FinancialBankAccount,
  FinancialCashFlow,
  FinancialCategory,
  FinancialInstallment,
  FinancialPaymentRequest,
  FinancialPaymentRule,
  FinancialProductionRecord,
  FinancialReport,
  FinancialTransaction,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function currentClinicId(): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Não autenticado");
  const { data, error } = await db.from("profiles").select("clinic_id").eq("id", uid).maybeSingle();
  if (error) throw error;
  if (!data?.clinic_id) throw new Error("Usuário sem empresa vinculada");
  return data.clinic_id as string;
}

function tableService<T>(table: string) {
  return {
    async list(filters: Record<string, unknown> = {}): Promise<T[]> {
      let q = db.from(table).select("*").order("created_at", { ascending: false });
      for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === null) continue;
        q = q.eq(k, v);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as T[];
    },
    async get(id: string): Promise<T | null> {
      const { data, error } = await db.from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as T | null;
    },
    async create(input: Partial<T>): Promise<T> {
      const clinic_id = (input as { clinic_id?: string }).clinic_id ?? (await currentClinicId());
      const { data, error } = await db
        .from(table)
        .insert({ ...input, clinic_id })
        .select("*")
        .single();
      if (error) throw error;
      return data as T;
    },
    async update(id: string, patch: Partial<T>): Promise<T> {
      const { data, error } = await db.from(table).update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      return data as T;
    },
    async remove(id: string): Promise<void> {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

export const financialAccountsService = tableService<FinancialAccount>("financial_accounts");
export const financialBankAccountsService = tableService<FinancialBankAccount>("financial_bank_accounts");
export const financialWalletsService = tableService<import("./types").FinancialWallet>("financial_wallets");
export const financialCategoriesService = tableService<FinancialCategory>("financial_categories");
export const financialPaymentRulesService = tableService<FinancialPaymentRule>("financial_payment_rules");
export const financialTransactionsService = tableService<FinancialTransaction>("financial_transactions");
export const financialInstallmentsService = tableService<FinancialInstallment>("financial_installments");
export const financialProductionService = tableService<FinancialProductionRecord>("financial_production_records");
export const financialPaymentRequestsService = tableService<FinancialPaymentRequest>("financial_payment_requests");
export const financialCashFlowService = tableService<FinancialCashFlow>("financial_cash_flow");
export const financialReportsService = tableService<FinancialReport>("financial_reports");

export { currentClinicId };

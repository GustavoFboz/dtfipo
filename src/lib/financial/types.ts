// Domain types for the Financeiro module.
// Kept separate from the auto-generated Supabase types to avoid conflicts.

export type FinancialAccountType = "asset" | "liability" | "income" | "expense" | "equity";
export type FinancialCategoryKind = "income" | "expense" | "transfer" | "other";
export type FinancialWalletKind = "cash" | "pix" | "credit_card" | "debit_card" | "digital" | "other";
export type FinancialBankAccountType = "checking" | "savings" | "investment" | "other";

export type FinancialTransactionDirection = "receivable" | "payable" | "transfer" | "adjustment";
export type FinancialTransactionStatus =
  | "pending"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "canceled"
  | "scheduled";

export type FinancialInstallmentStatus =
  | "pending"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "canceled";

export type FinancialRuleDirection = "receivable" | "payable";
export type FinancialRuleFrequency = "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

export type FinancialProductionStatus = "draft" | "confirmed" | "billed" | "canceled";

export type FinancialPaymentRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "canceled";

export type FinancialReportKind =
  | "cash_flow"
  | "dre"
  | "receivables"
  | "payables"
  | "production"
  | "custom";

// ---------- Base ----------
export type FinancialBase = {
  id: string;
  clinic_id: string;
  created_at: string;
  updated_at: string;
};

// ---------- Records ----------
export type FinancialAccount = FinancialBase & {
  code: string | null;
  name: string;
  type: FinancialAccountType;
  parent_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
};

export type FinancialBankAccount = FinancialBase & {
  name: string;
  bank_name: string | null;
  bank_code: string | null;
  agency: string | null;
  account_number: string | null;
  account_type: FinancialBankAccountType | null;
  opening_balance: number;
  current_balance: number;
  currency: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
};

export type FinancialWallet = FinancialBase & {
  name: string;
  kind: FinancialWalletKind;
  bank_account_id: string | null;
  opening_balance: number;
  current_balance: number;
  currency: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
};

export type FinancialCategory = FinancialBase & {
  name: string;
  kind: FinancialCategoryKind;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  position: number;
  created_by: string | null;
};

export type FinancialPaymentRule = FinancialBase & {
  name: string;
  direction: FinancialRuleDirection;
  amount: number;
  category_id: string | null;
  account_id: string | null;
  wallet_id: string | null;
  frequency: FinancialRuleFrequency;
  interval_days: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  next_run_at: string | null;
  is_active: boolean;
  auto_create: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
};

export type FinancialTransaction = FinancialBase & {
  direction: FinancialTransactionDirection;
  status: FinancialTransactionStatus;
  description: string;
  amount: number;
  paid_amount: number;
  currency: string;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  competence_date: string | null;
  category_id: string | null;
  account_id: string | null;
  wallet_id: string | null;
  bank_account_id: string | null;
  rule_id: string | null;
  case_id: string | null;
  patient_id: string | null;
  counterparty_name: string | null;
  counterparty_document: string | null;
  reference: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
};

export type FinancialInstallment = FinancialBase & {
  transaction_id: string;
  installment_number: number;
  total_installments: number;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_at: string | null;
  status: FinancialInstallmentStatus;
  wallet_id: string | null;
  bank_account_id: string | null;
  notes: string | null;
};

export type FinancialProductionRecord = FinancialBase & {
  case_id: string | null;
  user_id: string | null;
  reference_date: string;
  description: string | null;
  quantity: number;
  unit_value: number;
  total_value: number;
  status: FinancialProductionStatus;
  transaction_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
};

export type FinancialPaymentRequest = FinancialBase & {
  requested_by: string | null;
  approved_by: string | null;
  status: FinancialPaymentRequestStatus;
  title: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  category_id: string | null;
  wallet_id: string | null;
  bank_account_id: string | null;
  transaction_id: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  metadata: Record<string, unknown>;
};

export type FinancialCashFlow = FinancialBase & {
  reference_date: string;
  bank_account_id: string | null;
  wallet_id: string | null;
  opening_balance: number;
  inflow: number;
  outflow: number;
  closing_balance: number;
  projected: boolean;
  metadata: Record<string, unknown>;
};

export type FinancialReport = FinancialBase & {
  name: string;
  kind: FinancialReportKind;
  description: string | null;
  filters: Record<string, unknown>;
  columns: unknown[];
  is_shared: boolean;
  created_by: string | null;
};

// ---------- Insert helpers ----------
export type NewFinancialTransaction = Omit<
  FinancialTransaction,
  "id" | "created_at" | "updated_at" | "clinic_id" | "created_by"
> & { clinic_id?: string };

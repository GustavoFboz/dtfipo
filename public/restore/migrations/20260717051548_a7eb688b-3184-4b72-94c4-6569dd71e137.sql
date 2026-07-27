
-- =========================================================================
-- MÓDULO FINANCEIRO — estrutura multiempresa
-- =========================================================================

-- Helper: garantir que o usuário atual é staff da empresa do registro
CREATE OR REPLACE FUNCTION public.fin_can_manage(_clinic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _clinic_id IS NOT NULL
    AND _clinic_id = public.current_user_clinic_id()
    AND public.is_staff(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.fin_can_view(_clinic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _clinic_id IS NOT NULL
    AND _clinic_id = public.current_user_clinic_id()
$$;

-- =========================================================================
-- 1) financial_accounts (plano de contas)
-- =========================================================================
CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','income','expense','equity')),
  parent_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_accounts TO authenticated;
GRANT ALL ON public.financial_accounts TO service_role;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_accounts_view ON public.financial_accounts FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_accounts_manage ON public.financial_accounts FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_accounts_clinic ON public.financial_accounts(clinic_id);
CREATE INDEX idx_fin_accounts_parent ON public.financial_accounts(parent_id);
CREATE TRIGGER trg_fin_accounts_updated BEFORE UPDATE ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 2) financial_bank_accounts
-- =========================================================================
CREATE TABLE public.financial_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  bank_name text,
  bank_code text,
  agency text,
  account_number text,
  account_type text CHECK (account_type IN ('checking','savings','investment','other')),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_bank_accounts TO authenticated;
GRANT ALL ON public.financial_bank_accounts TO service_role;
ALTER TABLE public.financial_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_banks_view ON public.financial_bank_accounts FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_banks_manage ON public.financial_bank_accounts FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_banks_clinic ON public.financial_bank_accounts(clinic_id);
CREATE TRIGGER trg_fin_banks_updated BEFORE UPDATE ON public.financial_bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 3) financial_wallets (caixa, pix, cartão…)
-- =========================================================================
CREATE TABLE public.financial_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'cash' CHECK (kind IN ('cash','pix','credit_card','debit_card','digital','other')),
  bank_account_id uuid REFERENCES public.financial_bank_accounts(id) ON DELETE SET NULL,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_wallets TO authenticated;
GRANT ALL ON public.financial_wallets TO service_role;
ALTER TABLE public.financial_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_wallets_view ON public.financial_wallets FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_wallets_manage ON public.financial_wallets FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_wallets_clinic ON public.financial_wallets(clinic_id);
CREATE TRIGGER trg_fin_wallets_updated BEFORE UPDATE ON public.financial_wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 4) financial_categories
-- =========================================================================
CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense','transfer','other')),
  parent_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  color text,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  position int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_categories TO authenticated;
GRANT ALL ON public.financial_categories TO service_role;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_cats_view ON public.financial_categories FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_cats_manage ON public.financial_categories FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_cats_clinic ON public.financial_categories(clinic_id);
CREATE INDEX idx_fin_cats_parent ON public.financial_categories(parent_id);
CREATE TRIGGER trg_fin_cats_updated BEFORE UPDATE ON public.financial_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 5) financial_payment_rules (recorrências / regras)
-- =========================================================================
CREATE TABLE public.financial_payment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('receivable','payable')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  wallet_id uuid REFERENCES public.financial_wallets(id) ON DELETE SET NULL,
  frequency text NOT NULL CHECK (frequency IN ('once','daily','weekly','monthly','yearly','custom')),
  interval_days int,
  day_of_month int,
  start_date date NOT NULL,
  end_date date,
  next_run_at date,
  is_active boolean NOT NULL DEFAULT true,
  auto_create boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_payment_rules TO authenticated;
GRANT ALL ON public.financial_payment_rules TO service_role;
ALTER TABLE public.financial_payment_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_rules_view ON public.financial_payment_rules FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_rules_manage ON public.financial_payment_rules FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_rules_clinic ON public.financial_payment_rules(clinic_id);
CREATE INDEX idx_fin_rules_next_run ON public.financial_payment_rules(next_run_at) WHERE is_active = true;
CREATE TRIGGER trg_fin_rules_updated BEFORE UPDATE ON public.financial_payment_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 6) financial_transactions (lançamentos)
-- =========================================================================
CREATE TABLE public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('receivable','payable','transfer','adjustment')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','partially_paid','overdue','canceled','scheduled')),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  paid_at timestamptz,
  competence_date date,
  category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  wallet_id uuid REFERENCES public.financial_wallets(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.financial_bank_accounts(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.financial_payment_rules(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  counterparty_name text,
  counterparty_document text,
  reference text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_tx_view ON public.financial_transactions FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_tx_manage ON public.financial_transactions FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_tx_clinic ON public.financial_transactions(clinic_id);
CREATE INDEX idx_fin_tx_status ON public.financial_transactions(clinic_id, status);
CREATE INDEX idx_fin_tx_due ON public.financial_transactions(clinic_id, due_date);
CREATE INDEX idx_fin_tx_case ON public.financial_transactions(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX idx_fin_tx_patient ON public.financial_transactions(patient_id) WHERE patient_id IS NOT NULL;
CREATE TRIGGER trg_fin_tx_updated BEFORE UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 7) financial_installments (parcelas)
-- =========================================================================
CREATE TABLE public.financial_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  installment_number int NOT NULL,
  total_installments int NOT NULL,
  amount numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','partially_paid','overdue','canceled')),
  wallet_id uuid REFERENCES public.financial_wallets(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.financial_bank_accounts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, installment_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_installments TO authenticated;
GRANT ALL ON public.financial_installments TO service_role;
ALTER TABLE public.financial_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_inst_view ON public.financial_installments FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_inst_manage ON public.financial_installments FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_inst_clinic ON public.financial_installments(clinic_id);
CREATE INDEX idx_fin_inst_tx ON public.financial_installments(transaction_id);
CREATE INDEX idx_fin_inst_due ON public.financial_installments(clinic_id, due_date);
CREATE TRIGGER trg_fin_inst_updated BEFORE UPDATE ON public.financial_installments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 8) financial_production_records (produção)
-- =========================================================================
CREATE TABLE public.financial_production_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_value numeric(14,2) NOT NULL DEFAULT 0,
  total_value numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','billed','canceled')),
  transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_production_records TO authenticated;
GRANT ALL ON public.financial_production_records TO service_role;
ALTER TABLE public.financial_production_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_prod_view ON public.financial_production_records FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_prod_manage ON public.financial_production_records FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_prod_clinic ON public.financial_production_records(clinic_id);
CREATE INDEX idx_fin_prod_case ON public.financial_production_records(case_id);
CREATE INDEX idx_fin_prod_date ON public.financial_production_records(clinic_id, reference_date);
CREATE TRIGGER trg_fin_prod_updated BEFORE UPDATE ON public.financial_production_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 9) financial_payment_requests (solicitações de pagamento)
-- =========================================================================
CREATE TABLE public.financial_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid','canceled')),
  title text NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL,
  due_date date,
  category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  wallet_id uuid REFERENCES public.financial_wallets(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.financial_bank_accounts(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  decision_reason text,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_payment_requests TO authenticated;
GRANT ALL ON public.financial_payment_requests TO service_role;
ALTER TABLE public.financial_payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_req_view ON public.financial_payment_requests FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_req_manage ON public.financial_payment_requests FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_req_clinic ON public.financial_payment_requests(clinic_id);
CREATE INDEX idx_fin_req_status ON public.financial_payment_requests(clinic_id, status);
CREATE TRIGGER trg_fin_req_updated BEFORE UPDATE ON public.financial_payment_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 10) financial_cash_flow (snapshots diários)
-- =========================================================================
CREATE TABLE public.financial_cash_flow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  reference_date date NOT NULL,
  bank_account_id uuid REFERENCES public.financial_bank_accounts(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES public.financial_wallets(id) ON DELETE CASCADE,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  inflow numeric(14,2) NOT NULL DEFAULT 0,
  outflow numeric(14,2) NOT NULL DEFAULT 0,
  closing_balance numeric(14,2) NOT NULL DEFAULT 0,
  projected boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_cash_flow TO authenticated;
GRANT ALL ON public.financial_cash_flow TO service_role;
ALTER TABLE public.financial_cash_flow ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_cf_view ON public.financial_cash_flow FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_cf_manage ON public.financial_cash_flow FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_cf_clinic_date ON public.financial_cash_flow(clinic_id, reference_date);
CREATE TRIGGER trg_fin_cf_updated BEFORE UPDATE ON public.financial_cash_flow FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 11) financial_reports (relatórios salvos)
-- =========================================================================
CREATE TABLE public.financial_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cash_flow','dre','receivables','payables','production','custom')),
  description text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_reports TO authenticated;
GRANT ALL ON public.financial_reports TO service_role;
ALTER TABLE public.financial_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_rep_view ON public.financial_reports FOR SELECT TO authenticated USING (public.fin_can_view(clinic_id));
CREATE POLICY fin_rep_manage ON public.financial_reports FOR ALL TO authenticated USING (public.fin_can_manage(clinic_id)) WITH CHECK (public.fin_can_manage(clinic_id));
CREATE INDEX idx_fin_rep_clinic ON public.financial_reports(clinic_id);
CREATE TRIGGER trg_fin_rep_updated BEFORE UPDATE ON public.financial_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

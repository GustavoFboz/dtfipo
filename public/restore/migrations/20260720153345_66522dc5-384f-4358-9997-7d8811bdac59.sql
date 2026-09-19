-- 1. profiles: adicionar avatar_url e default para user_code
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ALTER COLUMN user_code SET DEFAULT ('U' || substr(replace(gen_random_uuid()::text,'-',''),1,10));
UPDATE public.profiles SET user_code = 'U' || substr(replace(gen_random_uuid()::text,'-',''),1,10) WHERE user_code IS NULL;

-- Helper trigger for updated_at (idempotent)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 2. case_financial_participants
CREATE TABLE IF NOT EXISTS public.case_financial_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid,
  clinic_id uuid,
  professional_id uuid,
  role text,
  rule_type text,
  percentage numeric,
  fixed_amount numeric,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.case_financial_participants TO authenticated;
GRANT ALL ON public.case_financial_participants TO service_role;
ALTER TABLE public.case_financial_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfp_all ON public.case_financial_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. backend_backups
CREATE TABLE IF NOT EXISTS public.backend_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  size_bytes bigint,
  schema_hash text,
  storage_path text
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.backend_backups TO authenticated;
GRANT ALL ON public.backend_backups TO service_role;
ALTER TABLE public.backend_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY bb_all ON public.backend_backups FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. financial_approvals + history
CREATE TABLE IF NOT EXISTS public.financial_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  status text NOT NULL DEFAULT 'pending',
  kind text,
  title text,
  description text,
  amount numeric,
  target_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid,
  decided_at timestamptz,
  decided_by uuid,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_approvals TO authenticated;
GRANT ALL ON public.financial_approvals TO service_role;
ALTER TABLE public.financial_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY fa_all ON public.financial_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.financial_approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid,
  scope text,
  target_id uuid,
  action text,
  actor_id uuid,
  from_status text,
  to_status text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_approval_history TO authenticated;
GRANT ALL ON public.financial_approval_history TO service_role;
ALTER TABLE public.financial_approval_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY fah_all ON public.financial_approval_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. financial_professional_earnings + events
CREATE TABLE IF NOT EXISTS public.financial_professional_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  professional_id uuid,
  case_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'BRL',
  lifecycle_status text NOT NULL DEFAULT 'pending',
  source_type text,
  source_id uuid,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_professional_earnings TO authenticated;
GRANT ALL ON public.financial_professional_earnings TO service_role;
ALTER TABLE public.financial_professional_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpe_all ON public.financial_professional_earnings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.financial_professional_earnings_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  earning_id uuid,
  event_type text,
  from_status text,
  to_status text,
  actor_id uuid,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_professional_earnings_events TO authenticated;
GRANT ALL ON public.financial_professional_earnings_events TO service_role;
ALTER TABLE public.financial_professional_earnings_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpee_all ON public.financial_professional_earnings_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. financial_closings
CREATE TABLE IF NOT EXISTS public.financial_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  year int NOT NULL,
  month int NOT NULL,
  status text NOT NULL DEFAULT 'open',
  totals jsonb DEFAULT '{}'::jsonb,
  notes text,
  opened_at timestamptz,
  closed_at timestamptz,
  paid_at timestamptz,
  reopened_at timestamptz,
  reopen_reason text,
  opened_by uuid,
  closed_by uuid,
  paid_by uuid,
  reopened_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_closings TO authenticated;
GRANT ALL ON public.financial_closings TO service_role;
ALTER TABLE public.financial_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fc_all ON public.financial_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. financial_payers
CREATE TABLE IF NOT EXISTS public.financial_payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  name text NOT NULL,
  kind text,
  tax_id text,
  email text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_payers TO authenticated;
GRANT ALL ON public.financial_payers TO service_role;
ALTER TABLE public.financial_payers ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpay_all ON public.financial_payers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. financial_cost_centers + links
CREATE TABLE IF NOT EXISTS public.financial_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  code text,
  name text NOT NULL,
  kind text,
  color text,
  icon text,
  position int DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  parent_id uuid,
  active boolean NOT NULL DEFAULT true,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_cost_centers TO authenticated;
GRANT ALL ON public.financial_cost_centers TO service_role;
ALTER TABLE public.financial_cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY fcc_all ON public.financial_cost_centers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.financial_cost_center_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_center_id uuid,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_cost_center_links TO authenticated;
GRANT ALL ON public.financial_cost_center_links TO service_role;
ALTER TABLE public.financial_cost_center_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY fccl_all ON public.financial_cost_center_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. financial_procedure_catalog + rates
CREATE TABLE IF NOT EXISTS public.financial_procedure_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  code text,
  name text NOT NULL,
  category text,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_procedure_catalog TO authenticated;
GRANT ALL ON public.financial_procedure_catalog TO service_role;
ALTER TABLE public.financial_procedure_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpc_all ON public.financial_procedure_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.financial_procedure_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  catalog_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'BRL',
  effective_from date,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_procedure_rates TO authenticated;
GRANT ALL ON public.financial_procedure_rates TO service_role;
ALTER TABLE public.financial_procedure_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpr_all ON public.financial_procedure_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. financial_payment_allocations
CREATE TABLE IF NOT EXISTS public.financial_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  payment_id uuid,
  earning_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_payment_allocations TO authenticated;
GRANT ALL ON public.financial_payment_allocations TO service_role;
ALTER TABLE public.financial_payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpa_all ON public.financial_payment_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. financial_production_mappings + logs
CREATE TABLE IF NOT EXISTS public.financial_production_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_production_mappings TO authenticated;
GRANT ALL ON public.financial_production_mappings TO service_role;
ALTER TABLE public.financial_production_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpm_all ON public.financial_production_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.financial_production_mapping_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid,
  action text,
  actor_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.financial_production_mapping_logs TO authenticated;
GRANT ALL ON public.financial_production_mapping_logs TO service_role;
ALTER TABLE public.financial_production_mapping_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY fpml_all ON public.financial_production_mapping_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. production_pricing_rules
CREATE TABLE IF NOT EXISTS public.production_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  name text,
  active boolean NOT NULL DEFAULT true,
  applies_to text,
  rule_type text,
  amount numeric,
  percentage numeric,
  currency text DEFAULT 'BRL',
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.production_pricing_rules TO authenticated;
GRANT ALL ON public.production_pricing_rules TO service_role;
ALTER TABLE public.production_pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ppr_all ON public.production_pricing_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 13. patient_attachments
CREATE TABLE IF NOT EXISTS public.patient_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid,
  clinic_id uuid,
  title text,
  description text,
  kind text DEFAULT 'other',
  file_url text,
  file_path text,
  thumbnail_url text,
  mime_type text,
  size_bytes bigint,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.patient_attachments TO authenticated;
GRANT ALL ON public.patient_attachments TO service_role;
ALTER TABLE public.patient_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_all ON public.patient_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. case_tooth_procedures
CREATE TABLE IF NOT EXISTS public.case_tooth_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid,
  tooth_number int,
  procedure text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.case_tooth_procedures TO authenticated;
GRANT ALL ON public.case_tooth_procedures TO service_role;
ALTER TABLE public.case_tooth_procedures ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctp_all ON public.case_tooth_procedures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 15. company_financial_settings
CREATE TABLE IF NOT EXISTS public.company_financial_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid,
  is_ipo boolean NOT NULL DEFAULT false,
  currency text DEFAULT 'BRL',
  closing_day int DEFAULT 1,
  closing_period text DEFAULT 'monthly',
  closing_config jsonb DEFAULT '{}'::jsonb,
  uses_clinic boolean NOT NULL DEFAULT true,
  uses_financial boolean NOT NULL DEFAULT true,
  uses_laboratory boolean NOT NULL DEFAULT true,
  auto_payments boolean NOT NULL DEFAULT false,
  require_approval boolean NOT NULL DEFAULT true,
  financial_categories jsonb DEFAULT '[]'::jsonb,
  allowed_payment_rule_types jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.company_financial_settings TO authenticated;
GRANT ALL ON public.company_financial_settings TO service_role;
ALTER TABLE public.company_financial_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfs_all ON public.company_financial_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC stubs
CREATE OR REPLACE FUNCTION public.decide_earning(_id uuid, _decision text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_status text;
BEGIN
  new_status := CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'canceled' ELSE _decision END;
  UPDATE public.financial_professional_earnings SET lifecycle_status = new_status, updated_at = now() WHERE id = _id;
  INSERT INTO public.financial_professional_earnings_events(earning_id, event_type, to_status, actor_id, notes)
  VALUES (_id, 'decide', new_status, auth.uid(), _notes);
  RETURN jsonb_build_object('success', true, 'to', new_status);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_earning(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_approval(_id uuid, _decision text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.financial_approvals SET status = _decision, decided_at = now(), decided_by = auth.uid(), notes = _notes, updated_at = now() WHERE id = _id;
  INSERT INTO public.financial_approval_history(approval_id, action, actor_id, to_status, notes)
  VALUES (_id, 'decide', auth.uid(), _decision, _notes);
  RETURN jsonb_build_object('success', true, 'to', _decision);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_approval(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_post_movement(_wallet uuid, _amount numeric, _kind text, _notes text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_wallets SET balance = COALESCE(balance,0) + _amount, updated_at = now() WHERE id = _wallet;
  INSERT INTO public.user_wallet_movements(wallet_id, amount, kind, notes, metadata, created_by)
  VALUES (_wallet, _amount, _kind, _notes, _metadata, auth.uid());
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.wallet_post_movement(uuid, numeric, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_transfer(_from uuid, _to uuid, _amount numeric, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wallet_post_movement(_from, -_amount, 'transfer_out', _notes, jsonb_build_object('to', _to));
  PERFORM public.wallet_post_movement(_to, _amount, 'transfer_in', _notes, jsonb_build_object('from', _from));
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.wallet_transfer(uuid, uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_professional_earnings_batch(_entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted int := 0;
BEGIN
  INSERT INTO public.financial_professional_earnings(clinic_id, professional_id, case_id, amount, lifecycle_status, source_type, source_id, notes, metadata)
  SELECT (e->>'clinic_id')::uuid, (e->>'professional_id')::uuid, (e->>'case_id')::uuid,
         COALESCE((e->>'amount')::numeric, 0), COALESCE(e->>'lifecycle_status','pending'),
         e->>'source_type', NULLIF(e->>'source_id','')::uuid, e->>'notes', COALESCE(e->'metadata','{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(_entries,'[]'::jsonb)) AS e;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'inserted', inserted);
END $$;
GRANT EXECUTE ON FUNCTION public.register_professional_earnings_batch(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_professional_earning(_id uuid, _to text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev text;
BEGIN
  SELECT lifecycle_status INTO prev FROM public.financial_professional_earnings WHERE id = _id;
  UPDATE public.financial_professional_earnings SET lifecycle_status = _to, updated_at = now() WHERE id = _id;
  INSERT INTO public.financial_professional_earnings_events(earning_id, event_type, from_status, to_status, actor_id, notes)
  VALUES (_id, 'transition', prev, _to, auth.uid(), _notes);
  RETURN jsonb_build_object('success', true, 'from', prev, 'to', _to);
END $$;
GRANT EXECUTE ON FUNCTION public.transition_professional_earning(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_financial_closing(_clinic uuid, _year int, _month int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.financial_closings WHERE clinic_id = _clinic AND year = _year AND month = _month;
  IF cid IS NULL THEN
    INSERT INTO public.financial_closings(clinic_id, year, month, status, opened_at, opened_by)
    VALUES (_clinic, _year, _month, 'open', now(), auth.uid()) RETURNING id INTO cid;
  ELSE
    UPDATE public.financial_closings SET status='open', opened_at=now(), opened_by=auth.uid(), updated_at=now() WHERE id = cid;
  END IF;
  RETURN jsonb_build_object('success', true, 'id', cid);
END $$;
GRANT EXECUTE ON FUNCTION public.open_financial_closing(uuid, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.advance_financial_closing(_id uuid, _to text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.financial_closings
  SET status = _to,
      closed_at = CASE WHEN _to = 'closed' THEN now() ELSE closed_at END,
      closed_by = CASE WHEN _to = 'closed' THEN auth.uid() ELSE closed_by END,
      paid_at = CASE WHEN _to = 'paid' THEN now() ELSE paid_at END,
      paid_by = CASE WHEN _to = 'paid' THEN auth.uid() ELSE paid_by END,
      updated_at = now()
  WHERE id = _id;
  RETURN jsonb_build_object('success', true, 'to', _to);
END $$;
GRANT EXECUTE ON FUNCTION public.advance_financial_closing(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_financial_closing(_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.financial_closings
  SET status = 'open', reopened_at = now(), reopened_by = auth.uid(), reopen_reason = _reason, updated_at = now()
  WHERE id = _id;
  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.reopen_financial_closing(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.backend_schema_hash()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(string_agg(table_name || ':' || column_name || ':' || data_type, ',' ORDER BY table_name, ordinal_position))
  FROM information_schema.columns WHERE table_schema = 'public'
$$;
GRANT EXECUTE ON FUNCTION public.backend_schema_hash() TO authenticated;

CREATE OR REPLACE FUNCTION public.export_backup()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN '-- backup placeholder generated at ' || now()::text;
END $$;
GRANT EXECUTE ON FUNCTION public.export_backup() TO authenticated;

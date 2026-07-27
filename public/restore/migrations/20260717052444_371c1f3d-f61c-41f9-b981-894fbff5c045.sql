
CREATE TABLE public.financial_professional_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name text NOT NULL,
  description text,

  -- Tipo principal da regra
  rule_type text NOT NULL CHECK (rule_type IN (
    'FIXED','PER_CASE','PER_TOOTH','PERCENTAGE','HYBRID','CUSTOM'
  )),

  -- Valores base (usados conforme o tipo)
  fixed_amount     numeric(14,2),          -- FIXED / HYBRID
  amount_per_case  numeric(14,2),          -- PER_CASE / HYBRID
  amount_per_tooth numeric(14,2),          -- PER_TOOTH / HYBRID
  percentage       numeric(6,3),           -- PERCENTAGE / HYBRID (ex: 30.000 = 30%)
  percentage_base  text CHECK (percentage_base IN ('gross','net','received','custom')),

  -- Componentes híbridos ou parâmetros livres para CUSTOM
  -- Ex: [{ "kind":"fixed", "amount":2000 }, { "kind":"per_tooth", "amount":25 }]
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  formula text,                            -- CUSTOM: expressão textual futura
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Filtros de aplicação
  applies_to_case_type_id uuid REFERENCES public.case_types(id) ON DELETE SET NULL,
  applies_to_material text CHECK (applies_to_material IN ('any','zirconia','dissilicato','implant')),
  applies_to_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  applies_to_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  applies_to_filters jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Vigência
  start_date date NOT NULL,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,

  -- Ordem/precedência entre regras do mesmo profissional
  priority int NOT NULL DEFAULT 0,

  -- Moeda e metadados
  currency text NOT NULL DEFAULT 'BRL',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_professional_rules TO authenticated;
GRANT ALL ON public.financial_professional_rules TO service_role;

ALTER TABLE public.financial_professional_rules ENABLE ROW LEVEL SECURITY;

-- Profissional vê as próprias regras; admin da empresa vê tudo da empresa
CREATE POLICY fpr_view ON public.financial_professional_rules
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  );

-- Somente admin da empresa gerencia
CREATE POLICY fpr_manage ON public.financial_professional_rules
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin());

CREATE INDEX idx_fpr_clinic  ON public.financial_professional_rules(clinic_id);
CREATE INDEX idx_fpr_user    ON public.financial_professional_rules(user_id);
CREATE INDEX idx_fpr_active  ON public.financial_professional_rules(clinic_id, user_id, is_active);
CREATE INDEX idx_fpr_period  ON public.financial_professional_rules(start_date, end_date);
CREATE INDEX idx_fpr_type    ON public.financial_professional_rules(rule_type);

CREATE TRIGGER trg_fpr_updated
  BEFORE UPDATE ON public.financial_professional_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

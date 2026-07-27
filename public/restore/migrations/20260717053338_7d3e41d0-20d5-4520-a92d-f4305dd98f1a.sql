
-- Enums
DO $$ BEGIN
  CREATE TYPE public.financial_production_event_type AS ENUM ('case_finalized','case_delivered','case_paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_production_event_status AS ENUM ('pending','processed','skipped','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_production_event_log_level AS ENUM ('info','warn','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Events table
CREATE TABLE IF NOT EXISTS public.financial_production_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  event_type public.financial_production_event_type NOT NULL,
  previous_status text,
  new_status text,
  triggered_by uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.financial_production_event_status NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  error_message text,
  related_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_production_events TO authenticated;
GRANT ALL ON public.financial_production_events TO service_role;

ALTER TABLE public.financial_production_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fpe_admin_view" ON public.financial_production_events
  FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

CREATE INDEX IF NOT EXISTS idx_fpe_clinic ON public.financial_production_events(clinic_id);
CREATE INDEX IF NOT EXISTS idx_fpe_case ON public.financial_production_events(case_id);
CREATE INDEX IF NOT EXISTS idx_fpe_status ON public.financial_production_events(status);
CREATE INDEX IF NOT EXISTS idx_fpe_type ON public.financial_production_events(event_type);
CREATE INDEX IF NOT EXISTS idx_fpe_created ON public.financial_production_events(created_at DESC);

CREATE TRIGGER trg_fpe_updated_at
  BEFORE UPDATE ON public.financial_production_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Logs table
CREATE TABLE IF NOT EXISTS public.financial_production_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.financial_production_events(id) ON DELETE CASCADE,
  listener_name text NOT NULL,
  level public.financial_production_event_log_level NOT NULL DEFAULT 'info',
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_production_event_logs TO authenticated;
GRANT ALL ON public.financial_production_event_logs TO service_role;

ALTER TABLE public.financial_production_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fpel_admin_view" ON public.financial_production_event_logs
  FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

CREATE INDEX IF NOT EXISTS idx_fpel_event ON public.financial_production_event_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_fpel_level ON public.financial_production_event_logs(level);
CREATE INDEX IF NOT EXISTS idx_fpel_created ON public.financial_production_event_logs(created_at DESC);

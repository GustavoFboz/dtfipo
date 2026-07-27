
-- ============ CASES: colunas ausentes ============
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS implant_system_id uuid,
  ADD COLUMN IF NOT EXISTS implant_system_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS implant_teeth integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tooth_implant_systems jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scan_jig_id uuid,
  ADD COLUMN IF NOT EXISTS tooth_case_types jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tooth_ti_bases jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============ IMPLANT_SYSTEMS: linha ============
ALTER TABLE public.implant_systems
  ADD COLUMN IF NOT EXISTS line text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 50;

-- ============ COMPONENT_CATEGORIES ============
CREATE TABLE IF NOT EXISTS public.component_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  position integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.component_categories TO authenticated;
GRANT ALL ON public.component_categories TO service_role;
ALTER TABLE public.component_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "component_categories_staff_all" ON public.component_categories;
CREATE POLICY "component_categories_staff_all" ON public.component_categories
  TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ IMPLANT_COMPONENT_TYPES ============
CREATE TABLE IF NOT EXISTS public.implant_component_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_component_types TO authenticated;
GRANT ALL ON public.implant_component_types TO service_role;
ALTER TABLE public.implant_component_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "implant_component_types_staff_all" ON public.implant_component_types;
CREATE POLICY "implant_component_types_staff_all" ON public.implant_component_types
  TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ IMPLANT_SYSTEM_COMPONENTS ============
CREATE TABLE IF NOT EXISTS public.implant_system_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  notes text,
  component_type_id uuid REFERENCES public.implant_component_types(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_isc_system ON public.implant_system_components(implant_system_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_system_components TO authenticated;
GRANT ALL ON public.implant_system_components TO service_role;
ALTER TABLE public.implant_system_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "implant_system_components_staff_all" ON public.implant_system_components;
CREATE POLICY "implant_system_components_staff_all" ON public.implant_system_components
  TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ STOCK_ITEMS: colunas ausentes ============
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS implant_system_component_id uuid REFERENCES public.implant_system_components(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.component_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type text;

-- ============ SCAN_JIGS ============
CREATE TABLE IF NOT EXISTS public.scan_jigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_jigs_system ON public.scan_jigs(implant_system_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_jigs TO authenticated;
GRANT ALL ON public.scan_jigs TO service_role;
ALTER TABLE public.scan_jigs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scan_jigs_staff_all" ON public.scan_jigs;
CREATE POLICY "scan_jigs_staff_all" ON public.scan_jigs
  TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Agora que scan_jigs existe, cria a FK do cases.scan_jig_id
DO $$ BEGIN
  ALTER TABLE public.cases
    ADD CONSTRAINT cases_scan_jig_id_fkey FOREIGN KEY (scan_jig_id) REFERENCES public.scan_jigs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.cases
    ADD CONSTRAINT cases_implant_system_id_fkey FOREIGN KEY (implant_system_id) REFERENCES public.implant_systems(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CASE_IMPLANT_TEETH ============
CREATE TABLE IF NOT EXISTS public.case_implant_teeth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  tooth_fdi integer NOT NULL,
  implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE SET NULL,
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  qty numeric NOT NULL DEFAULT 1,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cit_case ON public.case_implant_teeth(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_implant_teeth TO authenticated;
GRANT ALL ON public.case_implant_teeth TO service_role;
ALTER TABLE public.case_implant_teeth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "case_implant_teeth_access" ON public.case_implant_teeth;
CREATE POLICY "case_implant_teeth_access" ON public.case_implant_teeth
  TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- ============ MODEL_ANNOTATIONS ============
CREATE TABLE IF NOT EXISTS public.model_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  label text,
  content text,
  position jsonb,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_model_annotations_case ON public.model_annotations(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_annotations TO authenticated;
GRANT ALL ON public.model_annotations TO service_role;
ALTER TABLE public.model_annotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "model_annotations_access" ON public.model_annotations;
CREATE POLICY "model_annotations_access" ON public.model_annotations
  TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- ============ CASE_ACTIVITY (usada por delete/audit) ============
CREATE TABLE IF NOT EXISTS public.case_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_activity_case ON public.case_activity(case_id);
GRANT SELECT, INSERT ON public.case_activity TO authenticated;
GRANT ALL ON public.case_activity TO service_role;
ALTER TABLE public.case_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "case_activity_access" ON public.case_activity;
CREATE POLICY "case_activity_access" ON public.case_activity
  TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- ============ ADMIN_LOGS (deleteCase grava audit) ============
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_logs_admin_read" ON public.admin_logs;
CREATE POLICY "admin_logs_admin_read" ON public.admin_logs FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admin_logs_staff_insert" ON public.admin_logs;
CREATE POLICY "admin_logs_staff_insert" ON public.admin_logs FOR INSERT
  TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- Burrs (fresas)
CREATE TABLE public.burrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  material text NOT NULL CHECK (material IN ('zirconia','dissilicato')),
  installed_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.burrs ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_select_burrs ON public.burrs FOR SELECT USING (true);
CREATE POLICY open_insert_burrs ON public.burrs FOR INSERT WITH CHECK (true);
CREATE POLICY open_update_burrs ON public.burrs FOR UPDATE USING (true);
CREATE POLICY open_delete_burrs ON public.burrs FOR DELETE USING (true);

-- Burr usages
CREATE TABLE public.burr_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  burr_id uuid NOT NULL REFERENCES public.burrs(id) ON DELETE CASCADE,
  case_id uuid,
  material text NOT NULL CHECK (material IN ('zirconia','dissilicato')),
  teeth_count int NOT NULL DEFAULT 0,
  teeth_numbers int[] NOT NULL DEFAULT '{}',
  milled_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.burr_usages ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_select_bu ON public.burr_usages FOR SELECT USING (true);
CREATE POLICY open_insert_bu ON public.burr_usages FOR INSERT WITH CHECK (true);
CREATE POLICY open_update_bu ON public.burr_usages FOR UPDATE USING (true);
CREATE POLICY open_delete_bu ON public.burr_usages FOR DELETE USING (true);
CREATE INDEX idx_burr_usages_burr ON public.burr_usages(burr_id);
CREATE INDEX idx_burr_usages_case ON public.burr_usages(case_id);

-- Cases additions
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS teeth_numbers int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS elements_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elements_zirconia int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elements_dissilicato int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teeth_zirconia int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS teeth_dissilicato int[] NOT NULL DEFAULT '{}';

-- Multi-type per case
CREATE TABLE public.case_types_link (
  case_id uuid NOT NULL,
  case_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, case_type_id)
);
ALTER TABLE public.case_types_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_select_ctl ON public.case_types_link FOR SELECT USING (true);
CREATE POLICY open_insert_ctl ON public.case_types_link FOR INSERT WITH CHECK (true);
CREATE POLICY open_update_ctl ON public.case_types_link FOR UPDATE USING (true);
CREATE POLICY open_delete_ctl ON public.case_types_link FOR DELETE USING (true);
CREATE INDEX idx_case_types_link_case ON public.case_types_link(case_id);
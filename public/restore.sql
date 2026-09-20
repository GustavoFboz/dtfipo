
-- ===== 20260429222449_f985dd6c-ee9d-4bd3-862c-1af6b154e81b.sql =====

-- DOCTORS
CREATE TABLE public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PATIENTS
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CASE TYPES
CREATE TABLE public.case_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TOOTH COLORS
CREATE TABLE public.tooth_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- STAGES
CREATE TABLE public.stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CASES
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  case_type_id UUID REFERENCES public.case_types(id) ON DELETE SET NULL,
  tooth_color_id UUID REFERENCES public.tooth_colors(id) ON DELETE SET NULL,
  case_label TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  model_done BOOLEAN NOT NULL DEFAULT false,
  scan_done BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cases_status_idx ON public.cases(status);
CREATE INDEX cases_delivery_idx ON public.cases(delivery_date);

-- CASE STAGES (link)
CREATE TABLE public.case_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  pending_count INT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, stage_id)
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER cases_set_updated
BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: open access (internal lab tool, no auth yet)
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooth_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_stages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['doctors','patients','case_types','tooth_colors','stages','cases','case_stages']) LOOP
    EXECUTE format('CREATE POLICY "open_select_%I" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "open_insert_%I" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "open_update_%I" ON public.%I FOR UPDATE USING (true)', t, t);
    EXECUTE format('CREATE POLICY "open_delete_%I" ON public.%I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- Seed initial data
INSERT INTO public.stages (name, color, position) VALUES
  ('CADISTA', '#0a4dbd', 1),
  ('FORNO', '#f59e0b', 2),
  ('PROVISORIO', '#fef3c7', 3),
  ('MAQUIAGEM', '#ec4899', 4);

INSERT INTO public.tooth_colors (code) VALUES ('A1'),('A2'),('A3'),('A3.5'),('B1'),('B2'),('C1'),('D2');

INSERT INTO public.case_types (name, abbreviation) VALUES
  ('Coroa', 'Coroa'),
  ('Prótese Superior', 'Pr. Sup.'),
  ('Prótese Inferior', 'Pr. Inf.'),
  ('Faceta', 'Faceta'),
  ('Implante', 'Implante');

INSERT INTO public.doctors (name) VALUES ('Dr. Leandro');

INSERT INTO public.patients (name) VALUES ('Ieda Queiroz'), ('Abidon');

-- ===== 20260430230404_3685564c-19ae-43ec-a958-ce10f7931fa8.sql =====

-- Add folder fields to cases
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS folder_url text,
  ADD COLUMN IF NOT EXISTS folder_done boolean NOT NULL DEFAULT false;

-- Add stage dates to case_stages (for showing in history popup)
ALTER TABLE public.case_stages
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Storage bucket for patient photos (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-photos', 'patient-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public RLS policies for the bucket (internal-use system)
DROP POLICY IF EXISTS "patient_photos_select" ON storage.objects;
CREATE POLICY "patient_photos_select" ON storage.objects FOR SELECT USING (bucket_id = 'patient-photos');
DROP POLICY IF EXISTS "patient_photos_insert" ON storage.objects;
CREATE POLICY "patient_photos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'patient-photos');
DROP POLICY IF EXISTS "patient_photos_update" ON storage.objects;
CREATE POLICY "patient_photos_update" ON storage.objects FOR UPDATE USING (bucket_id = 'patient-photos');
DROP POLICY IF EXISTS "patient_photos_delete" ON storage.objects;
CREATE POLICY "patient_photos_delete" ON storage.objects FOR DELETE USING (bucket_id = 'patient-photos');

-- ===== 20260502132746_9fbd5723-3eaf-4124-8087-d1c006219120.sql =====

-- 1. PHASES (fases do fluxo: entrada, escaneamento, modelo, CAD, aprovação, produção, forno, caracterização, checkup, entrega)
CREATE TABLE public.phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_select_phases ON public.phases FOR SELECT USING (true);
CREATE POLICY open_insert_phases ON public.phases FOR INSERT WITH CHECK (true);
CREATE POLICY open_update_phases ON public.phases FOR UPDATE USING (true);
CREATE POLICY open_delete_phases ON public.phases FOR DELETE USING (true);

-- 2. STAGES: vincular cada etapa a uma fase
ALTER TABLE public.stages ADD COLUMN phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;

-- 3. CADISTAS
CREATE TABLE public.cadistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cadistas ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_select_cadistas ON public.cadistas FOR SELECT USING (true);
CREATE POLICY open_insert_cadistas ON public.cadistas FOR INSERT WITH CHECK (true);
CREATE POLICY open_update_cadistas ON public.cadistas FOR UPDATE USING (true);
CREATE POLICY open_delete_cadistas ON public.cadistas FOR DELETE USING (true);

-- 4. COMPONENTES (catálogo: implantes, análogos, etc)
CREATE TABLE public.components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  manufacturer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_select_components ON public.components FOR SELECT USING (true);
CREATE POLICY open_insert_components ON public.components FOR INSERT WITH CHECK (true);
CREATE POLICY open_update_components ON public.components FOR UPDATE USING (true);
CREATE POLICY open_delete_components ON public.components FOR DELETE USING (true);

-- 5. CASE_COMPONENTS (N:N caso ↔ componente)
CREATE TABLE public.case_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  component_id uuid NOT NULL,
  qty int NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id, component_id)
);
ALTER TABLE public.case_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_select_cc ON public.case_components FOR SELECT USING (true);
CREATE POLICY open_insert_cc ON public.case_components FOR INSERT WITH CHECK (true);
CREATE POLICY open_update_cc ON public.case_components FOR UPDATE USING (true);
CREATE POLICY open_delete_cc ON public.case_components FOR DELETE USING (true);

-- 6. CASES: cadista, current_stage_id, sibling_case_id, arch
ALTER TABLE public.cases ADD COLUMN cadista_id uuid;
ALTER TABLE public.cases ADD COLUMN current_stage_id uuid;
ALTER TABLE public.cases ADD COLUMN sibling_case_id uuid;
ALTER TABLE public.cases ADD COLUMN arch text; -- 'superior' | 'inferior' | null

-- 7. Migrar etapas existentes: para cada caso, escolher a case_stage de maior position como current_stage
UPDATE public.cases c
SET current_stage_id = sub.stage_id
FROM (
  SELECT DISTINCT ON (cs.case_id) cs.case_id, cs.stage_id
  FROM public.case_stages cs
  ORDER BY cs.case_id, cs.position DESC, cs.created_at DESC
) sub
WHERE sub.case_id = c.id;

-- 8. Seed de fases padrão
INSERT INTO public.phases (name, color, position) VALUES
  ('Entrada', '#22c55e', 1),
  ('Escaneamento', '#06b6d4', 2),
  ('Modelo', '#a855f7', 3),
  ('CAD', '#3b82f6', 4),
  ('Aprovação', '#f59e0b', 5),
  ('Produção', '#ef4444', 6),
  ('Forno', '#f97316', 7),
  ('Caracterização', '#ec4899', 8),
  ('Checkup', '#14b8a6', 9),
  ('Entrega', '#10b981', 10);

-- ===== 20260502134602_559379df-94e0-4ab3-8c8d-d136836b3949.sql =====

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_current_stage_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_current_stage_id_fkey
      FOREIGN KEY (current_stage_id) REFERENCES public.stages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_cadista_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_cadista_id_fkey
      FOREIGN KEY (cadista_id) REFERENCES public.cadistas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_sibling_case_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_sibling_case_id_fkey
      FOREIGN KEY (sibling_case_id) REFERENCES public.cases(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_phase_id_fkey') THEN
    ALTER TABLE public.stages ADD CONSTRAINT stages_phase_id_fkey
      FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===== 20260503025055_a7af8e5c-7418-4914-936d-c97af461184f.sql =====

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_patient_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.patients(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_doctor_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_doctor_id_fkey
      FOREIGN KEY (doctor_id) REFERENCES public.doctors(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_cadista_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_cadista_id_fkey
      FOREIGN KEY (cadista_id) REFERENCES public.cadistas(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_case_type_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_case_type_id_fkey
      FOREIGN KEY (case_type_id) REFERENCES public.case_types(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_tooth_color_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_tooth_color_id_fkey
      FOREIGN KEY (tooth_color_id) REFERENCES public.tooth_colors(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_current_stage_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_current_stage_id_fkey
      FOREIGN KEY (current_stage_id) REFERENCES public.stages(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_sibling_case_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_sibling_case_id_fkey
      FOREIGN KEY (sibling_case_id) REFERENCES public.cases(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stages_phase_id_fkey' AND conrelid = 'public.stages'::regclass
  ) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_phase_id_fkey
      FOREIGN KEY (phase_id) REFERENCES public.phases(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_stages_case_id_fkey' AND conrelid = 'public.case_stages'::regclass
  ) THEN
    ALTER TABLE public.case_stages
      ADD CONSTRAINT case_stages_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES public.cases(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_stages_stage_id_fkey' AND conrelid = 'public.case_stages'::regclass
  ) THEN
    ALTER TABLE public.case_stages
      ADD CONSTRAINT case_stages_stage_id_fkey
      FOREIGN KEY (stage_id) REFERENCES public.stages(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_components_case_id_fkey' AND conrelid = 'public.case_components'::regclass
  ) THEN
    ALTER TABLE public.case_components
      ADD CONSTRAINT case_components_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES public.cases(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_components_component_id_fkey' AND conrelid = 'public.case_components'::regclass
  ) THEN
    ALTER TABLE public.case_components
      ADD CONSTRAINT case_components_component_id_fkey
      FOREIGN KEY (component_id) REFERENCES public.components(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cases_status_delivery_date ON public.cases(status, delivery_date);
CREATE INDEX IF NOT EXISTS idx_cases_patient_id ON public.cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_cases_current_stage_id ON public.cases(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_case_stages_case_id ON public.case_stages(case_id);
CREATE INDEX IF NOT EXISTS idx_case_components_case_id ON public.case_components(case_id);

NOTIFY pgrst, 'reload schema';

-- ===== 20260503030036_5d06bfb2-1227-4793-be60-e9245fbb4baf.sql =====

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS current_phase_id uuid;
DO $$ BEGIN
  ALTER TABLE public.cases ADD CONSTRAINT cases_current_phase_id_fkey
  FOREIGN KEY (current_phase_id) REFERENCES public.phases(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_cases_current_phase_id ON public.cases(current_phase_id);
-- Backfill from current_stage's phase
UPDATE public.cases c
SET current_phase_id = s.phase_id
FROM public.stages s
WHERE c.current_stage_id = s.id AND c.current_phase_id IS NULL AND s.phase_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';

-- ===== 20260512185558_70a9300d-1b73-428c-8dc4-9703cfeb4597.sql =====

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reopened_count INTEGER NOT NULL DEFAULT 0;

-- ===== 20260513200512_abaf06c2-8599-48a4-b962-7e5493203d04.sql =====

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

-- ===== 20260514220822_4945092c-fe31-48f2-891a-d75234652ce3.sql =====

-- N1: adicionar FKs faltantes em case_types_link
ALTER TABLE public.case_types_link
  DROP CONSTRAINT IF EXISTS case_types_link_case_id_fkey,
  DROP CONSTRAINT IF EXISTS case_types_link_case_type_id_fkey;

ALTER TABLE public.case_types_link
  ADD CONSTRAINT case_types_link_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE,
  ADD CONSTRAINT case_types_link_case_type_id_fkey
    FOREIGN KEY (case_type_id) REFERENCES public.case_types(id) ON DELETE CASCADE;

-- Garantir unicidade do par
CREATE UNIQUE INDEX IF NOT EXISTS case_types_link_pk
  ON public.case_types_link(case_id, case_type_id);

-- N4: holders
CREATE TABLE IF NOT EXISTS public.holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.holders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_select_holders ON public.holders;
DROP POLICY IF EXISTS open_insert_holders ON public.holders;
DROP POLICY IF EXISTS open_update_holders ON public.holders;
DROP POLICY IF EXISTS open_delete_holders ON public.holders;
CREATE POLICY open_select_holders ON public.holders FOR SELECT USING (true);
CREATE POLICY open_insert_holders ON public.holders FOR INSERT WITH CHECK (true);
CREATE POLICY open_update_holders ON public.holders FOR UPDATE USING (true);
CREATE POLICY open_delete_holders ON public.holders FOR DELETE USING (true);

-- N4: burrs ganha holder_id e code
ALTER TABLE public.burrs
  ADD COLUMN IF NOT EXISTS holder_id uuid REFERENCES public.holders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS code text;

-- Apenas uma broca ativa por holder + material
CREATE UNIQUE INDEX IF NOT EXISTS burrs_one_active_per_holder_material
  ON public.burrs(holder_id, material)
  WHERE removed_at IS NULL AND holder_id IS NOT NULL;

-- ===== 20260602192126_5a92ea92-e919-428e-8f4c-4c60aafe9871.sql =====

-- BLOCK 1: AUTH, ROLES, RLS HARDENING

-- 1. Enum de papéis
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','dentista','recepcionista','auxiliar','protetico','cadista');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Adicionar user_id em cadistas ANTES das funções
ALTER TABLE public.cadistas ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  is_default_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Funções
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('admin','dentista','recepcionista','auxiliar','protetico'))
$$;

CREATE OR REPLACE FUNCTION public.is_cadista(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'cadista')
$$;

CREATE OR REPLACE FUNCTION public.can_access_case(_case_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.cases c
    JOIN public.cadistas cd ON cd.id = c.cadista_id
    WHERE c.id = _case_id AND cd.user_id = auth.uid()
  )
$$;

-- 6. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  INSERT INTO public.profiles (id, full_name, email, is_default_admin)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email, is_first);
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. backups
CREATE TABLE IF NOT EXISTS public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- 8. RLS POLICIES
-- profiles
DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- user_roles
DROP POLICY IF EXISTS user_roles_self_select ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_self_select ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- patients
DROP POLICY IF EXISTS open_select_patients ON public.patients;
DROP POLICY IF EXISTS open_insert_patients ON public.patients;
DROP POLICY IF EXISTS open_update_patients ON public.patients;
DROP POLICY IF EXISTS open_delete_patients ON public.patients;
CREATE POLICY patients_staff_select ON public.patients FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY patients_staff_insert ON public.patients FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY patients_staff_update ON public.patients FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY patients_admin_delete ON public.patients FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- doctors
DROP POLICY IF EXISTS open_select_doctors ON public.doctors;
DROP POLICY IF EXISTS open_insert_doctors ON public.doctors;
DROP POLICY IF EXISTS open_update_doctors ON public.doctors;
DROP POLICY IF EXISTS open_delete_doctors ON public.doctors;
CREATE POLICY doctors_staff_select ON public.doctors FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY doctors_staff_insert ON public.doctors FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY doctors_staff_update ON public.doctors FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY doctors_admin_delete ON public.doctors FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- phases
DROP POLICY IF EXISTS open_select_phases ON public.phases;
DROP POLICY IF EXISTS open_insert_phases ON public.phases;
DROP POLICY IF EXISTS open_update_phases ON public.phases;
DROP POLICY IF EXISTS open_delete_phases ON public.phases;
CREATE POLICY phases_staff_select ON public.phases FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY phases_admin_write ON public.phases FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- stages
DROP POLICY IF EXISTS open_select_stages ON public.stages;
DROP POLICY IF EXISTS open_insert_stages ON public.stages;
DROP POLICY IF EXISTS open_update_stages ON public.stages;
DROP POLICY IF EXISTS open_delete_stages ON public.stages;
CREATE POLICY stages_staff_select ON public.stages FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY stages_admin_write ON public.stages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- tooth_colors
DROP POLICY IF EXISTS open_select_tooth_colors ON public.tooth_colors;
DROP POLICY IF EXISTS open_insert_tooth_colors ON public.tooth_colors;
DROP POLICY IF EXISTS open_update_tooth_colors ON public.tooth_colors;
DROP POLICY IF EXISTS open_delete_tooth_colors ON public.tooth_colors;
CREATE POLICY tooth_colors_staff_select ON public.tooth_colors FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_staff_insert ON public.tooth_colors FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_staff_update ON public.tooth_colors FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_admin_delete ON public.tooth_colors FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- case_types
DROP POLICY IF EXISTS open_select_case_types ON public.case_types;
DROP POLICY IF EXISTS open_insert_case_types ON public.case_types;
DROP POLICY IF EXISTS open_update_case_types ON public.case_types;
DROP POLICY IF EXISTS open_delete_case_types ON public.case_types;
CREATE POLICY case_types_staff_select ON public.case_types FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY case_types_admin_write ON public.case_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- components
DROP POLICY IF EXISTS open_select_components ON public.components;
DROP POLICY IF EXISTS open_insert_components ON public.components;
DROP POLICY IF EXISTS open_update_components ON public.components;
DROP POLICY IF EXISTS open_delete_components ON public.components;
CREATE POLICY components_staff_select ON public.components FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY components_staff_insert ON public.components FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY components_staff_update ON public.components FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY components_admin_delete ON public.components FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- holders
DROP POLICY IF EXISTS open_select_holders ON public.holders;
DROP POLICY IF EXISTS open_insert_holders ON public.holders;
DROP POLICY IF EXISTS open_update_holders ON public.holders;
DROP POLICY IF EXISTS open_delete_holders ON public.holders;
CREATE POLICY holders_staff_select ON public.holders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY holders_staff_insert ON public.holders FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY holders_staff_update ON public.holders FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY holders_admin_delete ON public.holders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- burrs
DROP POLICY IF EXISTS open_select_burrs ON public.burrs;
DROP POLICY IF EXISTS open_insert_burrs ON public.burrs;
DROP POLICY IF EXISTS open_update_burrs ON public.burrs;
DROP POLICY IF EXISTS open_delete_burrs ON public.burrs;
CREATE POLICY burrs_staff_select ON public.burrs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY burrs_staff_insert ON public.burrs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY burrs_staff_update ON public.burrs FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY burrs_admin_delete ON public.burrs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- cadistas
DROP POLICY IF EXISTS open_select_cadistas ON public.cadistas;
DROP POLICY IF EXISTS open_insert_cadistas ON public.cadistas;
DROP POLICY IF EXISTS open_update_cadistas ON public.cadistas;
DROP POLICY IF EXISTS open_delete_cadistas ON public.cadistas;
CREATE POLICY cadistas_staff_select ON public.cadistas FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY cadistas_admin_write ON public.cadistas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- cases
DROP POLICY IF EXISTS open_select_cases ON public.cases;
DROP POLICY IF EXISTS open_insert_cases ON public.cases;
DROP POLICY IF EXISTS open_update_cases ON public.cases;
DROP POLICY IF EXISTS open_delete_cases ON public.cases;
CREATE POLICY cases_staff_select ON public.cases FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR (cadista_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.cadistas cd WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()))
);
CREATE POLICY cases_staff_insert ON public.cases FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY cases_staff_update ON public.cases FOR UPDATE TO authenticated USING (
  public.is_staff(auth.uid())
  OR (cadista_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.cadistas cd WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()))
);
CREATE POLICY cases_admin_delete ON public.cases FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- case_stages
DROP POLICY IF EXISTS open_select_case_stages ON public.case_stages;
DROP POLICY IF EXISTS open_insert_case_stages ON public.case_stages;
DROP POLICY IF EXISTS open_update_case_stages ON public.case_stages;
DROP POLICY IF EXISTS open_delete_case_stages ON public.case_stages;
CREATE POLICY case_stages_access ON public.case_stages FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- case_components
DROP POLICY IF EXISTS open_select_cc ON public.case_components;
DROP POLICY IF EXISTS open_insert_cc ON public.case_components;
DROP POLICY IF EXISTS open_update_cc ON public.case_components;
DROP POLICY IF EXISTS open_delete_cc ON public.case_components;
CREATE POLICY case_components_access ON public.case_components FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- case_types_link
DROP POLICY IF EXISTS open_select_ctl ON public.case_types_link;
DROP POLICY IF EXISTS open_insert_ctl ON public.case_types_link;
DROP POLICY IF EXISTS open_update_ctl ON public.case_types_link;
DROP POLICY IF EXISTS open_delete_ctl ON public.case_types_link;
CREATE POLICY case_types_link_access ON public.case_types_link FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- burr_usages
DROP POLICY IF EXISTS open_select_bu ON public.burr_usages;
DROP POLICY IF EXISTS open_insert_bu ON public.burr_usages;
DROP POLICY IF EXISTS open_update_bu ON public.burr_usages;
DROP POLICY IF EXISTS open_delete_bu ON public.burr_usages;
CREATE POLICY burr_usages_access ON public.burr_usages FOR ALL TO authenticated USING (case_id IS NULL OR public.can_access_case(case_id)) WITH CHECK (case_id IS NULL OR public.can_access_case(case_id));

-- backups
CREATE POLICY backups_admin_all ON public.backups FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== 20260602194220_7a5de7b5-db42-4780-953a-132523437e84.sql =====

-- 1. case_attachments
CREATE TABLE public.case_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  expired_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_case_attachments_case ON public.case_attachments(case_id);
CREATE INDEX idx_case_attachments_pending_expiry ON public.case_attachments(expires_at) WHERE expired_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_attachments TO authenticated;
GRANT ALL ON public.case_attachments TO service_role;

ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_attachments_select ON public.case_attachments
  FOR SELECT TO authenticated
  USING (public.can_access_case(case_id));

CREATE POLICY case_attachments_insert ON public.case_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_case(case_id));

CREATE POLICY case_attachments_update ON public.case_attachments
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_case(case_id));

CREATE POLICY case_attachments_delete ON public.case_attachments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Storage policies for case-files bucket (bucket is created via tool)
CREATE POLICY "case_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-files'
    AND EXISTS (
      SELECT 1 FROM public.case_attachments a
      WHERE a.storage_path = storage.objects.name
        AND public.can_access_case(a.case_id)
    )
  );

CREATE POLICY "case_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-files' AND public.is_staff(auth.uid()));

CREATE POLICY "case_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'case-files' AND public.is_staff(auth.uid()));

-- 3. Cron extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4. Schedule hourly cleanup hitting the public hook (no body needed)
SELECT cron.schedule(
  'cleanup-expired-case-files',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--22e6cc68-6ce7-4194-a797-232220056438.lovable.app/api/public/hooks/cleanup-case-files',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ===== 20260602194936_be56bbc4-8187-4e01-9a98-36f784b4780b.sql =====

-- Stock control (N8)
CREATE TYPE public.stock_category AS ENUM ('zirconia','dissilicato','component','hygiene');
CREATE TYPE public.stock_movement_type AS ENUM ('in','out','auto_case','reverse_case','adjust');

CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.stock_category NOT NULL,
  name text NOT NULL,
  brand text,
  color text,
  block_type text,
  unit text NOT NULL DEFAULT 'un',
  qty_on_hand numeric NOT NULL DEFAULT 0,
  min_qty numeric NOT NULL DEFAULT 0,
  component_id uuid REFERENCES public.components(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_items_category ON public.stock_items(category);
CREATE INDEX idx_stock_items_component ON public.stock_items(component_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_items_staff_select ON public.stock_items FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND NOT is_cadista(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY stock_items_staff_insert ON public.stock_items FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));
CREATE POLICY stock_items_staff_update ON public.stock_items FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));
CREATE POLICY stock_items_admin_delete ON public.stock_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_stock_items_updated_at BEFORE UPDATE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  type public.stock_movement_type NOT NULL,
  qty numeric NOT NULL,
  qty_before numeric NOT NULL,
  qty_after numeric NOT NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_item ON public.stock_movements(stock_item_id, created_at DESC);
CREATE INDEX idx_stock_movements_case ON public.stock_movements(case_id);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(created_at DESC);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_staff_select ON public.stock_movements FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND NOT is_cadista(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY stock_movements_staff_insert ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));

-- Apply movement to stock_items.qty_on_hand atomically
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_qty numeric;
BEGIN
  SELECT qty_on_hand INTO current_qty FROM public.stock_items WHERE id = NEW.stock_item_id FOR UPDATE;
  IF current_qty IS NULL THEN RAISE EXCEPTION 'Stock item % not found', NEW.stock_item_id; END IF;
  NEW.qty_before := current_qty;
  NEW.qty_after := current_qty + NEW.qty;
  UPDATE public.stock_items SET qty_on_hand = NEW.qty_after, updated_at = now()
    WHERE id = NEW.stock_item_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_apply_stock_movement BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Add lot selection on cases
ALTER TABLE public.cases
  ADD COLUMN zirconia_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  ADD COLUMN dissilicato_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  ADD COLUMN stock_consumed_at timestamptz;

-- Consume stock for a case (called when finishing)
CREATE OR REPLACE FUNCTION public.consume_case_stock(_case_id uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c RECORD;
  comp RECORD;
  zcount int;
  dcount int;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RAISE EXCEPTION 'Case % not found', _case_id; END IF;
  IF c.stock_consumed_at IS NOT NULL THEN RETURN; END IF;

  zcount := COALESCE(array_length(c.teeth_zirconia,1),0);
  dcount := COALESCE(array_length(c.teeth_dissilicato,1),0);

  IF zcount > 0 AND c.zirconia_stock_item_id IS NOT NULL THEN
    INSERT INTO public.stock_movements(stock_item_id,type,qty,qty_before,qty_after,case_id,user_id,notes)
    VALUES (c.zirconia_stock_item_id,'auto_case',-zcount,0,0,_case_id,_user,'Consumo automático (zircônia)');
  END IF;
  IF dcount > 0 AND c.dissilicato_stock_item_id IS NOT NULL THEN
    INSERT INTO public.stock_movements(stock_item_id,type,qty,qty_before,qty_after,case_id,user_id,notes)
    VALUES (c.dissilicato_stock_item_id,'auto_case',-dcount,0,0,_case_id,_user,'Consumo automático (dissilicato)');
  END IF;

  FOR comp IN
    SELECT cc.qty, si.id AS stock_item_id
    FROM public.case_components cc
    JOIN public.stock_items si ON si.component_id = cc.component_id
    WHERE cc.case_id = _case_id
  LOOP
    INSERT INTO public.stock_movements(stock_item_id,type,qty,qty_before,qty_after,case_id,user_id,notes)
    VALUES (comp.stock_item_id,'auto_case',-comp.qty,0,0,_case_id,_user,'Consumo automático (componente)');
  END LOOP;

  UPDATE public.cases SET stock_consumed_at = now() WHERE id = _case_id;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_case_stock(_case_id uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m RECORD;
BEGIN
  FOR m IN SELECT * FROM public.stock_movements
    WHERE case_id = _case_id AND type = 'auto_case'
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements m2 WHERE m2.case_id=_case_id AND m2.type='reverse_case' AND m2.stock_item_id=stock_movements.stock_item_id AND m2.qty = -stock_movements.qty)
  LOOP
    INSERT INTO public.stock_movements(stock_item_id,type,qty,qty_before,qty_after,case_id,user_id,notes)
    VALUES (m.stock_item_id,'reverse_case',-m.qty,0,0,_case_id,_user,'Reabertura do caso');
  END LOOP;
  UPDATE public.cases SET stock_consumed_at = NULL WHERE id = _case_id;
END $$;

-- ===== 20260602201533_902afac9-671a-441f-bcba-2b687de0ae1f.sql =====

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_case_stock(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_case_stock(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS patient_photos_select ON storage.objects;
DROP POLICY IF EXISTS patient_photos_insert ON storage.objects;
DROP POLICY IF EXISTS patient_photos_update ON storage.objects;
DROP POLICY IF EXISTS patient_photos_delete ON storage.objects;

CREATE POLICY patient_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

CREATE POLICY patient_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

CREATE POLICY patient_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

CREATE POLICY patient_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS case_files_insert ON storage.objects;
DROP POLICY IF EXISTS case_files_delete ON storage.objects;

CREATE POLICY case_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-files'
    AND public.is_staff(auth.uid())
    AND public.can_access_case(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY case_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'case-files'
    AND public.is_staff(auth.uid())
    AND public.can_access_case(((storage.foldername(name))[1])::uuid)
  );

-- ===== 20260611032523_c24eb14c-0c1e-40e0-9586-0241992e1b0d.sql =====

-- Add role and subtype to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'USER';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_subtype TEXT;

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES public.profiles(id),
    recipient_id UUID REFERENCES public.profiles(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = recipient_id OR recipient_id IS NULL);

CREATE POLICY "Users can create notifications" ON public.notifications
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can mark their own notifications as read" ON public.notifications
    FOR UPDATE USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

-- Update updated_at trigger for profiles if not already there
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 20260611032647_a49b9a1f-e44b-41d3-9f48-4b134d4c64e5.sql =====

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_full_name TEXT;
BEGIN
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'USER');
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);

    -- Insert into profiles
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new.id, v_full_name, new.email, v_role);

    -- If role is CADISTA, insert into cadistas
    IF v_role = 'CADISTA' THEN
        INSERT INTO public.cadistas (name, user_id)
        VALUES (v_full_name, new.id);
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== 20260611054139_00be783e-1ba5-4a28-8bd7-adb299118f6a.sql =====

-- Grant full access to service_role to ensure background tasks work
GRANT ALL ON public.profiles TO service_role;

-- Update INSERT policy to allow admins to insert profiles for others
DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "Admins can insert profiles" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  (id = auth.uid()) OR 
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
  ))
);

-- Ensure authenticated users have insert permissions on the table
GRANT INSERT ON public.profiles TO authenticated;

-- ===== 20260611054713_daf2d497-12bb-4ccb-8ca5-a75ec3660ff5.sql =====

-- Function to create a user in auth.users and public.profiles simultaneously
-- This bypasses email confirmation for the new user
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  new_user_id UUID;
  result JSONB;
BEGIN
  -- Check if the requester is an admin (CEO or DR)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar membros.';
  END IF;

  -- Create user in auth.users
  -- We use crypt to hash the password as required by Supabase auth
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(), -- Email confirmed immediately
    NULL,
    NULL,
    '{"provider":"email","providers":["email"]}',
    format('{"full_name":"%s"}', p_full_name)::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO new_user_id;

  -- Create identity for the user (required for login to work properly)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  -- The profile will be created by the existing trigger handle_new_user if it exists.
  -- However, to be sure and to set the role/phone correctly, we update it:
  UPDATE public.profiles
  SET 
    full_name = p_full_name,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role
  WHERE id = new_user_id;

  -- If no profile was created by trigger, create it manually
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, email, full_name, phone, role, account_subtype)
    VALUES (new_user_id, p_email, p_full_name, p_phone, p_role, p_role);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', new_user_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.create_team_member TO authenticated;
GRANT ALL ON auth.users TO service_role;
GRANT ALL ON auth.identities TO service_role;

-- ===== 20260611055017_ce17c504-52aa-4172-a9de-d17fa5fababf.sql =====

-- Update the create_team_member function to use the fixed default password
-- This keeps the password consistent and handled only at the database level
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  new_user_id UUID;
  default_password TEXT := 'dentalflow@'; -- Hardcoded confidential default password
BEGIN
  -- Check if the requester is an admin (CEO or DR)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar membros.';
  END IF;

  -- Create user in auth.users with the confidential default password
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(default_password, gen_salt('bf')),
    now(), -- Email confirmed immediately
    '{"provider":"email","providers":["email"]}',
    format('{"full_name":"%s"}', p_full_name)::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO new_user_id;

  -- Create identity for the user
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  -- Handle profile creation/update
  UPDATE public.profiles
  SET 
    full_name = p_full_name,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role
  WHERE id = new_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, email, full_name, phone, role, account_subtype)
    VALUES (new_user_id, p_email, p_full_name, p_phone, p_role, p_role);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', new_user_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ===== 20260611055512_1e3ac3ca-ba1c-4311-8142-f593f82bb4aa.sql =====

-- Ensure the primary account is CEO
UPDATE public.profiles SET role = 'CEO' WHERE email = 'gustavovitorfa@gmail.com';

-- Logic to promote the first user to CEO if the table is nearly empty
CREATE OR REPLACE FUNCTION public.ensure_first_user_is_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) = 1 THEN
    UPDATE public.profiles SET role = 'CEO' WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ensure_first_user_is_admin ON public.profiles;
CREATE TRIGGER tr_ensure_first_user_is_admin
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_first_user_is_admin();

-- Fix the create_team_member function to be more robust with permission checks
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  new_user_id UUID;
  default_password TEXT := 'dentalflow@';
  v_requester_role TEXT;
BEGIN
  -- Get requester role directly
  SELECT role INTO v_requester_role FROM public.profiles WHERE id = auth.uid();

  -- Check if the requester is an admin (CEO or DR)
  IF v_requester_role NOT IN ('CEO', 'DR') OR v_requester_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: seu usuário (%) não possui privilégios de administrador.', v_requester_role;
  END IF;

  -- Create user in auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, crypt(default_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', format('{"full_name":"%s"}', p_full_name)::jsonb,
    now(), now(), '', '', '', ''
  )
  RETURNING id INTO new_user_id;

  -- Create identity
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), new_user_id, format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email', now(), now(), now()
  );

  -- Handle profile
  INSERT INTO public.profiles (id, email, full_name, phone, role, account_subtype)
  VALUES (new_user_id, p_email, p_full_name, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE 
  SET full_name = p_full_name, phone = p_phone, role = p_role, account_subtype = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ===== 20260611064412_dcb875dc-9ccf-4652-9451-4a4f4acd111b.sql =====

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  new_user_id UUID;
  default_pass_hash TEXT;
BEGIN
  -- Verificar se o usuário já existe na auth.users
  SELECT id INTO new_user_id FROM auth.users WHERE email = p_email;
  
  IF new_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  -- Gerar hash da senha padrão 'dentalflow@'
  -- Usamos a extensão pgcrypto que acabamos de garantir que existe
  default_pass_hash := crypt('dentalflow@', gen_salt('bf'));

  -- Criar o usuário no schema de autenticação
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    default_pass_hash,
    now(), -- Confirma o e-mail imediatamente
    NULL,
    NULL,
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', p_role),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO new_user_id;

  -- Criar o perfil no schema public (o trigger handle_new_user pode já fazer isso, mas garantimos aqui)
  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ===== 20260611064914_33899e2d-39e5-48a5-b486-52d3f14269f0.sql =====

-- Garante que a extensão pgcrypto esteja instalada no esquema public
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Recria a função garantindo o uso correto do pgcrypto
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  new_user_id UUID;
  default_pass_hash TEXT;
BEGIN
  -- Verificar se o usuário já existe na auth.users
  SELECT id INTO new_user_id FROM auth.users WHERE email = p_email;
  
  IF new_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  -- Gerar hash da senha padrão 'dentalflow@' usando explicitamente o esquema public se necessário
  BEGIN
    default_pass_hash := public.crypt('dentalflow@', public.gen_salt('bf'));
  EXCEPTION WHEN OTHERS THEN
    -- Fallback caso o esquema extensions seja usado em vez de public
    default_pass_hash := crypt('dentalflow@', gen_salt('bf'));
  END;

  -- Criar o usuário no schema de autenticação
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    default_pass_hash,
    now(), -- Confirma o e-mail imediatamente
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', p_role),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false
  )
  RETURNING id INTO new_user_id;

  -- Criar o perfil no schema public
  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ===== 20260611065754_fc8b9650-dc7e-4b21-9ad5-bb11574b355c.sql =====

-- Primeiro, removemos as versões existentes para evitar conflitos de sobrecarga
DROP FUNCTION IF EXISTS public.create_team_member(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_team_member(TEXT, TEXT, TEXT, TEXT, TEXT);

-- Recria a função com a lógica correta de identidades e senha padrão
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
  default_pass_hash TEXT;
BEGIN
  -- Verificar se o usuário já existe na auth.users
  SELECT id INTO new_user_id FROM auth.users WHERE email = p_email;
  
  IF new_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  -- Garante que pgcrypto esteja disponível
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- Gerar hash da senha padrão 'dentalflow@'
  default_pass_hash := crypt('dentalflow@', gen_salt('bf'));

  -- Criar o usuário no schema auth
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    default_pass_hash,
    now(), -- Confirma o e-mail imediatamente
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', p_role),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false
  )
  RETURNING id INTO new_user_id;

  -- CRITICAL: Criar a identidade na auth.identities para que o login funcione
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  -- Criar ou atualizar o perfil no schema public
  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_member TO service_role;

-- ===== 20260611070243_116b1e84-f509-4455-96fc-9b552199d70a.sql =====

-- Tabela de logs administrativos
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id),
    target_user_id UUID,
    action TEXT NOT NULL, -- 'DELETE_USER', 'UPDATE_ROLE'
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all logs" ON public.admin_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
        )
    );

CREATE POLICY "Admins can insert logs" ON public.admin_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
        )
    );

-- Função para deletar um membro (necessário permissão elevada)
CREATE OR REPLACE FUNCTION public.delete_team_member(
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Removido pelo administrador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_role TEXT;
  v_target_email TEXT;
BEGIN
  -- Verificar se o executor é admin
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  
  IF v_admin_role NOT IN ('CEO', 'DR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir membros.';
  END IF;

  SELECT email INTO v_target_email FROM auth.users WHERE id = p_user_id;

  -- Registrar o log antes de deletar
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    p_user_id,
    'DELETE_USER',
    jsonb_build_object('reason', p_reason, 'target_email', v_target_email)
  );

  -- Deletar o perfil
  DELETE FROM public.profiles WHERE id = p_user_id;
  
  -- Deletar as identidades do usuário
  DELETE FROM auth.identities WHERE user_id = p_user_id;

  -- Deletar o usuário da auth.users
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_team_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_team_member TO service_role;

-- Atualizar a função create_team_member para incluir provider_id (que deve ser o email para o provider 'email')
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
  default_pass_hash TEXT;
BEGIN
  -- Verificar se o usuário já existe na auth.users
  SELECT id INTO new_user_id FROM auth.users WHERE email = p_email;
  
  IF new_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  -- Garante que pgcrypto esteja disponível
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- Gerar hash da senha padrão 'dentalflow@'
  default_pass_hash := crypt('dentalflow@', gen_salt('bf'));

  -- Criar o usuário no schema auth
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    default_pass_hash,
    now(), -- Confirma o e-mail imediatamente
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', p_role),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false
  )
  RETURNING id INTO new_user_id;

  -- Criar a identidade na auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email',
    p_email, -- No Supabase, provider_id para email costuma ser o próprio email
    now(),
    now(),
    now()
  );

  -- Criar ou atualizar o perfil no schema public
  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Garantir que o email contalabpraia@gmail.com tenha identidade correta
DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'contalabpraia@gmail.com';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  
  IF v_user_id IS NOT NULL THEN
    -- Deletar identidades incorretas se houver
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    
    -- Criar identidade correta
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id, format('{"sub":"%s","email":"%s"}', v_user_id, v_email)::jsonb, 'email', v_email, now(), now(), now());
    
    -- Confirmar email
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user_id;
  END IF;
END $$;

-- ===== 20260611122304_2d01e1b0-3bc9-412f-bc42-3bd4b0252bb2.sql =====

-- Update is_staff function to include cadista and handle uppercase roles from profiles
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role IN ('admin', 'dentista', 'recepcionista', 'auxiliar', 'protetico', 'cadista')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
    AND role IN ('CADISTA', 'CEO', 'admin')
  );
END;
$function$;

-- Update handle_new_user to sync with user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_role TEXT;
    v_full_name TEXT;
    v_app_role public.app_role;
BEGIN
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'USER');
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);

    -- Insert into profiles
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new.id, v_full_name, new.email, v_role);

    -- Sync to user_roles if it's a known staff role
    BEGIN
        v_app_role := LOWER(v_role)::public.app_role;
        INSERT INTO public.user_roles (user_id, role)
        VALUES (new.id, v_app_role);
    EXCEPTION WHEN OTHERS THEN
        -- Role not in app_role enum, skip user_roles insertion
    END;

    -- If role is CADISTA, insert into cadistas
    IF v_role = 'CADISTA' THEN
        INSERT INTO public.cadistas (name, user_id)
        VALUES (v_full_name, new.id);
    END IF;

    RETURN new;
END;
$function$;

-- Populate user_roles for existing users
DO $$
DECLARE
    r RECORD;
    v_app_role public.app_role;
BEGIN
    FOR r IN SELECT id, role FROM public.profiles LOOP
        BEGIN
            v_app_role := LOWER(r.role)::public.app_role;
            INSERT INTO public.user_roles (user_id, role)
            VALUES (r.id, v_app_role)
            ON CONFLICT (user_id, role) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            -- Skip if role doesn't match enum
        END;
    END LOOP;
END $$;

-- ===== 20260612061845_0e6b96f8-5764-4390-af6e-827500bf6f97.sql =====

-- Ensure notifications table has Realtime enabled if it already exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

-- ===== 20260612063704_4c71a4e1-3317-4ad2-8f43-68608c9df2f6.sql =====

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipient can view their own notifications" ON public.notifications;
CREATE POLICY "Recipient can view their own notifications" ON public.notifications 
FOR SELECT USING (auth.uid() = recipient_id OR recipient_id IS NULL);

DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
CREATE POLICY "Anyone can insert notifications" ON public.notifications 
FOR INSERT WITH CHECK (auth.uid() = sender_id);

GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;

-- ===== 20260612064211_92942208-189c-4ed2-af71-59f2a74c5b54.sql =====

-- Garantir colunas na tabela notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'system';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Garantir coluna na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"prosthesis_updates": true}'::jsonb;

-- Garantir publicação Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

-- Ajustar RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipient can view their own notifications" ON public.notifications;
CREATE POLICY "Recipient can view their own notifications" ON public.notifications 
FOR SELECT USING (auth.uid() = recipient_id OR recipient_id IS NULL);

DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
CREATE POLICY "Anyone can insert notifications" ON public.notifications 
FOR INSERT WITH CHECK (true); -- Permitir que qualquer usuário autenticado envie notificações

-- Grants
GRANT ALL ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- ===== 20260612065618_350cfc5a-c69c-44a6-b8ef-01a30cdca33b.sql =====

-- Permitir que todos os usuários autenticados vejam os perfis básicos
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_read_all" ON public.profiles
FOR SELECT TO authenticated USING (true);

-- Garantir que as notificações possam ser inseridas pelo remetente
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;
CREATE POLICY "Users can create notifications" ON public.notifications
FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- Garantir que o CEO e outros possam ver notificações enviadas para eles ou públicas
DROP POLICY IF EXISTS "Recipient can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
FOR SELECT TO authenticated USING (recipient_id = auth.uid() OR recipient_id IS NULL);

GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- ===== 20260612193941_2f5bfc74-d912-44b5-80d7-df77d62d9cd6.sql =====

CREATE TABLE public.case_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'comment',
  content text,
  mentions uuid[] NOT NULL DEFAULT '{}',
  attachment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_activity_case_idx ON public.case_activity(case_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_activity TO authenticated;
GRANT ALL ON public.case_activity TO service_role;

ALTER TABLE public.case_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_activity_select_staff" ON public.case_activity
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.can_access_case(case_id));

CREATE POLICY "case_activity_insert_staff" ON public.case_activity
  FOR INSERT TO authenticated
  WITH CHECK ((public.is_staff(auth.uid()) OR public.can_access_case(case_id)) AND user_id = auth.uid());

CREATE POLICY "case_activity_delete_owner" ON public.case_activity
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity;

-- ===== 20260612202211_6872e8d0-d440-4c6f-a23a-6074816ad6f4.sql =====

DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_self_or_staff" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "profiles_insert_self_or_admin" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid()
      AND COALESCE(role, 'USER') = 'USER'
      AND COALESCE(is_default_admin, false) = false
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('CEO','DR')
    )
  );

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('CEO','DR')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('CEO','DR'))
    OR (
      id = auth.uid()
      AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      AND COALESCE(is_default_admin,false) = COALESCE((SELECT p.is_default_admin FROM public.profiles p WHERE p.id=auth.uid()), false)
    )
  );

DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;

DROP POLICY IF EXISTS "Users can mark their own notifications as read" ON public.notifications;
CREATE POLICY "Users can mark their own notifications as read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Admins can insert logs" ON public.admin_logs;
DROP POLICY IF EXISTS "Admins can view all logs" ON public.admin_logs;
CREATE POLICY "Admins can insert logs" ON public.admin_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('CEO','DR')));
CREATE POLICY "Admins can view all logs" ON public.admin_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('CEO','DR')));

DROP POLICY IF EXISTS "case_files_update" ON storage.objects;
CREATE POLICY "case_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'case-files' AND public.is_staff(auth.uid()) AND public.can_access_case(((storage.foldername(name))[1])::uuid))
  WITH CHECK (bucket_id = 'case-files' AND public.is_staff(auth.uid()) AND public.can_access_case(((storage.foldername(name))[1])::uuid));

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.ensure_first_user_is_admin() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.create_team_member(text,text,text,text) SET search_path = public;
ALTER FUNCTION public.delete_team_member(uuid,text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_team_member(text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_team_member(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_case_stock(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_case_stock(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- ===== 20260612204503_96a97bd7-12c6-4833-b17c-595127080e91.sql =====

-- Backfill missing profiles from auth.users
INSERT INTO public.profiles (id, full_name, email, role)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       u.email,
       COALESCE(u.raw_user_meta_data->>'role', 'USER')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Promote gustavovitorfa@gmail.com to master CEO
UPDATE public.profiles
SET role = 'CEO', is_default_admin = true
WHERE email = 'gustavovitorfa@gmail.com';

-- Ensure admin role in user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
WHERE p.email = 'gustavovitorfa@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- ===== 20260614041019_2ad27aa3-08fa-4cda-bdca-091c804f7cc1.sql =====

-- 1) Force role 'USER' for self-signup; ignore client-supplied role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_full_name TEXT;
BEGIN
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);

    -- Always insert as basic USER; elevation must be performed by an admin afterwards.
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new.id, v_full_name, new.email, 'USER');

    RETURN new;
END;
$function$;

-- 2) Remove hardcoded default password from create_team_member; use random password.
--    Admin must trigger a password reset email for the invitee after creation.
CREATE OR REPLACE FUNCTION public.create_team_member(p_email text, p_full_name text, p_phone text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_user_id UUID;
  random_pass TEXT;
  pass_hash   TEXT;
  v_caller_role TEXT;
BEGIN
  -- Only CEO/DR can create team members
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas administradores podem criar membros.');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- Strong random password (not returned, not stored in plain text).
  random_pass := encode(gen_random_bytes(24), 'base64');
  pass_hash := crypt(random_pass, gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, pass_hash, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', false
  ) RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email', p_email, now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name, phone = p_phone, role = p_role, account_subtype = p_role;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', new_user_id,
    'note', 'Envie um e-mail de redefinição de senha ao novo membro.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 3) Tighten notifications read policy: only direct recipient can read.
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (recipient_id = auth.uid());

-- 4) Tighten profiles UPDATE policy: prevent non-default-admins from setting is_default_admin = true,
--    and prevent non-admins from changing their own role. Use a SECURITY DEFINER helper to avoid
--    recursive policy evaluation on the profiles table.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('CEO','DR')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_default_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND COALESCE(is_default_admin, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.profile_role(_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT role FROM public.profiles WHERE id = _id $$;

CREATE OR REPLACE FUNCTION public.profile_is_default_admin(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT COALESCE(is_default_admin, false) FROM public.profiles WHERE id = _id $$;

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.current_user_is_admin())
WITH CHECK (
  -- Only an existing default admin can set or keep is_default_admin = true on any row,
  -- unless the target row was already a default admin (no-op change).
  (COALESCE(is_default_admin, false) = false
    OR public.current_user_is_default_admin()
    OR public.profile_is_default_admin(id) = true)
  AND
  -- Non-admins cannot change their own role.
  (
    public.current_user_is_admin()
    OR (id = auth.uid() AND role IS NOT DISTINCT FROM public.profile_role(auth.uid()))
  )
);

-- ===== 20260616124202_f196d61a-e682-4db5-b488-a2f4c8ceb814.sql =====

-- Add DR to is_staff and sync profiles → doctors/cadistas

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role IN ('admin','dentista','recepcionista','auxiliar','protetico','cadista')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
    AND role IN ('CADISTA','CEO','DR','PROTETICO','ATENDIMENTO','admin')
  );
END; $$;

-- Backfill cadistas from profiles with CADISTA role
INSERT INTO public.cadistas (name, user_id)
SELECT COALESCE(p.full_name, p.email), p.id
FROM public.profiles p
WHERE p.role = 'CADISTA'
  AND NOT EXISTS (SELECT 1 FROM public.cadistas c WHERE c.user_id = p.id);

-- Backfill doctors from profiles with DR role (doctors has no user_id, dedupe by name)
INSERT INTO public.doctors (name)
SELECT COALESCE(p.full_name, p.email)
FROM public.profiles p
WHERE p.role = 'DR'
  AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.name = COALESCE(p.full_name, p.email));

-- Trigger to keep cadistas/doctors in sync with profiles
CREATE OR REPLACE FUNCTION public.sync_profile_to_team()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_name text;
BEGIN
  v_name := COALESCE(NEW.full_name, NEW.email);

  IF NEW.role = 'CADISTA' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cadistas WHERE user_id = NEW.id) THEN
      INSERT INTO public.cadistas (name, user_id) VALUES (v_name, NEW.id);
    ELSE
      UPDATE public.cadistas SET name = v_name WHERE user_id = NEW.id;
    END IF;
  ELSE
    DELETE FROM public.cadistas WHERE user_id = NEW.id;
  END IF;

  IF NEW.role = 'DR' THEN
    IF NOT EXISTS (SELECT 1 FROM public.doctors WHERE name = v_name) THEN
      INSERT INTO public.doctors (name) VALUES (v_name);
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_profile_to_team ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_team
AFTER INSERT OR UPDATE OF role, full_name, email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_team();

-- ===== 20260616124524_2640d361-92d3-4c2a-931c-d336b5b96999.sql =====

REVOKE ALL ON FUNCTION public.create_team_member(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_member(text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_team_member(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_team_member(uuid,text) TO authenticated;

-- ===== 20260616124926_838537e2-aeb6-48f5-bbef-5e5862e12fa7.sql =====

CREATE OR REPLACE FUNCTION public.create_team_member(p_email text, p_full_name text, p_phone text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  new_user_id UUID;
  random_pass TEXT;
  pass_hash   TEXT;
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas administradores podem criar membros.');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  random_pass := encode(extensions.gen_random_bytes(24), 'base64');
  pass_hash := extensions.crypt(random_pass, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, pass_hash, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', false
  ) RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email', p_email, now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name, phone = p_phone, role = p_role, account_subtype = p_role;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', new_user_id,
    'note', 'Envie um e-mail de redefinição de senha ao novo membro.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_team_member(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_member(text,text,text,text) TO authenticated;

-- ===== 20260616125637_68815fd9-f992-4863-b582-233fe1cb13df.sql =====

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.case_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.case_activity REPLICA IDENTITY FULL;
ALTER TABLE public.cases REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['case_attachments', 'case_activity', 'cases'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

-- ===== 20260616191933_1e4387bf-b6dc-40d3-8896-c336dd6f0673.sql =====

-- Add sort_order to tooth_colors and seed VITA palette
ALTER TABLE public.tooth_colors ADD COLUMN IF NOT EXISTS sort_order int;

-- Replace existing colors with the VITA list (preserve referenced rows by upserting)
DO $$
DECLARE
  v_codes text[] := ARRAY[
    'A1','A2','A3','A3.5','A4','B1','B2','B3','B4','C1','C2','C3','C4','D2','D3','D4',
    'BL1','BL2','BL3','BL4','0M1','0M2','0M3','OM1','OM2','OM3','OM4','OM5','W0','W1','W2','W3','XL','XXL'
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(v_codes,1) LOOP
    INSERT INTO public.tooth_colors(code, sort_order)
    VALUES (v_codes[i], i)
    ON CONFLICT (code) DO UPDATE SET sort_order = EXCLUDED.sort_order;
  END LOOP;
  -- Remove colors not in the canonical list and not referenced
  DELETE FROM public.tooth_colors tc
  WHERE NOT (tc.code = ANY(v_codes))
    AND NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.tooth_color_id = tc.id);
END $$;

-- Add unique constraint on code if missing (idempotent)
DO $$ BEGIN
  ALTER TABLE public.tooth_colors ADD CONSTRAINT tooth_colors_code_key UNIQUE (code);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- Seed case_types (idempotent)
INSERT INTO public.case_types(name)
SELECT n FROM (VALUES
 ('Coroa'),('Faceta'),('Lente de Contato'),('Inlay'),('Onlay'),('Overlay'),('Endocrown'),
 ('Pôntico'),('Ponte Fixa'),('Prótese Parcial Removível (PPR)'),('Prótese Total (PT)'),
 ('Overdenture'),('Protocolo'),('Barra Protética'),('Pilar Personalizado'),('Guia Cirúrgica'),
 ('Mock-up'),('Enceramento Diagnóstico'),('Alinhador Ortodôntico'),('Contenção Ortodôntica'),
 ('Placa Miorrelaxante'),('Placa de Clareamento'),('Protetor Bucal'),('Jig de Verificação'),
 ('Jig de Escaneamento'),('Moldeira Individual'),('Base de Prova'),('Plano de Cera'),
 ('Caracterização Gengival'),('Reembasamento'),('Conserto de Prótese'),('Conversão de Prótese'),
 ('Impressão 3D'),('Fresagem CAD/CAM'),('Outro')
) AS t(n)
WHERE NOT EXISTS (SELECT 1 FROM public.case_types ct WHERE ct.name = t.n);

-- Implant systems
CREATE TABLE IF NOT EXISTS public.implant_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  line text,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, line)
);

GRANT SELECT ON public.implant_systems TO authenticated;
GRANT ALL ON public.implant_systems TO service_role;

ALTER TABLE public.implant_systems ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "implant_systems read all auth"
    ON public.implant_systems FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "implant_systems admin write"
    ON public.implant_systems FOR ALL TO authenticated
    USING (public.current_user_is_admin())
    WITH CHECK (public.current_user_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.implant_systems(name, line, sort_order) VALUES
 ('Neodent','GM',1),('Neodent','CM',2),('Neodent','HE',3),
 ('S.I.N.', NULL, 4),('Oralfix', NULL, 5),
 ('Straumann','BL',6),('Straumann','TL',7),
 ('Nobel Biocare','Active',8),('Nobel Biocare','Replace',9),('Nobel Biocare','Conical Connection',10),
 ('Conexão', NULL, 11),('Bicon', NULL, 12),
 ('Implacil De Bortoli', NULL, 13),('Singular', NULL, 14),
 ('Outro', NULL, 99)
ON CONFLICT (name, line) DO NOTHING;

-- New case columns
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS tooth_case_types jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_provisional boolean NOT NULL DEFAULT false;

-- Attachment kind
ALTER TABLE public.case_attachments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other';

DO $$ BEGIN
  ALTER TABLE public.case_attachments
    ADD CONSTRAINT case_attachments_kind_check
    CHECK (kind IN ('fabrication','model','exocad_html','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 20260616203953_bdee4b45-6e8b-4882-ae3f-c0e152725088.sql =====

-- Scan jigs catalog per implant system
CREATE TABLE IF NOT EXISTS public.scan_jigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (implant_system_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_jigs TO authenticated;
GRANT ALL ON public.scan_jigs TO service_role;

ALTER TABLE public.scan_jigs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scan_jigs read all authenticated" ON public.scan_jigs FOR SELECT TO authenticated USING (true);
CREATE POLICY "scan_jigs admin write" ON public.scan_jigs FOR ALL TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE TRIGGER scan_jigs_set_updated_at BEFORE UPDATE ON public.scan_jigs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cases: implant teeth + chosen scan jig
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS implant_teeth int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scan_jig_id uuid REFERENCES public.scan_jigs(id) ON DELETE SET NULL;

-- Seed common scan jigs per implant system
INSERT INTO public.scan_jigs (implant_system_id, name, sort_order)
SELECT s.id, j.name, j.ord FROM public.implant_systems s
JOIN LATERAL (
  VALUES
    ('Neodent','GM', 'Scan Body GM Mini Conical', 1),
    ('Neodent','GM', 'Scan Body GM Conical', 2),
    ('Neodent','GM', 'Scan Body GM Helix', 3),
    ('Neodent','CM', 'Scan Body CM 3.5', 1),
    ('Neodent','CM', 'Scan Body CM 4.3', 2),
    ('Neodent','CM', 'Scan Body CM 5.0', 3),
    ('Neodent','HE', 'Scan Body HE 3.75', 1),
    ('Neodent','HE', 'Scan Body HE 4.1', 2),
    ('Neodent','HE', 'Scan Body HE 5.0', 3),
    ('S.I.N.', NULL, 'Scan Body Strong SW', 1),
    ('S.I.N.', NULL, 'Scan Body Unitite', 2),
    ('S.I.N.', NULL, 'Scan Body Intraoss', 3),
    ('Oralfix', NULL, 'Scan Body Oralfix CM', 1),
    ('Oralfix', NULL, 'Scan Body Oralfix HE', 2),
    ('Straumann','BL', 'Scan Body BL NC', 1),
    ('Straumann','BL', 'Scan Body BL RC', 2),
    ('Straumann','TL', 'Scan Body TL RN', 1),
    ('Straumann','TL', 'Scan Body TL WN', 2),
    ('Nobel Biocare','Active', 'Scan Body Active NP', 1),
    ('Nobel Biocare','Active', 'Scan Body Active RP', 2),
    ('Nobel Biocare','Replace', 'Scan Body Replace NP', 1),
    ('Nobel Biocare','Replace', 'Scan Body Replace RP', 2),
    ('Nobel Biocare','Conical Connection', 'Scan Body CC NP', 1),
    ('Nobel Biocare','Conical Connection', 'Scan Body CC RP', 2),
    ('Conexão', NULL, 'Scan Body Master Conect', 1),
    ('Conexão', NULL, 'Scan Body HE Conexão', 2),
    ('Bicon', NULL, 'Scan Body Bicon Universal', 1),
    ('Implacil De Bortoli', NULL, 'Scan Body DSP', 1),
    ('Singular', NULL, 'Scan Body Singular CM', 1)
) AS j(brand, ln, name, ord) ON j.brand = s.name AND (j.ln IS NOT DISTINCT FROM s.line)
ON CONFLICT (implant_system_id, name) DO NOTHING;

-- ===== 20260616210256_b2acbd1b-c88f-45d7-b17b-52ae3149128c.sql =====

-- 1) Categorias de componentes
CREATE TABLE IF NOT EXISTS public.component_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.component_categories TO authenticated;
GRANT ALL ON public.component_categories TO service_role;

ALTER TABLE public.component_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read component categories"
  ON public.component_categories FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can manage component categories"
  ON public.component_categories FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_component_categories_updated_at
  BEFORE UPDATE ON public.component_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Seed categorias padrão
INSERT INTO public.component_categories (name) VALUES
  ('Ti Base'), ('Análogo'), ('Mini Pilar'), ('Parafuso'), ('Cilindro Calcinável'), ('Outros')
ON CONFLICT (name) DO NOTHING;

-- 3) FK em components
ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.component_categories(id) ON DELETE SET NULL;

-- 4) Backfill: cria categorias a partir do texto livre existente e vincula
INSERT INTO public.component_categories (name)
SELECT DISTINCT trim(category)
FROM public.components
WHERE category IS NOT NULL AND trim(category) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE public.components c
SET category_id = cc.id
FROM public.component_categories cc
WHERE c.category_id IS NULL
  AND c.category IS NOT NULL
  AND lower(trim(c.category)) = lower(cc.name);

-- 5) Mapa de Ti-Base por dente nos casos
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS tooth_ti_bases jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ===== 20260616211457_1958b420-a07a-446b-acdb-4d5692ba40e8.sql =====

-- 1. CLINICS table
CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view clinics" ON public.clinics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update their clinic" ON public.clinics
  FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can insert clinics" ON public.clinics
  FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());

CREATE TRIGGER trg_clinics_updated BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. CLINIC_MEMBERS table
CREATE TABLE public.clinic_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'USER',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_members TO authenticated;
GRANT ALL ON public.clinic_members TO service_role;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own memberships" ON public.clinic_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin());
CREATE POLICY "Users request membership" ON public.clinic_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "Admins manage memberships" ON public.clinic_members
  FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins delete memberships" ON public.clinic_members
  FOR DELETE TO authenticated USING (public.current_user_is_admin());

CREATE TRIGGER trg_clinic_members_updated BEFORE UPDATE ON public.clinic_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. PROFILES: add clinic_id + user_code
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_code text UNIQUE;

-- helper to generate code
CREATE OR REPLACE FUNCTION public.generate_user_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  code text;
  exists_count int;
BEGIN
  LOOP
    code := 'USR-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    SELECT count(*) INTO exists_count FROM public.profiles WHERE user_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END $$;

-- backfill codes for existing users
UPDATE public.profiles SET user_code = public.generate_user_code() WHERE user_code IS NULL;
ALTER TABLE public.profiles ALTER COLUMN user_code SET NOT NULL;

-- 4. Seed IPO clinic + memberships
DO $$
DECLARE
  v_ipo uuid;
  v_owner uuid;
BEGIN
  SELECT id INTO v_owner FROM public.profiles WHERE email = 'gustavovitorfa@gmail.com' LIMIT 1;

  INSERT INTO public.clinics (name, slug, created_by)
  VALUES ('IPO - Instituto Praia de Odontologia', 'ipo', v_owner)
  RETURNING id INTO v_ipo;

  -- Make every existing profile an active member of IPO
  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, decided_by, decided_at)
  SELECT v_ipo, p.id, p.role, 'active', v_owner, now()
  FROM public.profiles p
  ON CONFLICT (clinic_id, user_id) DO NOTHING;

  UPDATE public.profiles SET clinic_id = v_ipo WHERE clinic_id IS NULL;
END $$;

-- 5. current_user_clinic_id helper
CREATE OR REPLACE FUNCTION public.current_user_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 6. Update handle_new_user to assign user_code, no clinic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name text;
  v_code text;
BEGIN
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  v_code := public.generate_user_code();

  INSERT INTO public.profiles (id, full_name, email, role, user_code, clinic_id)
  VALUES (new.id, v_full_name, new.email, 'USER', v_code, NULL);

  RETURN new;
END $$;

-- 7. Join-clinic functions
CREATE OR REPLACE FUNCTION public.request_join_clinic(p_clinic_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_existing record;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_existing FROM public.clinic_members
   WHERE user_id = v_user AND clinic_id = p_clinic_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Você já é membro deste consultório');
    ELSIF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Solicitação já enviada, aguardando aprovação');
    ELSE
      -- rejected -> reopen
      UPDATE public.clinic_members
         SET status='pending', decided_by=NULL, decided_at=NULL, updated_at=now()
       WHERE id = v_existing.id;
      RETURN jsonb_build_object('success', true);
    END IF;
  END IF;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status)
  VALUES (p_clinic_id, v_user, 'USER', 'pending');
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.approve_join_request(p_member_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m record;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT * INTO v_m FROM public.clinic_members WHERE id = p_member_id;
  IF v_m.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;

  UPDATE public.clinic_members
     SET status='active', role=p_role, decided_by=auth.uid(), decided_at=now()
   WHERE id = p_member_id;

  UPDATE public.profiles
     SET clinic_id = v_m.clinic_id, role = p_role, account_subtype = p_role
   WHERE id = v_m.user_id;

  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.reject_join_request(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  UPDATE public.clinic_members
     SET status='rejected', decided_by=auth.uid(), decided_at=now()
   WHERE id = p_member_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- 8. create_team_member with admin-defined password + clinic assignment
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email text, p_full_name text, p_phone text, p_role text, p_password text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions' AS $$
DECLARE
  new_user_id uuid;
  pass_to_use text;
  pass_hash text;
  v_caller_role text;
  v_caller_clinic uuid;
  v_code text;
BEGIN
  SELECT role, clinic_id INTO v_caller_role, v_caller_clinic
    FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas administradores podem criar membros.');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A senha deve ter pelo menos 8 caracteres.');
  END IF;

  pass_to_use := p_password;
  pass_hash := extensions.crypt(pass_to_use, extensions.gen_salt('bf'));
  v_code := public.generate_user_code();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, pass_hash, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', false
  ) RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email', p_email, now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype, user_code, clinic_id)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role, v_code, v_caller_clinic)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name, phone = p_phone, role = p_role,
    account_subtype = p_role, user_code = COALESCE(public.profiles.user_code, v_code),
    clinic_id = v_caller_clinic;

  -- Auto-add as active clinic member
  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_caller_clinic, new_user_id, p_role, 'active', auth.uid(), auth.uid(), now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status='active', role=p_role, decided_by=auth.uid(), decided_at=now();

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id, 'user_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- 9. admin_set_member_password
CREATE OR REPLACE FUNCTION public.admin_set_member_password(p_user_id uuid, p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions' AS $$
DECLARE v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A senha deve ter pelo menos 8 caracteres.');
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- ===== 20260616213258_9ca36e15-d50d-4abe-9378-d55456f4aa38.sql =====

CREATE OR REPLACE FUNCTION public.request_join_clinic(p_clinic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_existing record;
  v_user_name text;
  v_clinic_name text;
  v_admin record;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_existing FROM public.clinic_members
   WHERE user_id = v_user AND clinic_id = p_clinic_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Você já é membro deste consultório');
    ELSIF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Solicitação já enviada, aguardando aprovação');
    ELSE
      UPDATE public.clinic_members
         SET status='pending', decided_by=NULL, decided_at=NULL, updated_at=now()
       WHERE id = v_existing.id;
    END IF;
  ELSE
    INSERT INTO public.clinic_members (clinic_id, user_id, role, status)
    VALUES (p_clinic_id, v_user, 'USER', 'pending');
  END IF;

  SELECT COALESCE(full_name, email) INTO v_user_name FROM public.profiles WHERE id = v_user;
  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = p_clinic_id;

  -- Notify all admins of the target clinic
  FOR v_admin IN
    SELECT id FROM public.profiles
     WHERE clinic_id = p_clinic_id AND role IN ('CEO','DR')
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
    VALUES (
      v_user,
      v_admin.id,
      'Nova solicitação de acesso',
      COALESCE(v_user_name, 'Um usuário') || ' solicitou entrada em ' || COALESCE(v_clinic_name, 'seu consultório') || '.',
      'join_request'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
END $function$;

CREATE OR REPLACE FUNCTION public.approve_join_request(p_member_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m record;
  v_clinic_name text;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT * INTO v_m FROM public.clinic_members WHERE id = p_member_id;
  IF v_m.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;

  UPDATE public.clinic_members
     SET status='active', role=p_role, decided_by=auth.uid(), decided_at=now()
   WHERE id = p_member_id;

  UPDATE public.profiles
     SET clinic_id = v_m.clinic_id, role = p_role, account_subtype = p_role
   WHERE id = v_m.user_id;

  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_m.clinic_id;

  INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
  VALUES (
    auth.uid(),
    v_m.user_id,
    'Acesso aprovado',
    'Sua entrada em ' || COALESCE(v_clinic_name, 'consultório') || ' foi aprovada. Acesso liberado como ' || p_role || '.',
    'join_approved'
  );

  RETURN jsonb_build_object('success', true);
END $function$;

CREATE OR REPLACE FUNCTION public.reject_join_request(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m record;
  v_clinic_name text;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT * INTO v_m FROM public.clinic_members WHERE id = p_member_id;
  IF v_m.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;

  UPDATE public.clinic_members
     SET status='rejected', decided_by=auth.uid(), decided_at=now()
   WHERE id = p_member_id;

  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_m.clinic_id;

  INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
  VALUES (
    auth.uid(),
    v_m.user_id,
    'Solicitação recusada',
    'Sua solicitação para entrar em ' || COALESCE(v_clinic_name, 'consultório') || ' foi recusada.',
    'join_rejected'
  );

  RETURN jsonb_build_object('success', true);
END $function$;

-- ===== 20260616214426_dde5995f-bf83-4d7b-b5af-aa92976a5187.sql =====

-- Attach trigger so every new auth user gets a profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles for existing users
INSERT INTO public.profiles (id, full_name, email, role, user_code, clinic_id)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       u.email,
       'USER',
       public.generate_user_code(),
       NULL
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- ===== 20260616214711_9e3afbfe-516a-4d34-8b2d-fe99c55fe6fd.sql =====

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ===== 20260616215043_2ab5da7d-194d-4563-8d14-3e8b0036bf2a.sql =====

CREATE OR REPLACE FUNCTION public.generate_user_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  code text;
  exists_count int;
BEGIN
  LOOP
    code := 'USR-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    SELECT count(*) INTO exists_count FROM public.profiles WHERE user_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END $$;

-- ===== 20260617205349_64248311-d233-40ea-9d79-b453466e5574.sql =====

ALTER TABLE public.case_attachments DROP CONSTRAINT IF EXISTS case_attachments_kind_check;
ALTER TABLE public.case_attachments ADD CONSTRAINT case_attachments_kind_check CHECK (kind IN ('fabrication','model','exocad_html','scans','other'));

-- ===== 20260620061735_83efff94-9f4f-4494-b741-ae481f28b2bb.sql =====

ALTER TABLE public.case_attachments DROP CONSTRAINT IF EXISTS case_attachments_kind_check;
ALTER TABLE public.case_attachments ADD CONSTRAINT case_attachments_kind_check CHECK (kind IN ('fabrication','model','exocad_html','scans','gallery','comment_image','other'));

-- ===== 20260622040257_a0038a64-2629-44f3-a73c-170ee7070e41.sql =====

CREATE TABLE public.model_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.case_attachments(id) ON DELETE SET NULL,
  normalized_name text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  camera jsonb,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_annotations TO authenticated;
GRANT ALL ON public.model_annotations TO service_role;

ALTER TABLE public.model_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view annotations of accessible cases"
  ON public.model_annotations FOR SELECT TO authenticated
  USING (public.can_access_case(case_id));

CREATE POLICY "insert own annotations on accessible cases"
  ON public.model_annotations FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_access_case(case_id));

CREATE POLICY "update own annotations"
  ON public.model_annotations FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "delete own annotations"
  ON public.model_annotations FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE INDEX idx_model_annotations_case_name
  ON public.model_annotations (case_id, normalized_name);

CREATE TRIGGER set_model_annotations_updated_at
  BEFORE UPDATE ON public.model_annotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.model_annotations;
ALTER TABLE public.model_annotations REPLICA IDENTITY FULL;

-- ===== 20260622121105_4fd2c26c-a35f-4864-86af-7f9882c21767.sql =====

DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'gustavovitorfa@gmail.com';
  v_password text := 'Worldfree!';
  v_full_name text := 'Gustavo Vitor';
  v_code text;
  v_clinic_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_full_name),
      now(), now(), '', '', '', '', false
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_user_id,
      format('{"sub":"%s","email":"%s"}', v_user_id, v_email)::jsonb,
      'email', v_email, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  SELECT id INTO v_clinic_id FROM public.clinics ORDER BY created_at ASC LIMIT 1;
  IF v_clinic_id IS NULL THEN
    INSERT INTO public.clinics (name) VALUES ('Laboratório Principal') RETURNING id INTO v_clinic_id;
  END IF;

  v_code := public.generate_user_code();

  INSERT INTO public.profiles (id, full_name, email, role, account_subtype, user_code, clinic_id, is_default_admin)
  VALUES (v_user_id, v_full_name, v_email, 'CEO', 'CEO', v_code, v_clinic_id, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = 'CEO',
    account_subtype = 'CEO',
    clinic_id = COALESCE(public.profiles.clinic_id, EXCLUDED.clinic_id),
    is_default_admin = true;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, decided_by, decided_at)
  VALUES (v_clinic_id, v_user_id, 'CEO', 'active', v_user_id, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status='active', role='CEO', decided_at=now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- ===== 20260623213059_6ae39ca3-96bf-47a7-b652-d802a4280907.sql =====

DROP POLICY IF EXISTS profiles_insert_self_or_admin ON public.profiles;

CREATE POLICY profiles_insert_self_only
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  AND COALESCE(role, 'USER') = 'USER'
  AND COALESCE(is_default_admin, false) = false
);

-- ===== 20260625015101_95e3044c-2d2b-429e-9988-a1e11f196ecc.sql =====

-- 1) Settings (singleton row with id = true)
CREATE TABLE IF NOT EXISTS public.workflow_settings (
  id boolean PRIMARY KEY DEFAULT true,
  phases_enabled boolean NOT NULL DEFAULT false,
  stages_enabled boolean NOT NULL DEFAULT false,
  auto_advance_enabled boolean NOT NULL DEFAULT true,
  progress_bar_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;

ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_settings_select ON public.workflow_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY workflow_settings_write ON public.workflow_settings
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

INSERT INTO public.workflow_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- 2) Extend phases/stages
ALTER TABLE public.phases
  ADD COLUMN IF NOT EXISTS is_terminal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS on_complete_action text NOT NULL DEFAULT 'next',
  ADD COLUMN IF NOT EXISTS target_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS on_complete_action text NOT NULL DEFAULT 'next',
  ADD COLUMN IF NOT EXISTS target_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notify_role text,
  ADD COLUMN IF NOT EXISTS notify_cadista boolean NOT NULL DEFAULT false;

-- Allow writes on phases/stages for admins (read already open in existing policies)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='phases' AND policyname='phases_admin_write') THEN
    CREATE POLICY phases_admin_write ON public.phases
      FOR ALL TO authenticated
      USING (public.current_user_is_admin())
      WITH CHECK (public.current_user_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stages' AND policyname='stages_admin_write') THEN
    CREATE POLICY stages_admin_write ON public.stages
      FOR ALL TO authenticated
      USING (public.current_user_is_admin())
      WITH CHECK (public.current_user_is_admin());
  END IF;
END $$;

-- 3) Assignments
CREATE TABLE IF NOT EXISTS public.phase_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.phase_assignments TO authenticated;
GRANT ALL ON public.phase_assignments TO service_role;
ALTER TABLE public.phase_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase_assignments_select ON public.phase_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY phase_assignments_write ON public.phase_assignments
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE TABLE IF NOT EXISTS public.stage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.stage_assignments TO authenticated;
GRANT ALL ON public.stage_assignments TO service_role;
ALTER TABLE public.stage_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_assignments_select ON public.stage_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY stage_assignments_write ON public.stage_assignments
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

-- 4) Seed default workflow
CREATE OR REPLACE FUNCTION public.seed_default_workflow()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p_novo uuid; p_desenho uuid; p_prova uuid; p_confeccao uuid;
  p_prova_paciente uuid; p_fresagem uuid; p_acabamento uuid; p_entregue uuid;
  s_ajuste_prova uuid; s_aprovado_prova uuid;
  s_impressao uuid; s_acabamento_int uuid;
  s_ajuste_pp uuid; s_aprovado_pp uuid;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  -- Insert phases (idempotent by name)
  INSERT INTO public.phases (name, color, position, is_terminal, on_complete_action)
  VALUES
    ('Novo caso',       '#94a3b8', 10, false, 'next'),
    ('Desenho',         '#3b82f6', 20, false, 'next'),
    ('Prova',           '#f59e0b', 30, false, 'next'),
    ('Confecção',       '#8b5cf6', 40, false, 'next'),
    ('Prova paciente',  '#ec4899', 50, false, 'next'),
    ('Fresagem',        '#06b6d4', 60, false, 'next'),
    ('Acabamento',      '#10b981', 70, false, 'next'),
    ('Entregue',        '#22c55e', 80, true,  'next')
  ON CONFLICT DO NOTHING;

  SELECT id INTO p_novo           FROM public.phases WHERE name='Novo caso' LIMIT 1;
  SELECT id INTO p_desenho        FROM public.phases WHERE name='Desenho' LIMIT 1;
  SELECT id INTO p_prova          FROM public.phases WHERE name='Prova' LIMIT 1;
  SELECT id INTO p_confeccao      FROM public.phases WHERE name='Confecção' LIMIT 1;
  SELECT id INTO p_prova_paciente FROM public.phases WHERE name='Prova paciente' LIMIT 1;
  SELECT id INTO p_fresagem       FROM public.phases WHERE name='Fresagem' LIMIT 1;
  SELECT id INTO p_acabamento     FROM public.phases WHERE name='Acabamento' LIMIT 1;
  SELECT id INTO p_entregue       FROM public.phases WHERE name='Entregue' LIMIT 1;

  -- Stages for "Prova"
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action, target_phase_id, notify_cadista)
  VALUES ('Ajuste', '#ef4444', 10, p_prova, 'goto_phase', p_desenho, true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action, target_phase_id)
  VALUES ('Aprovado', '#22c55e', 20, p_prova, 'goto_phase', p_confeccao)
  ON CONFLICT DO NOTHING;

  -- Stages for "Confecção"
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action)
  VALUES ('Impressão', '#8b5cf6', 10, p_confeccao, 'next') ON CONFLICT DO NOTHING;
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action)
  VALUES ('Acabamento interno', '#a855f7', 20, p_confeccao, 'goto_phase'),
         ('Prova do paciente', '#ec4899', 30, p_confeccao, 'goto_phase')
  ON CONFLICT DO NOTHING;
  UPDATE public.stages SET target_phase_id = p_prova_paciente
    WHERE name='Prova do paciente' AND phase_id = p_confeccao;

  -- Stages for "Prova paciente"
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action, target_phase_id, notify_cadista)
  VALUES ('Ajuste paciente', '#ef4444', 10, p_prova_paciente, 'goto_phase', p_desenho, true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action, target_phase_id)
  VALUES ('Aprovado paciente', '#22c55e', 20, p_prova_paciente, 'goto_phase', p_fresagem)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true);
END $$;

-- 5) Advance function
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur_phase RECORD; cur_stage RECORD; nxt RECORD; chosen RECORD;
  next_phase_id uuid; next_stage_id uuid;
  v_user uuid := auth.uid();
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  -- If a stage_id was passed (user picked a branch like Ajuste/Aprovado), use it
  IF _stage_id IS NOT NULL THEN
    SELECT * INTO chosen FROM public.stages WHERE id = _stage_id;
    IF chosen IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Etapa não encontrada'); END IF;
    IF chosen.on_complete_action = 'goto_phase' AND chosen.target_phase_id IS NOT NULL THEN
      next_phase_id := chosen.target_phase_id;
      next_stage_id := NULL;
    ELSIF chosen.on_complete_action = 'goto_stage' AND chosen.target_stage_id IS NOT NULL THEN
      SELECT phase_id INTO next_phase_id FROM public.stages WHERE id = chosen.target_stage_id;
      next_stage_id := chosen.target_stage_id;
    ELSE
      -- next stage by position within same phase, else next phase
      SELECT id INTO next_stage_id FROM public.stages
        WHERE phase_id = chosen.phase_id AND position > chosen.position
        ORDER BY position LIMIT 1;
      IF next_stage_id IS NULL THEN
        SELECT id INTO next_phase_id FROM public.phases
          WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=chosen.phase_id),0)
          ORDER BY position LIMIT 1;
        next_stage_id := NULL;
      ELSE
        next_phase_id := chosen.phase_id;
      END IF;
    END IF;

    -- notifications
    IF chosen.notify_cadista AND c.cadista_id IS NOT NULL THEN
      INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
      SELECT v_user, cd.user_id, 'Caso retornou para desenho',
             'O caso ' || COALESCE(c.case_label, c.id::text) || ' voltou para você.', 'workflow_back'
        FROM public.cadistas cd WHERE cd.id = c.cadista_id;
    END IF;
  ELSE
    -- No stage selected: advance from current
    IF c.current_stage_id IS NOT NULL THEN
      SELECT * INTO cur_stage FROM public.stages WHERE id = c.current_stage_id;
      SELECT id INTO next_stage_id FROM public.stages
        WHERE phase_id = cur_stage.phase_id AND position > cur_stage.position
        ORDER BY position LIMIT 1;
      IF next_stage_id IS NULL THEN
        SELECT id INTO next_phase_id FROM public.phases
          WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=cur_stage.phase_id),0)
          ORDER BY position LIMIT 1;
      ELSE
        next_phase_id := cur_stage.phase_id;
      END IF;
    ELSE
      SELECT id INTO next_phase_id FROM public.phases
        WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=c.current_phase_id),0)
        ORDER BY position LIMIT 1;
      next_stage_id := NULL;
    END IF;
  END IF;

  UPDATE public.cases
     SET current_phase_id = COALESCE(next_phase_id, current_phase_id),
         current_stage_id = next_stage_id,
         updated_at = now()
   WHERE id = _case_id;

  RETURN jsonb_build_object(
    'success', true,
    'phase_id', COALESCE(next_phase_id, c.current_phase_id),
    'stage_id', next_stage_id
  );
END $$;

-- ===== 20260625015758_b2f6517e-8b1b-45e1-9187-cc535e443eea.sql =====

-- 1) component_categories used as stock categories
ALTER TABLE public.component_categories
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 100;

-- 2) Extend stock_items
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.component_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS last_restocked_at timestamptz,
  ALTER COLUMN category DROP NOT NULL;

-- 3) Custom fields
CREATE TABLE IF NOT EXISTS public.stock_item_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_item_custom_fields_item_idx ON public.stock_item_custom_fields(stock_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_custom_fields TO authenticated;
GRANT ALL ON public.stock_item_custom_fields TO service_role;

ALTER TABLE public.stock_item_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_item_custom_fields_select ON public.stock_item_custom_fields
  FOR SELECT TO authenticated USING (true);
CREATE POLICY stock_item_custom_fields_write ON public.stock_item_custom_fields
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 4) Seed/ensure default categories and migrate existing items
INSERT INTO public.component_categories (name, position)
VALUES ('Zircônia', 10), ('Dissilicato', 20), ('Componentes', 30), ('Higiene', 40)
ON CONFLICT DO NOTHING;

UPDATE public.stock_items si
   SET category_id = cc.id
  FROM public.component_categories cc
 WHERE si.category_id IS NULL
   AND (
     (si.category::text = 'zirconia'    AND cc.name = 'Zircônia') OR
     (si.category::text = 'dissilicato' AND cc.name = 'Dissilicato') OR
     (si.category::text = 'component'   AND cc.name = 'Componentes') OR
     (si.category::text = 'hygiene'     AND cc.name = 'Higiene')
   );

-- 5) Trigger to maintain last_restocked_at on positive stock movements
CREATE OR REPLACE FUNCTION public.touch_last_restocked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.qty > 0 THEN
    UPDATE public.stock_items SET last_restocked_at = now() WHERE id = NEW.stock_item_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_last_restocked ON public.stock_movements;
CREATE TRIGGER trg_touch_last_restocked
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.touch_last_restocked();

-- ===== 20260625053529_20aa0526-9297-49b8-ac03-479b7fc80af4.sql =====

-- 1) Enable Realtime on cases, case_activity, notifications, stages, phases
ALTER TABLE public.cases REPLICA IDENTITY FULL;
ALTER TABLE public.case_activity REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.stages REPLICA IDENTITY FULL;
ALTER TABLE public.phases REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cases; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.stages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.phases; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2) Helper to check if a user is assigned to a stage/phase
CREATE OR REPLACE FUNCTION public.user_can_advance(_user uuid, _phase_id uuid, _stage_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH s AS (
    SELECT user_id FROM public.stage_assignments WHERE _stage_id IS NOT NULL AND stage_id = _stage_id
  ), p AS (
    SELECT user_id FROM public.phase_assignments WHERE _phase_id IS NOT NULL AND phase_id = _phase_id
  )
  SELECT
    CASE
      WHEN _stage_id IS NOT NULL AND EXISTS (SELECT 1 FROM s)
        THEN EXISTS (SELECT 1 FROM s WHERE user_id = _user)
      WHEN _phase_id IS NOT NULL AND EXISTS (SELECT 1 FROM p)
        THEN EXISTS (SELECT 1 FROM p WHERE user_id = _user)
      ELSE TRUE
    END;
$$;

-- 3) Updated advance_case_workflow with assignment guard + notifications to next assignees
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur_stage RECORD; chosen RECORD;
  next_phase_id uuid; next_stage_id uuid;
  v_user uuid := auth.uid();
  v_allowed boolean;
  v_next_phase_name text;
  v_next_stage_name text;
  v_case_label text;
  r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  -- Permission: only assignees of the CURRENT stage/phase may advance, if assignees exist
  v_allowed := public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id)
               OR public.current_user_is_admin();
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem avançar.');
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO chosen FROM public.stages WHERE id = _stage_id;
    IF chosen IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Etapa não encontrada'); END IF;
    IF chosen.on_complete_action = 'goto_phase' AND chosen.target_phase_id IS NOT NULL THEN
      next_phase_id := chosen.target_phase_id; next_stage_id := NULL;
    ELSIF chosen.on_complete_action = 'goto_stage' AND chosen.target_stage_id IS NOT NULL THEN
      SELECT phase_id INTO next_phase_id FROM public.stages WHERE id = chosen.target_stage_id;
      next_stage_id := chosen.target_stage_id;
    ELSE
      SELECT id INTO next_stage_id FROM public.stages
        WHERE phase_id = chosen.phase_id AND position > chosen.position
        ORDER BY position LIMIT 1;
      IF next_stage_id IS NULL THEN
        SELECT id INTO next_phase_id FROM public.phases
          WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=chosen.phase_id),0)
          ORDER BY position LIMIT 1;
      ELSE
        next_phase_id := chosen.phase_id;
      END IF;
    END IF;

    IF chosen.notify_cadista AND c.cadista_id IS NOT NULL THEN
      INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
      SELECT v_user, cd.user_id, 'Caso retornou para desenho',
             'O caso ' || COALESCE(c.case_label, c.id::text) || ' voltou para você.', 'workflow_back'
        FROM public.cadistas cd WHERE cd.id = c.cadista_id;
    END IF;
  ELSE
    IF c.current_stage_id IS NOT NULL THEN
      SELECT * INTO cur_stage FROM public.stages WHERE id = c.current_stage_id;
      SELECT id INTO next_stage_id FROM public.stages
        WHERE phase_id = cur_stage.phase_id AND position > cur_stage.position
        ORDER BY position LIMIT 1;
      IF next_stage_id IS NULL THEN
        SELECT id INTO next_phase_id FROM public.phases
          WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=cur_stage.phase_id),0)
          ORDER BY position LIMIT 1;
      ELSE
        next_phase_id := cur_stage.phase_id;
      END IF;
    ELSE
      SELECT id INTO next_phase_id FROM public.phases
        WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=c.current_phase_id),0)
        ORDER BY position LIMIT 1;
      next_stage_id := NULL;
    END IF;
  END IF;

  UPDATE public.cases
     SET current_phase_id = COALESCE(next_phase_id, current_phase_id),
         current_stage_id = next_stage_id,
         updated_at = now()
   WHERE id = _case_id;

  -- Notify all assignees of the destination
  v_case_label := COALESCE(c.case_label, c.id::text);
  SELECT name INTO v_next_phase_name FROM public.phases WHERE id = COALESCE(next_phase_id, c.current_phase_id);
  IF next_stage_id IS NOT NULL THEN
    SELECT name INTO v_next_stage_name FROM public.stages WHERE id = next_stage_id;
  END IF;

  FOR r IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.stage_assignments WHERE next_stage_id IS NOT NULL AND stage_id = next_stage_id
      UNION
      SELECT user_id AS u FROM public.phase_assignments WHERE COALESCE(next_phase_id, c.current_phase_id) IS NOT NULL
        AND phase_id = COALESCE(next_phase_id, c.current_phase_id)
        AND NOT EXISTS (SELECT 1 FROM public.stage_assignments WHERE next_stage_id IS NOT NULL AND stage_id = next_stage_id)
    ) z WHERE u <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Nova tarefa: ' || COALESCE(v_next_stage_name, v_next_phase_name, 'caso'),
      'O caso ' || v_case_label || ' agora está em ' || COALESCE(v_next_stage_name, v_next_phase_name, '—') || '.',
      'task_assigned',
      jsonb_build_object('case_id', _case_id, 'phase_id', COALESCE(next_phase_id, c.current_phase_id), 'stage_id', next_stage_id)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'phase_id', COALESCE(next_phase_id, c.current_phase_id),
    'stage_id', next_stage_id
  );
END $function$;

-- 4) Helpers: set assignees (used by /fluxo UI)
GRANT EXECUTE ON FUNCTION public.user_can_advance(uuid, uuid, uuid) TO authenticated;

-- ===== 20260625055407_a1f81a1f-69d4-45fc-b228-81d3f4592b19.sql =====

INSERT INTO public.phase_assignments (phase_id, user_id)
SELECT p.id, pr.id
FROM public.phases p
CROSS JOIN public.profiles pr
ON CONFLICT DO NOTHING;

INSERT INTO public.stage_assignments (stage_id, user_id)
SELECT s.id, pr.id
FROM public.stages s
CROSS JOIN public.profiles pr
ON CONFLICT DO NOTHING;

-- ===== 20260625143017_74cf84a5-79eb-4af1-b9a3-9db275e8abe3.sql =====

-- =========================================================
-- Simplificar workflow: uma única lista linear de "Etapas"
-- =========================================================

-- Achatamento: garante UMA fase "Fluxo" e move todas as stages
DO $$
DECLARE v_fluxo uuid;
BEGIN
  SELECT id INTO v_fluxo FROM public.phases ORDER BY position, created_at LIMIT 1;

  IF v_fluxo IS NULL THEN
    INSERT INTO public.phases (name, color, position, is_terminal, on_complete_action)
    VALUES ('Fluxo', '#1F8AFF', 10, false, 'next')
    RETURNING id INTO v_fluxo;
  ELSE
    UPDATE public.phases
       SET name='Fluxo', color='#1F8AFF', position=10,
           is_terminal=false, on_complete_action='next', target_phase_id=NULL
     WHERE id = v_fluxo;
  END IF;

  -- Reparenta todas as stages para a fase Fluxo
  UPDATE public.stages
     SET phase_id = v_fluxo,
         on_complete_action = 'next',
         target_phase_id = NULL,
         target_stage_id = NULL,
         notify_cadista = false;

  -- Casos apontam para a fase Fluxo
  UPDATE public.cases
     SET current_phase_id = v_fluxo
   WHERE current_phase_id IS NOT NULL OR current_stage_id IS NOT NULL;

  -- Remove fases antigas (já não há stages nem casos apontando para elas)
  DELETE FROM public.phase_assignments WHERE phase_id <> v_fluxo;
  DELETE FROM public.phases WHERE id <> v_fluxo;
END $$;

-- Renumera stages 10, 20, 30…
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) * 10 AS pos
  FROM public.stages
)
UPDATE public.stages s SET position = r.pos
FROM ranked r WHERE s.id = r.id;

-- Se não há stages, semeia o fluxo padrão simplificado
INSERT INTO public.stages (name, color, position, phase_id)
SELECT v.name, v.color, v.pos, (SELECT id FROM public.phases LIMIT 1)
FROM (VALUES
  ('Novo caso',          '#94a3b8', 10),
  ('Desenho',            '#3b82f6', 20),
  ('Prova interna',      '#f59e0b', 30),
  ('Impressão',          '#8b5cf6', 40),
  ('Acabamento interno', '#a855f7', 50),
  ('Prova do paciente',  '#ec4899', 60),
  ('Fresagem',           '#06b6d4', 70),
  ('Acabamento',         '#10b981', 80),
  ('Entregue',           '#22c55e', 90)
) v(name, color, pos)
WHERE NOT EXISTS (SELECT 1 FROM public.stages);

-- Casos sem etapa atual recebem a primeira etapa
UPDATE public.cases
   SET current_stage_id = (SELECT id FROM public.stages ORDER BY position LIMIT 1)
 WHERE current_phase_id IS NOT NULL AND current_stage_id IS NULL;

-- =========================================================
-- Tabela: motivos de retorno
-- =========================================================
CREATE TABLE IF NOT EXISTS public.stage_return_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  position int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stage_return_reasons TO authenticated;
GRANT ALL ON public.stage_return_reasons TO service_role;

ALTER TABLE public.stage_return_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_return_reasons" ON public.stage_return_reasons;
CREATE POLICY "read_return_reasons" ON public.stage_return_reasons
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_return_reasons" ON public.stage_return_reasons;
CREATE POLICY "admin_manage_return_reasons" ON public.stage_return_reasons
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

INSERT INTO public.stage_return_reasons (label, position)
VALUES ('Ajuste', 10)
ON CONFLICT (label) DO NOTHING;

-- =========================================================
-- RPC: advance_case_workflow (versão simplificada)
-- =========================================================
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD; cur RECORD; next_stage RECORD;
  v_user uuid := auth.uid();
  v_case_label text;
  r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT (public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem avançar.');
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO next_stage FROM public.stages WHERE id = _stage_id;
  ELSIF c.current_stage_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;
    SELECT * INTO next_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position > cur.position
      ORDER BY position LIMIT 1;
  ELSE
    SELECT * INTO next_stage FROM public.stages ORDER BY position LIMIT 1;
  END IF;

  IF next_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa.');
  END IF;

  UPDATE public.cases
     SET current_stage_id = next_stage.id,
         current_phase_id = next_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  v_case_label := COALESCE(c.case_label, c.id::text);

  FOR r IN
    SELECT DISTINCT user_id AS u FROM public.stage_assignments
    WHERE stage_id = next_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Nova tarefa: ' || next_stage.name,
      'O caso ' || v_case_label || ' agora está em ' || next_stage.name || '.',
      'task_assigned',
      jsonb_build_object('case_id', _case_id, 'stage_id', next_stage.id)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', next_stage.phase_id, 'stage_id', next_stage.id);
END $$;

-- =========================================================
-- RPC: return_case_workflow (voltar com justificativa)
-- =========================================================
CREATE OR REPLACE FUNCTION public.return_case_workflow(_case_id uuid, _reason_id uuid, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD; cur RECORD; prev_stage RECORD;
  v_user uuid := auth.uid();
  v_reason text;
  v_case_label text;
  r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT (public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem retroceder.');
  END IF;

  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id = _reason_id;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Justificativa inválida.');
  END IF;

  IF c.current_stage_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caso sem etapa atual.');
  END IF;

  SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;

  -- "Ajuste" → volta direto para "Desenho" se existir
  IF v_reason ILIKE 'Ajuste%' THEN
    SELECT * INTO prev_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND name ILIKE 'Desenho%'
      ORDER BY position LIMIT 1;
  END IF;

  IF prev_stage IS NULL OR prev_stage.id = cur.id THEN
    SELECT * INTO prev_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position < cur.position
      ORDER BY position DESC LIMIT 1;
  END IF;

  IF prev_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há etapa anterior.');
  END IF;

  UPDATE public.cases
     SET current_stage_id = prev_stage.id,
         current_phase_id = prev_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  INSERT INTO public.case_activity (case_id, user_id, kind, content, mentions, metadata)
  VALUES (
    _case_id, v_user, 'workflow_return',
    'Retornou para ' || prev_stage.name || ' — ' || v_reason ||
      CASE WHEN _notes IS NOT NULL AND length(trim(_notes)) > 0 THEN ': ' || _notes ELSE '' END,
    ARRAY[]::uuid[],
    jsonb_build_object('from_stage_id', cur.id, 'to_stage_id', prev_stage.id, 'reason', v_reason, 'notes', _notes)
  );

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN
    SELECT DISTINCT user_id AS u FROM public.stage_assignments
    WHERE stage_id = prev_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Caso retornou: ' || prev_stage.name,
      'O caso ' || v_case_label || ' voltou para ' || prev_stage.name || ' (' || v_reason || ').',
      'workflow_back',
      jsonb_build_object('case_id', _case_id, 'stage_id', prev_stage.id, 'reason', v_reason)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', prev_stage.phase_id, 'stage_id', prev_stage.id, 'reason', v_reason);
END $$;

-- =========================================================
-- RPC: seed_default_workflow (simplificado)
-- =========================================================
CREATE OR REPLACE FUNCTION public.seed_default_workflow()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_fluxo uuid;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT id INTO v_fluxo FROM public.phases ORDER BY position LIMIT 1;
  IF v_fluxo IS NULL THEN
    INSERT INTO public.phases (name, color, position) VALUES ('Fluxo', '#1F8AFF', 10) RETURNING id INTO v_fluxo;
  END IF;

  -- Remove tudo e recria limpo
  DELETE FROM public.stages WHERE phase_id = v_fluxo;

  INSERT INTO public.stages (name, color, position, phase_id)
  VALUES
    ('Novo caso',          '#94a3b8', 10, v_fluxo),
    ('Desenho',            '#3b82f6', 20, v_fluxo),
    ('Prova interna',      '#f59e0b', 30, v_fluxo),
    ('Impressão',          '#8b5cf6', 40, v_fluxo),
    ('Acabamento interno', '#a855f7', 50, v_fluxo),
    ('Prova do paciente',  '#ec4899', 60, v_fluxo),
    ('Fresagem',           '#06b6d4', 70, v_fluxo),
    ('Acabamento',         '#10b981', 80, v_fluxo),
    ('Entregue',           '#22c55e', 90, v_fluxo);

  -- Garante motivo "Ajuste"
  INSERT INTO public.stage_return_reasons (label, position)
  VALUES ('Ajuste', 10)
  ON CONFLICT (label) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END $$;

-- ===== 20260625174537_64721fc5-1658-445a-87c6-7db4675e3334.sql =====

-- Restrict workflow advance to assignees only; allow specifying target stage on return; restrict returns to admins
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur RECORD; next_stage RECORD;
  v_user uuid := auth.uid();
  v_case_label text;
  r record;
  v_has_assignees boolean;
  v_is_assignee boolean;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  -- Apenas o responsável pela etapa atual pode avançar
  IF c.current_stage_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id) INTO v_has_assignees;
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id AND user_id = v_user) INTO v_is_assignee;
    IF v_has_assignees AND NOT v_is_assignee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Apenas o responsável pela etapa pode avançar.');
    END IF;
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO next_stage FROM public.stages WHERE id = _stage_id;
  ELSIF c.current_stage_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;
    SELECT * INTO next_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position > cur.position
      ORDER BY position LIMIT 1;
  ELSE
    SELECT * INTO next_stage FROM public.stages ORDER BY position LIMIT 1;
  END IF;

  IF next_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa.');
  END IF;

  UPDATE public.cases
     SET current_stage_id = next_stage.id,
         current_phase_id = next_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  v_case_label := COALESCE(c.case_label, c.id::text);

  FOR r IN
    SELECT DISTINCT user_id AS u FROM public.stage_assignments
    WHERE stage_id = next_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Nova tarefa: ' || next_stage.name,
      'O caso ' || v_case_label || ' agora está em ' || next_stage.name || '.',
      'task_assigned',
      jsonb_build_object('case_id', _case_id, 'stage_id', next_stage.id)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', next_stage.phase_id, 'stage_id', next_stage.id);
END $function$;

CREATE OR REPLACE FUNCTION public.return_case_workflow(_case_id uuid, _reason_id uuid, _notes text DEFAULT NULL::text, _to_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur RECORD; prev_stage RECORD;
  v_user uuid := auth.uid();
  v_reason text;
  v_case_label text;
  r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  -- Apenas administradores (CEO/DR) podem retroceder
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem retroceder etapas.');
  END IF;

  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id = _reason_id;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Justificativa inválida.');
  END IF;

  IF c.current_stage_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caso sem etapa atual.');
  END IF;

  SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;

  IF _to_stage_id IS NOT NULL THEN
    SELECT * INTO prev_stage FROM public.stages WHERE id = _to_stage_id;
    IF prev_stage IS NULL OR prev_stage.position >= cur.position OR prev_stage.phase_id <> cur.phase_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Etapa de destino inválida.');
    END IF;
  ELSE
    IF v_reason ILIKE 'Ajuste%' THEN
      SELECT * INTO prev_stage FROM public.stages
        WHERE phase_id = cur.phase_id AND name ILIKE 'Desenho%'
        ORDER BY position LIMIT 1;
    END IF;

    IF prev_stage IS NULL OR prev_stage.id = cur.id OR prev_stage.position >= cur.position THEN
      SELECT * INTO prev_stage FROM public.stages
        WHERE phase_id = cur.phase_id AND position < cur.position
        ORDER BY position DESC LIMIT 1;
    END IF;
  END IF;

  IF prev_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há etapa anterior.');
  END IF;

  UPDATE public.cases
     SET current_stage_id = prev_stage.id,
         current_phase_id = prev_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  INSERT INTO public.case_activity (case_id, user_id, kind, content, mentions, metadata)
  VALUES (
    _case_id, v_user, 'workflow_return',
    'Retornou para ' || prev_stage.name || ' — ' || v_reason ||
      CASE WHEN _notes IS NOT NULL AND length(trim(_notes)) > 0 THEN ': ' || _notes ELSE '' END,
    ARRAY[]::uuid[],
    jsonb_build_object('from_stage_id', cur.id, 'to_stage_id', prev_stage.id, 'reason', v_reason, 'notes', _notes)
  );

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN
    SELECT DISTINCT user_id AS u FROM public.stage_assignments
    WHERE stage_id = prev_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Caso retornou: ' || prev_stage.name,
      'O caso ' || v_case_label || ' voltou para ' || prev_stage.name || ' (' || v_reason || ').',
      'workflow_back',
      jsonb_build_object('case_id', _case_id, 'stage_id', prev_stage.id, 'reason', v_reason)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', prev_stage.phase_id, 'stage_id', prev_stage.id, 'reason', v_reason);
END $function$;

-- ===== 20260625203851_3e298910-5691-4b30-b146-9855a4adb527.sql =====

-- 1) Prevent privilege escalation on profiles via trigger comparing OLD vs NEW
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Não é permitido alterar o id do perfil.';
  END IF;

  IF COALESCE(NEW.role, '') IS DISTINCT FROM COALESCE(OLD.role, '') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o papel do usuário.';
  END IF;

  IF COALESCE(NEW.account_subtype, '') IS DISTINCT FROM COALESCE(OLD.account_subtype, '') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o subtipo da conta.';
  END IF;

  IF COALESCE(NEW.is_default_admin, false) IS DISTINCT FROM COALESCE(OLD.is_default_admin, false) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o status de administrador padrão.';
  END IF;

  IF COALESCE(NEW.clinic_id::text, '') IS DISTINCT FROM COALESCE(OLD.clinic_id::text, '') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o consultório vinculado.';
  END IF;

  IF COALESCE(NEW.user_code, '') IS DISTINCT FROM COALESCE(OLD.user_code, '') THEN
    RAISE EXCEPTION 'Não é permitido alterar o código de usuário.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Restrict clinics SELECT to members or admins
DROP POLICY IF EXISTS "Authenticated can view clinics" ON public.clinics;
CREATE POLICY "Members can view their clinic"
ON public.clinics FOR SELECT
TO authenticated
USING (
  public.current_user_is_admin()
  OR id = public.current_user_clinic_id()
  OR EXISTS (
    SELECT 1 FROM public.clinic_members cm
    WHERE cm.clinic_id = clinics.id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
  )
);

-- 3) Restrict stock_item_custom_fields SELECT to same audience as stock_items
DROP POLICY IF EXISTS stock_item_custom_fields_select ON public.stock_item_custom_fields;
CREATE POLICY stock_item_custom_fields_select
ON public.stock_item_custom_fields FOR SELECT
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- ===== 20260626213254_1e8591ee-09f1-4e83-9fff-82229f6ad8f4.sql =====

ALTER TABLE public.case_types ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 100;
ALTER TABLE public.case_types ADD CONSTRAINT case_types_name_unique UNIQUE (name);

INSERT INTO public.case_types (name, position) VALUES
  ('Coroa', 100),
  ('Faceta', 100),
  ('Lente de Contato', 100),
  ('Inlay', 100),
  ('Onlay', 100),
  ('Overlay', 100),
  ('Endocrown', 100),
  ('Pôntico', 100),
  ('Ponte Fixa', 100),
  ('Prótese Parcial Removível (PPR)', 100),
  ('Prótese Total (PT)', 100),
  ('Overdenture', 100),
  ('Protocolo', 100),
  ('Barra Protética', 100),
  ('Pilar Personalizado', 100),
  ('Guia Cirúrgica', 100),
  ('Mock-up', 100),
  ('Enceramento Diagnóstico', 100),
  ('Alinhador Ortodôntico', 100),
  ('Contenção Ortodôntica', 100),
  ('Placa Miorrelaxante', 100),
  ('Placa de Clareamento', 100),
  ('Protetor Bucal', 100),
  ('Jig de Verificação', 100),
  ('Jig de Escaneamento', 100),
  ('Moldeira Individual', 100),
  ('Base de Prova', 100),
  ('Plano de Cera', 100),
  ('Caracterização Gengival', 100),
  ('Reembasamento', 100),
  ('Conserto de Prótese', 100),
  ('Conversão de Prótese', 100),
  ('Impressão 3D', 100),
  ('Fresagem CAD/CAM', 100),
  ('Outro', 9999)
ON CONFLICT (name) DO UPDATE SET position = EXCLUDED.position;

-- ===== 20260626213437_f101c23e-2537-444a-8753-401a7ab8ce2d.sql =====

CREATE TABLE IF NOT EXISTS public.user_stock_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.component_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (user_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stock_access TO authenticated;
GRANT ALL ON public.user_stock_access TO service_role;

ALTER TABLE public.user_stock_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage stock access"
  ON public.user_stock_access FOR ALL
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Users can view own stock access"
  ON public.user_stock_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_stock_access_user ON public.user_stock_access(user_id);

-- ===== 20260626213921_94afb7d3-bcaf-4c18-ad5f-f713115f8f84.sql =====

-- 1) Tabelas
CREATE TABLE IF NOT EXISTS public.stock_consumption_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type_id uuid REFERENCES public.case_types(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.stages(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty_per_case numeric NOT NULL DEFAULT 1,
  qty_per_tooth numeric NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_consumption_rules TO authenticated;
GRANT ALL ON public.stock_consumption_rules TO service_role;
ALTER TABLE public.stock_consumption_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view rules" ON public.stock_consumption_rules
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage rules" ON public.stock_consumption_rules
  FOR ALL TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE TRIGGER tg_stock_consumption_rules_updated
  BEFORE UPDATE ON public.stock_consumption_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.case_stock_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.stock_consumption_rules(id) ON DELETE SET NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL,
  movement_id uuid,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  consumed_by uuid,
  reversed_at timestamptz,
  reversed_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_stock_consumptions TO authenticated;
GRANT ALL ON public.case_stock_consumptions TO service_role;
ALTER TABLE public.case_stock_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view consumptions" ON public.case_stock_consumptions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage consumptions" ON public.case_stock_consumptions
  FOR ALL TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE INDEX IF NOT EXISTS idx_csc_case ON public.case_stock_consumptions(case_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_csc_active ON public.case_stock_consumptions(case_id, rule_id, stage_id) WHERE reversed_at IS NULL;

-- 2) Helper: aplicar regras ao entrar numa etapa
CREATE OR REPLACE FUNCTION public.apply_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; r RECORD;
  v_qty numeric; v_teeth int; v_stock numeric; v_mid uuid;
  v_case_type uuid;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso não encontrado'); END IF;

  -- Tipo do caso (via case_types_link, primeiro encontrado)
  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;

  v_teeth := COALESCE(array_length(c.teeth_zirconia,1),0) + COALESCE(array_length(c.teeth_dissilicato,1),0);

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true
       AND stage_id = _stage_id
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
    -- Idempotência
    IF EXISTS (SELECT 1 FROM public.case_stock_consumptions
               WHERE case_id = _case_id AND rule_id = r.id AND stage_id = _stage_id AND reversed_at IS NULL) THEN
      CONTINUE;
    END IF;

    v_qty := r.qty_per_case + (r.qty_per_tooth * v_teeth);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT qty_on_hand INTO v_stock FROM public.stock_items WHERE id = r.stock_item_id;
    IF r.required AND COALESCE(v_stock,0) < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Estoque insuficiente para avançar: falta ' || (v_qty - COALESCE(v_stock,0))::text || ' un. do item necessário.');
    END IF;

    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (r.stock_item_id, 'auto_rule', -v_qty, 0, 0, _case_id, _user, 'Consumo automático por regra')
    RETURNING id INTO v_mid;

    INSERT INTO public.case_stock_consumptions(case_id, stage_id, rule_id, stock_item_id, qty, movement_id, consumed_by)
    VALUES (_case_id, _stage_id, r.id, r.stock_item_id, v_qty, v_mid, _user);
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END $$;

-- 3) Helper: reverter consumos de uma etapa
CREATE OR REPLACE FUNCTION public.reverse_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k RECORD; v_mid uuid;
BEGIN
  FOR k IN
    SELECT * FROM public.case_stock_consumptions
     WHERE case_id = _case_id AND stage_id = _stage_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'reverse_rule', k.qty, 0, 0, _case_id, _user, 'Reversão de consumo automático')
    RETURNING id INTO v_mid;

    UPDATE public.case_stock_consumptions
       SET reversed_at = now(), reversed_by = _user
     WHERE id = k.id;
  END LOOP;
END $$;

-- 4) Atualizar advance_case_workflow para aplicar regras
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur RECORD; next_stage RECORD;
  v_user uuid := auth.uid();
  v_case_label text; r record;
  v_has_assignees boolean; v_is_assignee boolean;
  v_rules jsonb;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF c.current_stage_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id) INTO v_has_assignees;
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id AND user_id = v_user) INTO v_is_assignee;
    IF v_has_assignees AND NOT v_is_assignee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Apenas o responsável pela etapa pode avançar.');
    END IF;
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO next_stage FROM public.stages WHERE id = _stage_id;
  ELSIF c.current_stage_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;
    SELECT * INTO next_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position > cur.position
      ORDER BY position LIMIT 1;
  ELSE
    SELECT * INTO next_stage FROM public.stages ORDER BY position LIMIT 1;
  END IF;

  IF next_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa.');
  END IF;

  -- Aplicar regras antes de mover; se faltar estoque obrigatório, aborta
  v_rules := public.apply_stock_rules_for_stage(_case_id, next_stage.id, v_user);
  IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
  END IF;

  UPDATE public.cases
     SET current_stage_id = next_stage.id,
         current_phase_id = next_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN SELECT DISTINCT user_id AS u FROM public.stage_assignments
           WHERE stage_id = next_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (v_user, r.u, 'Nova tarefa: ' || next_stage.name,
            'O caso ' || v_case_label || ' agora está em ' || next_stage.name || '.',
            'task_assigned',
            jsonb_build_object('case_id', _case_id, 'stage_id', next_stage.id));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', next_stage.phase_id, 'stage_id', next_stage.id);
END $$;

-- 5) Atualizar return_case_workflow para reverter consumos da etapa abandonada
CREATE OR REPLACE FUNCTION public.return_case_workflow(_case_id uuid, _reason_id uuid, _notes text DEFAULT NULL::text, _to_stage_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur RECORD; prev_stage RECORD;
  v_user uuid := auth.uid();
  v_reason text; v_case_label text; r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem retroceder etapas.');
  END IF;

  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id = _reason_id;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Justificativa inválida.');
  END IF;

  IF c.current_stage_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caso sem etapa atual.');
  END IF;

  SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;

  IF _to_stage_id IS NOT NULL THEN
    SELECT * INTO prev_stage FROM public.stages WHERE id = _to_stage_id;
    IF prev_stage IS NULL OR prev_stage.position >= cur.position OR prev_stage.phase_id <> cur.phase_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Etapa de destino inválida.');
    END IF;
  ELSE
    IF v_reason ILIKE 'Ajuste%' THEN
      SELECT * INTO prev_stage FROM public.stages
        WHERE phase_id = cur.phase_id AND name ILIKE 'Desenho%'
        ORDER BY position LIMIT 1;
    END IF;
    IF prev_stage IS NULL OR prev_stage.id = cur.id OR prev_stage.position >= cur.position THEN
      SELECT * INTO prev_stage FROM public.stages
        WHERE phase_id = cur.phase_id AND position < cur.position
        ORDER BY position DESC LIMIT 1;
    END IF;
  END IF;

  IF prev_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há etapa anterior.');
  END IF;

  -- Reverter consumos da etapa que está sendo abandonada
  PERFORM public.reverse_stock_rules_for_stage(_case_id, cur.id, v_user);

  UPDATE public.cases
     SET current_stage_id = prev_stage.id,
         current_phase_id = prev_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  INSERT INTO public.case_activity (case_id, user_id, kind, content, mentions, metadata)
  VALUES (_case_id, v_user, 'workflow_return',
    'Retornou para ' || prev_stage.name || ' — ' || v_reason ||
      CASE WHEN _notes IS NOT NULL AND length(trim(_notes)) > 0 THEN ': ' || _notes ELSE '' END,
    ARRAY[]::uuid[],
    jsonb_build_object('from_stage_id', cur.id, 'to_stage_id', prev_stage.id, 'reason', v_reason, 'notes', _notes));

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN SELECT DISTINCT user_id AS u FROM public.stage_assignments
           WHERE stage_id = prev_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (v_user, r.u, 'Caso retornou: ' || prev_stage.name,
      'O caso ' || v_case_label || ' voltou para ' || prev_stage.name || ' (' || v_reason || ').',
      'workflow_back',
      jsonb_build_object('case_id', _case_id, 'stage_id', prev_stage.id, 'reason', v_reason));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', prev_stage.phase_id, 'stage_id', prev_stage.id, 'reason', v_reason);
END $$;

-- ===== 20260626220550_765f3d5e-5182-4274-bffc-7b149719a2f2.sql =====

-- N1+N2: Modos de regra e uso por dente

ALTER TABLE public.stock_consumption_rules
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'any';

ALTER TABLE public.stock_consumption_rules
  DROP CONSTRAINT IF EXISTS stock_consumption_rules_mode_chk;
ALTER TABLE public.stock_consumption_rules
  ADD CONSTRAINT stock_consumption_rules_mode_chk CHECK (mode IN ('auto','per_tooth_selection'));
ALTER TABLE public.stock_consumption_rules
  DROP CONSTRAINT IF EXISTS stock_consumption_rules_applies_chk;
ALTER TABLE public.stock_consumption_rules
  ADD CONSTRAINT stock_consumption_rules_applies_chk CHECK (applies_to IN ('any','implant_only'));

-- Tabela de uso por dente
CREATE TABLE IF NOT EXISTS public.case_tooth_stock_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.stock_consumption_rules(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
  tooth_fdi int NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  movement_id uuid,
  used_by uuid,
  used_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS case_tooth_stock_usage_uq
  ON public.case_tooth_stock_usage(case_id, rule_id, tooth_fdi)
  WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS case_tooth_stock_usage_case_idx
  ON public.case_tooth_stock_usage(case_id, stage_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_tooth_stock_usage TO authenticated;
GRANT ALL ON public.case_tooth_stock_usage TO service_role;

ALTER TABLE public.case_tooth_stock_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff view tooth usage" ON public.case_tooth_stock_usage;
CREATE POLICY "staff view tooth usage" ON public.case_tooth_stock_usage
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff insert tooth usage" ON public.case_tooth_stock_usage;
CREATE POLICY "staff insert tooth usage" ON public.case_tooth_stock_usage
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff update tooth usage" ON public.case_tooth_stock_usage;
CREATE POLICY "staff update tooth usage" ON public.case_tooth_stock_usage
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- Helper: dentes elegíveis
CREATE OR REPLACE FUNCTION public.eligible_teeth_for_rule(_case_id uuid, _applies_to text)
RETURNS int[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v int[];
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN ARRAY[]::int[]; END IF;
  IF _applies_to = 'implant_only' THEN
    v := COALESCE(c.implant_teeth, ARRAY[]::int[]);
  ELSE
    v := COALESCE(c.teeth_numbers, ARRAY[]::int[]);
    IF array_length(v,1) IS NULL THEN
      v := COALESCE(c.teeth_zirconia, ARRAY[]::int[]) || COALESCE(c.teeth_dissilicato, ARRAY[]::int[]) || COALESCE(c.implant_teeth, ARRAY[]::int[]);
    END IF;
  END IF;
  RETURN v;
END $$;

-- Registrar uso por dente
CREATE OR REPLACE FUNCTION public.register_tooth_stock_usage(_case_id uuid, _rule_id uuid, _tooth_fdi int, _stock_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; c RECORD; v_user uuid := auth.uid(); v_stock numeric; v_mid uuid;
  v_eligible int[]; v_id uuid; v_has_assignees boolean; v_is_assignee boolean;
BEGIN
  SELECT * INTO r FROM public.stock_consumption_rules WHERE id = _rule_id AND active = true;
  IF r IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Regra inválida'); END IF;
  IF r.mode <> 'per_tooth_selection' THEN RETURN jsonb_build_object('success', false, 'error', 'Regra não é por dente'); END IF;

  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;
  IF c.current_stage_id <> r.stage_id THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não está na etapa da regra'); END IF;

  SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = r.stage_id) INTO v_has_assignees;
  SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = r.stage_id AND user_id = v_user) INTO v_is_assignee;
  IF v_has_assignees AND NOT v_is_assignee AND NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas o responsável pode registrar');
  END IF;

  v_eligible := public.eligible_teeth_for_rule(_case_id, r.applies_to);
  IF NOT (_tooth_fdi = ANY(v_eligible)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dente não elegível para esta regra');
  END IF;

  IF EXISTS (SELECT 1 FROM public.case_tooth_stock_usage WHERE case_id=_case_id AND rule_id=_rule_id AND tooth_fdi=_tooth_fdi AND reversed_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dente já registrado');
  END IF;

  SELECT qty_on_hand INTO v_stock FROM public.stock_items WHERE id = _stock_item_id;
  IF COALESCE(v_stock,0) < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente'); END IF;

  INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'tooth_usage', -1, 0, 0, _case_id, v_user, 'Uso por dente FDI ' || _tooth_fdi)
  RETURNING id INTO v_mid;

  INSERT INTO public.case_tooth_stock_usage(case_id, stage_id, rule_id, stock_item_id, tooth_fdi, qty, movement_id, used_by)
  VALUES (_case_id, r.stage_id, _rule_id, _stock_item_id, _tooth_fdi, 1, v_mid, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.case_activity (case_id, user_id, kind, content, mentions, metadata)
  VALUES (_case_id, v_user, 'stock_tooth_usage',
    'Registrou uso de item no dente ' || _tooth_fdi, ARRAY[]::uuid[],
    jsonb_build_object('rule_id', _rule_id, 'stock_item_id', _stock_item_id, 'tooth_fdi', _tooth_fdi));

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $$;

-- Remover uso (reverte movimento)
CREATE OR REPLACE FUNCTION public.remove_tooth_stock_usage(_usage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u RECORD; v_user uuid := auth.uid(); v_mid uuid;
BEGIN
  SELECT * INTO u FROM public.case_tooth_stock_usage WHERE id = _usage_id;
  IF u IS NULL OR u.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Uso inexistente');
  END IF;

  INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (u.stock_item_id, 'tooth_usage_reverse', u.qty, 0, 0, u.case_id, v_user, 'Reversão de uso por dente FDI ' || u.tooth_fdi)
  RETURNING id INTO v_mid;

  UPDATE public.case_tooth_stock_usage
    SET reversed_at = now(), reversed_by = v_user
   WHERE id = _usage_id;

  RETURN jsonb_build_object('success', true);
END $$;

-- Atualizar apply_stock_rules_for_stage: ignorar regras de seleção (não debita auto)
CREATE OR REPLACE FUNCTION public.apply_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; r RECORD;
  v_qty numeric; v_teeth int; v_stock numeric; v_mid uuid;
  v_case_type uuid; v_eligible int[]; v_covered int;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso não encontrado'); END IF;

  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;

  v_teeth := COALESCE(array_length(c.teeth_zirconia,1),0) + COALESCE(array_length(c.teeth_dissilicato,1),0);

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true AND stage_id = _stage_id
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
    -- Regra por seleção: validar cobertura se obrigatória; nunca debita aqui
    IF r.mode = 'per_tooth_selection' THEN
      IF r.required THEN
        v_eligible := public.eligible_teeth_for_rule(_case_id, r.applies_to);
        IF COALESCE(array_length(v_eligible,1),0) > 0 THEN
          SELECT count(*) INTO v_covered FROM public.case_tooth_stock_usage
            WHERE case_id=_case_id AND rule_id=r.id AND reversed_at IS NULL AND tooth_fdi = ANY(v_eligible);
          IF v_covered < array_length(v_eligible,1) THEN
            RETURN jsonb_build_object('ok', false, 'error',
              'Registre o item para todos os dentes elegíveis antes de avançar (faltam ' ||
              (array_length(v_eligible,1) - v_covered)::text || ').');
          END IF;
        END IF;
      END IF;
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.case_stock_consumptions
               WHERE case_id = _case_id AND rule_id = r.id AND stage_id = _stage_id AND reversed_at IS NULL) THEN
      CONTINUE;
    END IF;

    v_qty := COALESCE(r.qty_per_case,0) + (COALESCE(r.qty_per_tooth,0) * v_teeth);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT qty_on_hand INTO v_stock FROM public.stock_items WHERE id = r.stock_item_id;
    IF r.required AND COALESCE(v_stock,0) < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Estoque insuficiente para avançar: falta ' || (v_qty - COALESCE(v_stock,0))::text || ' un.');
    END IF;

    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (r.stock_item_id, 'auto_rule', -v_qty, 0, 0, _case_id, _user, 'Consumo automático por regra')
    RETURNING id INTO v_mid;

    INSERT INTO public.case_stock_consumptions(case_id, stage_id, rule_id, stock_item_id, qty, movement_id, consumed_by)
    VALUES (_case_id, _stage_id, r.id, r.stock_item_id, v_qty, v_mid, _user);
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END $$;

-- Atualizar reverse_stock_rules_for_stage: também reverter usos por dente da etapa
CREATE OR REPLACE FUNCTION public.reverse_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k RECORD; v_mid uuid;
BEGIN
  FOR k IN
    SELECT * FROM public.case_stock_consumptions
     WHERE case_id = _case_id AND stage_id = _stage_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'reverse_rule', k.qty, 0, 0, _case_id, _user, 'Reversão de consumo automático')
    RETURNING id INTO v_mid;
    UPDATE public.case_stock_consumptions SET reversed_at = now(), reversed_by = _user WHERE id = k.id;
  END LOOP;

  FOR k IN
    SELECT * FROM public.case_tooth_stock_usage
     WHERE case_id = _case_id AND stage_id = _stage_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'tooth_usage_reverse', k.qty, 0, 0, _case_id, _user, 'Reversão de uso por dente (retorno de etapa)')
    RETURNING id INTO v_mid;
    UPDATE public.case_tooth_stock_usage SET reversed_at = now(), reversed_by = _user WHERE id = k.id;
  END LOOP;
END $$;

-- ===== 20260626222339_bf2e4743-8699-4a72-b2db-0b0f983ade64.sql =====

CREATE OR REPLACE FUNCTION public.validate_tooth_rules_for_stage(_case_id uuid, _stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD; v_case_type uuid; v_eligible int[]; v_covered int;
BEGIN
  IF _stage_id IS NULL THEN RETURN jsonb_build_object('ok', true); END IF;
  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true AND stage_id = _stage_id AND mode = 'per_tooth_selection' AND required = true
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
    v_eligible := public.eligible_teeth_for_rule(_case_id, r.applies_to);
    IF COALESCE(array_length(v_eligible,1),0) > 0 THEN
      SELECT count(*) INTO v_covered FROM public.case_tooth_stock_usage
        WHERE case_id=_case_id AND rule_id=r.id AND reversed_at IS NULL AND tooth_fdi = ANY(v_eligible);
      IF v_covered < array_length(v_eligible,1) THEN
        RETURN jsonb_build_object('ok', false, 'error',
          'Registre o item para todos os dentes elegíveis antes de avançar (faltam ' ||
          (array_length(v_eligible,1) - v_covered)::text || ').');
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c RECORD; cur RECORD; next_stage RECORD;
  v_user uuid := auth.uid();
  v_case_label text; r record;
  v_has_assignees boolean; v_is_assignee boolean;
  v_rules jsonb;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF c.current_stage_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id) INTO v_has_assignees;
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id AND user_id = v_user) INTO v_is_assignee;
    IF v_has_assignees AND NOT v_is_assignee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Apenas o responsável pela etapa pode avançar.');
    END IF;
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO next_stage FROM public.stages WHERE id = _stage_id;
  ELSIF c.current_stage_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;
    SELECT * INTO next_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position > cur.position
      ORDER BY position LIMIT 1;
  ELSE
    SELECT * INTO next_stage FROM public.stages ORDER BY position LIMIT 1;
  END IF;

  IF next_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa.');
  END IF;

  -- Validar regras "por dente selecionado" da etapa ATUAL antes de sair dela
  IF c.current_stage_id IS NOT NULL THEN
    v_rules := public.validate_tooth_rules_for_stage(_case_id, c.current_stage_id);
    IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
    END IF;
  END IF;

  -- Aplicar regras automáticas da PRÓXIMA etapa (consumo na entrada)
  v_rules := public.apply_stock_rules_for_stage(_case_id, next_stage.id, v_user);
  IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
  END IF;

  UPDATE public.cases
     SET current_stage_id = next_stage.id,
         current_phase_id = next_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN SELECT DISTINCT user_id AS u FROM public.stage_assignments
           WHERE stage_id = next_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (v_user, r.u, 'Nova tarefa: ' || next_stage.name,
            'O caso ' || v_case_label || ' agora está em ' || next_stage.name || '.',
            'task_assigned',
            jsonb_build_object('case_id', _case_id, 'stage_id', next_stage.id));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', next_stage.phase_id, 'stage_id', next_stage.id);
END $$;

-- ===== 20260626223318_6ff7c676-9bce-4587-a3fc-d6d54befedab.sql =====

CREATE OR REPLACE FUNCTION public.apply_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c RECORD; r RECORD;
  v_qty numeric; v_teeth int; v_stock numeric; v_mid uuid;
  v_case_type uuid;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso não encontrado'); END IF;

  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;
  v_teeth := COALESCE(array_length(c.teeth_zirconia,1),0) + COALESCE(array_length(c.teeth_dissilicato,1),0);

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true AND stage_id = _stage_id
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
    -- Regras "por seleção de dente" são validadas em validate_tooth_rules_for_stage
    -- (na etapa atual, antes de sair). Aqui apenas pulamos.
    IF r.mode = 'per_tooth_selection' THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.case_stock_consumptions
               WHERE case_id = _case_id AND rule_id = r.id AND stage_id = _stage_id AND reversed_at IS NULL) THEN
      CONTINUE;
    END IF;

    v_qty := COALESCE(r.qty_per_case,0) + (COALESCE(r.qty_per_tooth,0) * v_teeth);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT qty_on_hand INTO v_stock FROM public.stock_items WHERE id = r.stock_item_id;
    IF r.required AND COALESCE(v_stock,0) < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Estoque insuficiente para avançar: falta ' || (v_qty - COALESCE(v_stock,0))::text || ' un.');
    END IF;

    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (r.stock_item_id, 'auto_rule', -v_qty, 0, 0, _case_id, _user, 'Consumo automático por regra')
    RETURNING id INTO v_mid;

    INSERT INTO public.case_stock_consumptions(case_id, stage_id, rule_id, stock_item_id, qty, movement_id, consumed_by)
    VALUES (_case_id, _stage_id, r.id, r.stock_item_id, v_qty, v_mid, _user);
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ===== 20260626230724_23b028b9-7766-4554-9fce-d5b0a0ea0b5e.sql =====

CREATE OR REPLACE FUNCTION public.eligible_teeth_for_rule(_case_id uuid, _applies_to text)
 RETURNS integer[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c RECORD; v int[];
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN ARRAY[]::int[]; END IF;
  IF _applies_to = 'implant_only' THEN
    v := COALESCE(c.implant_teeth, ARRAY[]::int[]);
  ELSE
    v := COALESCE(c.teeth_numbers, ARRAY[]::int[]);
    IF array_length(v,1) IS NULL THEN
      v := COALESCE(c.teeth_zirconia, ARRAY[]::int[]) || COALESCE(c.teeth_dissilicato, ARRAY[]::int[]) || COALESCE(c.implant_teeth, ARRAY[]::int[]);
    END IF;
  END IF;
  -- dedupe
  SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), ARRAY[]::int[]) INTO v FROM unnest(v) AS t;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.validate_tooth_rules_for_stage(_case_id uuid, _stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD; v_case_type uuid; v_eligible int[]; v_covered int; v_total int;
BEGIN
  IF _stage_id IS NULL THEN RETURN jsonb_build_object('ok', true); END IF;
  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true AND stage_id = _stage_id AND mode = 'per_tooth_selection' AND required = true
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
    v_eligible := public.eligible_teeth_for_rule(_case_id, r.applies_to);
    v_total := COALESCE(array_length(v_eligible,1),0);
    IF v_total > 0 THEN
      SELECT count(DISTINCT tooth_fdi) INTO v_covered
        FROM public.case_tooth_stock_usage
        WHERE case_id=_case_id AND rule_id=r.id AND reversed_at IS NULL AND tooth_fdi = ANY(v_eligible);
      IF v_covered < v_total THEN
        RETURN jsonb_build_object('ok', false, 'error',
          'Registre o item para todos os dentes elegíveis antes de avançar (faltam ' ||
          (v_total - v_covered)::text || ').');
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- ===== 20260626233226_e32b0f7d-15ce-4e95-86e7-cad929c13356.sql =====

ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'tooth_usage';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'tooth_usage_reverse';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'auto_rule';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'reverse_rule';

-- ===== 20260627185329_07e6bb09-6677-4200-9f53-85d187907be4.sql =====

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS print_note_template jsonb;

-- ===== 20260629123949_609a27fa-390e-4ab5-81bb-f59e21039ca8.sql =====

-- Patient details columns (form expects them)
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS medical_history text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS medications text,
  ADD COLUMN IF NOT EXISTS clinical_notes text,
  ADD COLUMN IF NOT EXISTS name_unaccent text;

-- Helper para busca sem acento (sem extensão unaccent)
CREATE OR REPLACE FUNCTION public.normalize_text(s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(coalesce(s,''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

CREATE OR REPLACE FUNCTION public.patients_set_unaccent()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.name_unaccent := public.normalize_text(NEW.name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_patients_unaccent ON public.patients;
CREATE TRIGGER trg_patients_unaccent BEFORE INSERT OR UPDATE OF name ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_set_unaccent();

UPDATE public.patients SET name_unaccent = public.normalize_text(name) WHERE name_unaccent IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_name_unaccent ON public.patients (name_unaccent);

-- ============ N4: Numeração sequencial amigável de casos ============
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_number bigint;
CREATE SEQUENCE IF NOT EXISTS public.cases_case_number_seq START WITH 1000;

-- Backfill ordenado por created_at
DO $$
DECLARE r RECORD; n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.cases WHERE case_number IS NULL) THEN
    FOR r IN SELECT id FROM public.cases WHERE case_number IS NULL ORDER BY created_at LOOP
      n := nextval('public.cases_case_number_seq');
      UPDATE public.cases SET case_number = n WHERE id = r.id;
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.cases ALTER COLUMN case_number SET DEFAULT nextval('public.cases_case_number_seq');
ALTER TABLE public.cases ALTER COLUMN case_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_key ON public.cases(case_number);

-- ============ N1: RPC para edição de membros (evita problemas de RLS) ============
CREATE OR REPLACE FUNCTION public.update_team_member(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text,
  p_category_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  UPDATE public.profiles
     SET full_name = p_full_name,
         email = p_email,
         phone = p_phone,
         role = p_role,
         account_subtype = p_role,
         updated_at = now()
   WHERE id = p_user_id;

  DELETE FROM public.user_stock_access
   WHERE user_id = p_user_id
     AND (p_category_ids IS NULL OR NOT (category_id = ANY(p_category_ids)));

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO public.user_stock_access(user_id, category_id, created_by)
    SELECT p_user_id, c, auth.uid() FROM unnest(p_category_ids) AS c
    ON CONFLICT (user_id, category_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

GRANT EXECUTE ON FUNCTION public.update_team_member(uuid, text, text, text, text, uuid[]) TO authenticated;

-- ===== 20260701021151_43b68059-bedd-4096-8730-850c6631a52f.sql =====

ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_types_link;
ALTER TABLE public.patients REPLICA IDENTITY FULL;
ALTER TABLE public.doctors REPLICA IDENTITY FULL;
ALTER TABLE public.case_types_link REPLICA IDENTITY FULL;
ALTER TABLE public.cases REPLICA IDENTITY FULL;

-- ===== 20260701022248_98168ead-851b-4e32-95fe-78fd24d1b8a1.sql =====

-- 1. Extend clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'consultorio',
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS invite_code text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_kind_check') THEN
    ALTER TABLE public.clinics ADD CONSTRAINT clinics_kind_check CHECK (kind IN ('consultorio','laboratorio'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clinics_invite_code_key ON public.clinics(invite_code) WHERE invite_code IS NOT NULL;

-- Helper: generate opaque invite code
CREATE OR REPLACE FUNCTION public.generate_clinic_invite_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  code text;
  n int;
BEGIN
  LOOP
    code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
    SELECT count(*) INTO n FROM public.clinics WHERE invite_code = code;
    EXIT WHEN n = 0;
  END LOOP;
  RETURN code;
END $$;

-- Backfill existing clinics
UPDATE public.clinics
   SET invite_code = public.generate_clinic_invite_code()
 WHERE invite_code IS NULL;

UPDATE public.clinics c
   SET owner_id = (
     SELECT p.id FROM public.profiles p
      WHERE p.clinic_id = c.id AND p.role IN ('CEO','DR')
      ORDER BY p.created_at ASC NULLS LAST LIMIT 1
   )
 WHERE owner_id IS NULL;

-- 2. Create company account (called right after auth signup by the owner)
CREATE OR REPLACE FUNCTION public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic_id uuid;
  v_existing_clinic uuid;
  v_code text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;
  IF p_kind NOT IN ('consultorio','laboratorio') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo inválido');
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome da empresa inválido');
  END IF;

  SELECT clinic_id INTO v_existing_clinic FROM public.profiles WHERE id = v_user;
  IF v_existing_clinic IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário já vinculado a uma empresa');
  END IF;

  v_code := public.generate_clinic_invite_code();

  INSERT INTO public.clinics (name, kind, owner_id, invite_code)
  VALUES (trim(p_name), p_kind, v_user, v_code)
  RETURNING id INTO v_clinic_id;

  UPDATE public.profiles
     SET clinic_id = v_clinic_id,
         role = 'CEO',
         account_subtype = 'CEO',
         is_default_admin = true,
         full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
         updated_at = now()
   WHERE id = v_user;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_clinic_id, v_user, 'CEO', 'active', v_user, v_user, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = 'CEO', decided_by = v_user, decided_at = now();

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id, 'invite_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- 3. Join company using invite code (employee flow)
CREATE OR REPLACE FUNCTION public.join_company_with_code(
  p_invite_code text,
  p_role text DEFAULT 'USER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic RECORD;
  v_existing uuid;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT clinic_id INTO v_existing FROM public.profiles WHERE id = v_user;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário já vinculado a uma empresa');
  END IF;

  SELECT * INTO v_clinic FROM public.clinics WHERE invite_code = upper(trim(p_invite_code));
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código de convite inválido');
  END IF;

  v_role := COALESCE(NULLIF(p_role,''), 'USER');
  IF v_role NOT IN ('USER','ATENDIMENTO','PROTETICO','CADISTA','DR') THEN
    v_role := 'USER';
  END IF;

  UPDATE public.profiles
     SET clinic_id = v_clinic.id,
         role = v_role,
         account_subtype = v_role,
         updated_at = now()
   WHERE id = v_user;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_clinic.id, v_user, v_role, 'active', v_clinic.owner_id, v_clinic.owner_id, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = v_role, decided_at = now();

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic.id, 'clinic_name', v_clinic.name);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- 4. Regenerate invite code (admin only)
CREATE OR REPLACE FUNCTION public.regenerate_company_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic_id uuid;
  v_new text;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  SELECT clinic_id INTO v_clinic_id FROM public.profiles WHERE id = v_user;
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem empresa vinculada');
  END IF;
  v_new := public.generate_clinic_invite_code();
  UPDATE public.clinics SET invite_code = v_new WHERE id = v_clinic_id;
  RETURN jsonb_build_object('success', true, 'invite_code', v_new);
END $$;

-- ===== 20260701025825_0a869bcd-bddb-483a-a5b8-d4edce79b718.sql =====

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='case_attachments') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.case_attachments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='model_annotations') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.model_annotations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='case_tooth_stock_usage') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.case_tooth_stock_usage';
  END IF;
END $$;

ALTER TABLE public.case_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.model_annotations REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.cases REPLICA IDENTITY FULL;

-- ===== 20260701032548_83ac1db0-7a16-4d1c-bc5a-7f058f46f642.sql =====

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'stock_items','stock_movements','case_types','burrs','user_roles','clinic_members',
    'component_categories','components','holders','implant_systems','tooth_colors',
    'case_components','case_stock_consumptions','workflow_settings','profiles',
    'case_stages','stage_assignments','phase_assignments','stage_return_reasons',
    'stock_consumption_rules','stock_item_custom_fields','user_stock_access',
    'cadistas','scan_jigs','clinics','burr_usages'
  ]) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
  FOR t IN SELECT unnest(ARRAY[
    'cases','patients','doctors','case_activity','case_attachments',
    'case_tooth_stock_usage','case_types_link','model_annotations','notifications','phases','stages'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ===== 20260701034558_859b7e07-7eb3-4375-adf7-68ece648806f.sql =====

UPDATE public.clinics SET name = 'IPO - Instituto Praia de Odontologia' WHERE id = '990bbafa-c15b-4845-976e-c457c7821db4';

-- ===== 20260702060158_c949483c-e015-4ac0-b758-36ca10e35b0f.sql =====

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS gum_info jsonb;

-- ===== 20260704140617_07ba13b3-0fd5-4518-8dea-aea4a66bc5cb.sql =====

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Storage policies for avatars bucket (public read, user manages own folder)
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_user_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_user_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_user_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 20260704165711_e9ca81d3-1e79-43d7-b1fa-66aa0d59935b.sql =====

-- Recreate the missing trigger that creates a public.profiles row for every new auth user.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any pre-existing users that were signed up while the trigger was missing.
INSERT INTO public.profiles (id, full_name, email, role, user_code, clinic_id)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       u.email,
       'USER',
       public.generate_user_code(),
       NULL
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- ===== 20260704170215_208bdc59-8778-40df-bd03-b26c6a0e8a3e.sql =====

-- Allow profile privilege fields to follow an already-approved active clinic membership
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_membership_role text;
BEGIN
  IF public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Não é permitido alterar o id do perfil.';
  END IF;

  SELECT cm.role
    INTO v_membership_role
  FROM public.clinic_members cm
  WHERE cm.user_id = NEW.id
    AND cm.clinic_id = NEW.clinic_id
    AND cm.status = 'active'
  ORDER BY (cm.role = 'CEO') DESC, cm.decided_at DESC NULLS LAST, cm.created_at DESC
  LIMIT 1;

  IF COALESCE(NEW.clinic_id::text, '') IS DISTINCT FROM COALESCE(OLD.clinic_id::text, '')
     AND v_membership_role IS NULL THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o consultório vinculado.';
  END IF;

  IF COALESCE(NEW.role, '') IS DISTINCT FROM COALESCE(OLD.role, '')
     AND (v_membership_role IS NULL OR NEW.role IS DISTINCT FROM v_membership_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o papel do usuário.';
  END IF;

  IF COALESCE(NEW.account_subtype, '') IS DISTINCT FROM COALESCE(OLD.account_subtype, '')
     AND NOT (v_membership_role = 'CEO' AND NEW.account_subtype = 'CEO') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o subtipo da conta.';
  END IF;

  IF COALESCE(NEW.is_default_admin, false) IS DISTINCT FROM COALESCE(OLD.is_default_admin, false)
     AND NOT (v_membership_role = 'CEO' AND NEW.is_default_admin = true) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o status de administrador padrão.';
  END IF;

  IF COALESCE(NEW.user_code, '') IS DISTINCT FROM COALESCE(OLD.user_code, '') THEN
    RAISE EXCEPTION 'Não é permitido alterar o código de usuário.';
  END IF;

  RETURN NEW;
END
$function$;

-- Sync profiles that already have an active clinic membership but no clinic on the profile
WITH active_memberships AS (
  SELECT DISTINCT ON (cm.user_id)
    cm.user_id,
    cm.clinic_id,
    cm.role
  FROM public.clinic_members cm
  WHERE cm.status = 'active'
  ORDER BY
    cm.user_id,
    (cm.role = 'CEO') DESC,
    cm.decided_at DESC NULLS LAST,
    cm.created_at DESC
)
UPDATE public.profiles p
SET
  clinic_id = am.clinic_id,
  role = CASE
    WHEN p.role IS NULL OR p.role = 'USER' OR am.role IN ('CEO', 'DR', 'PROTETICO', 'CADISTA', 'ATENDIMENTO') THEN am.role
    ELSE p.role
  END,
  account_subtype = CASE
    WHEN am.role = 'CEO' THEN 'CEO'
    ELSE p.account_subtype
  END,
  is_default_admin = CASE
    WHEN am.role = 'CEO' THEN true
    ELSE p.is_default_admin
  END,
  updated_at = now()
FROM active_memberships am
WHERE p.id = am.user_id
  AND p.clinic_id IS NULL;

-- Make company-account creation resilient to profile creation timing
CREATE OR REPLACE FUNCTION public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_user_email text;
  v_clinic_id uuid;
  v_existing_clinic uuid;
  v_code text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  IF p_kind NOT IN ('consultorio','laboratorio') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo inválido');
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome da empresa inválido');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user;

  SELECT COALESCE(
    (SELECT p.clinic_id FROM public.profiles p WHERE p.id = v_user),
    (SELECT cm.clinic_id
       FROM public.clinic_members cm
      WHERE cm.user_id = v_user AND cm.status = 'active'
      ORDER BY (cm.role = 'CEO') DESC, cm.decided_at DESC NULLS LAST, cm.created_at DESC
      LIMIT 1)
  ) INTO v_existing_clinic;

  IF v_existing_clinic IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário já vinculado a uma empresa');
  END IF;

  v_code := public.generate_clinic_invite_code();

  INSERT INTO public.clinics (name, kind, owner_id, invite_code)
  VALUES (trim(p_name), p_kind, v_user, v_code)
  RETURNING id INTO v_clinic_id;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_clinic_id, v_user, 'CEO', 'active', v_user, v_user, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = 'CEO', decided_by = v_user, decided_at = now(), updated_at = now();

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    account_subtype,
    is_default_admin,
    user_code,
    clinic_id
  )
  VALUES (
    v_user,
    COALESCE(NULLIF(trim(p_full_name), ''), v_user_email),
    v_user_email,
    'CEO',
    'CEO',
    true,
    public.generate_user_code(),
    v_clinic_id
  )
  ON CONFLICT (id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id,
        role = 'CEO',
        account_subtype = 'CEO',
        is_default_admin = true,
        full_name = COALESCE(NULLIF(trim(p_full_name), ''), public.profiles.full_name, v_user_email),
        email = COALESCE(public.profiles.email, v_user_email),
        updated_at = now();

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id, 'invite_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END
$function$;

-- ===== 20260704220434_4adaa8ef-3e48-405d-a229-a92432c6265f.sql =====

-- Módulo de Sistemas de Implantes

-- 1. Componentes de sistema de implante (ex.: "Cone Morse 3.5x10")
CREATE TABLE IF NOT EXISTS public.implant_system_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_isc_system ON public.implant_system_components(implant_system_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_system_components TO authenticated;
GRANT ALL ON public.implant_system_components TO service_role;

ALTER TABLE public.implant_system_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage implant components"
  ON public.implant_system_components FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_isc_updated_at BEFORE UPDATE ON public.implant_system_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Extend stock_items with FK to implant component
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS implant_system_component_id uuid
    REFERENCES public.implant_system_components(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_items_impl_comp ON public.stock_items(implant_system_component_id);

-- 3. Registro por dente do caso
CREATE TABLE IF NOT EXISTS public.case_implant_teeth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  tooth_fdi int NOT NULL,
  implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
  qty numeric NOT NULL DEFAULT 1,
  movement_id uuid REFERENCES public.stock_movements(id),
  reversed_at timestamptz,
  reversed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cit_active
  ON public.case_implant_teeth(case_id, tooth_fdi) WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cit_case ON public.case_implant_teeth(case_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_implant_teeth TO authenticated;
GRANT ALL ON public.case_implant_teeth TO service_role;

ALTER TABLE public.case_implant_teeth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read implant teeth"
  ON public.case_implant_teeth FOR SELECT TO authenticated
  USING (public.can_access_case(case_id));
CREATE POLICY "staff modify implant teeth"
  ON public.case_implant_teeth FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- 4. RPC: registra uso de implante em um dente
CREATE OR REPLACE FUNCTION public.register_case_implant_tooth(
  _case_id uuid, _tooth_fdi int, _stock_item_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c RECORD; si RECORD; v_user uuid := auth.uid(); v_mid uuid; v_id uuid;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT (_tooth_fdi = ANY(COALESCE(c.implant_teeth, ARRAY[]::int[]))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dente não marcado como implante neste caso');
  END IF;

  SELECT * INTO si FROM public.stock_items WHERE id = _stock_item_id;
  IF si IS NULL OR si.implant_system_component_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item de estoque inválido para implante');
  END IF;
  IF COALESCE(si.qty_on_hand, 0) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente');
  END IF;

  IF EXISTS (SELECT 1 FROM public.case_implant_teeth
             WHERE case_id = _case_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dente já registrado');
  END IF;

  INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'implant_usage', -1, 0, 0, _case_id, v_user, 'Implante FDI ' || _tooth_fdi)
  RETURNING id INTO v_mid;

  INSERT INTO public.case_implant_teeth(case_id, tooth_fdi, implant_system_id, stock_item_id, qty, movement_id, created_by)
  SELECT _case_id, _tooth_fdi, isc.implant_system_id, _stock_item_id, 1, v_mid, v_user
    FROM public.implant_system_components isc
   WHERE isc.id = si.implant_system_component_id
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $$;

-- 5. RPC: remove/reverte
CREATE OR REPLACE FUNCTION public.remove_case_implant_tooth(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE u RECORD; v_user uuid := auth.uid(); v_mid uuid;
BEGIN
  SELECT * INTO u FROM public.case_implant_teeth WHERE id = _id;
  IF u IS NULL OR u.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registro inexistente');
  END IF;

  INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (u.stock_item_id, 'implant_usage_reverse', u.qty, 0, 0, u.case_id, v_user, 'Reversão implante FDI ' || u.tooth_fdi)
  RETURNING id INTO v_mid;

  UPDATE public.case_implant_teeth SET reversed_at = now(), reversed_by = v_user WHERE id = _id;
  RETURN jsonb_build_object('success', true);
END $$;

-- 6. RPC: cria sistema completo com componentes e estoque inicial
CREATE OR REPLACE FUNCTION public.create_implant_system_with_stock(
  _name text,
  _line text,
  _components jsonb  -- [{name, sku, qty, min_qty, unit}]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_system_id uuid;
  v_comp_id uuid;
  v_cat_id uuid;
  v_cat_name text := 'Implantes';
  r jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF _name IS NULL OR length(trim(_name)) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome obrigatório');
  END IF;

  INSERT INTO public.implant_systems(name, line)
  VALUES (trim(_name), NULLIF(trim(COALESCE(_line,'')), ''))
  RETURNING id INTO v_system_id;

  -- Categoria "Implantes" no estoque v2
  SELECT id INTO v_cat_id FROM public.stock_categories_v2 WHERE lower(name) = lower(v_cat_name) LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.stock_categories_v2(name, position)
    VALUES (v_cat_name, COALESCE((SELECT max(position) FROM public.stock_categories_v2), 0) + 10)
    RETURNING id INTO v_cat_id;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_components, '[]'::jsonb))
  LOOP
    INSERT INTO public.implant_system_components(implant_system_id, name, sku)
    VALUES (v_system_id, r->>'name', NULLIF(r->>'sku',''))
    RETURNING id INTO v_comp_id;

    INSERT INTO public.stock_items(
      category, name, brand, unit, qty_on_hand, min_qty,
      implant_system_component_id, category_id, category_name, type
    )
    VALUES (
      'component',
      (r->>'name'),
      trim(_name),
      COALESCE(NULLIF(r->>'unit',''), 'un'),
      COALESCE((r->>'qty')::numeric, 0),
      COALESCE((r->>'min_qty')::numeric, 0),
      v_comp_id,
      v_cat_id,
      v_cat_name,
      trim(_name)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'implant_system_id', v_system_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- ===== 20260704220503_2a424759-8043-4cb6-9713-32a5244ea221.sql =====

CREATE OR REPLACE FUNCTION public.create_implant_system_with_stock(
  _name text,
  _line text,
  _components jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_system_id uuid;
  v_comp_id uuid;
  v_cat_id uuid;
  v_cat_name text := 'Implantes';
  r jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF _name IS NULL OR length(trim(_name)) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome obrigatório');
  END IF;

  INSERT INTO public.implant_systems(name, line)
  VALUES (trim(_name), NULLIF(trim(COALESCE(_line,'')), ''))
  RETURNING id INTO v_system_id;

  SELECT id INTO v_cat_id FROM public.component_categories WHERE lower(name) = lower(v_cat_name) LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.component_categories(name, position)
    VALUES (v_cat_name, COALESCE((SELECT max(position) FROM public.component_categories), 0) + 10)
    RETURNING id INTO v_cat_id;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_components, '[]'::jsonb))
  LOOP
    INSERT INTO public.implant_system_components(implant_system_id, name, sku)
    VALUES (v_system_id, r->>'name', NULLIF(r->>'sku',''))
    RETURNING id INTO v_comp_id;

    INSERT INTO public.stock_items(
      category, name, brand, unit, qty_on_hand, min_qty,
      implant_system_component_id, category_id, type
    )
    VALUES (
      'component',
      (r->>'name'),
      trim(_name),
      COALESCE(NULLIF(r->>'unit',''), 'un'),
      COALESCE((r->>'qty')::numeric, 0),
      COALESCE((r->>'min_qty')::numeric, 0),
      v_comp_id,
      v_cat_id,
      trim(_name)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'implant_system_id', v_system_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- ===== 20260707171844_c127e59f-840e-49cb-9bfa-b2c0a8b1cef5.sql =====

-- 1) Fix search_path on remaining functions
ALTER FUNCTION public.normalize_text(text) SET search_path = public;
ALTER FUNCTION public.patients_set_unaccent() SET search_path = public;

-- 2) Avatars: restrict SELECT to authenticated
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_authenticated_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- 3) Unify admin check across systems
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('CEO','DR')
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- has_role: keep behavior but treat CEO/DR as implicit 'admin'
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  ) OR (
    _role = 'admin'::app_role
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role IN ('CEO','DR'))
  );
$$;

-- 4) Backups: use unified admin check
DROP POLICY IF EXISTS backups_admin_all ON public.backups;
CREATE POLICY backups_admin_all ON public.backups
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

-- 5) profiles_self_update: rebind to authenticated, harden NULL handling
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR public.current_user_is_admin())
  WITH CHECK (
    public.current_user_is_admin()
    OR (
      id = auth.uid()
      AND COALESCE(role, '') = COALESCE((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), '')
      AND COALESCE(account_subtype, '') = COALESCE((SELECT p.account_subtype FROM public.profiles p WHERE p.id = auth.uid()), '')
      AND COALESCE(is_default_admin, false) = COALESCE((SELECT p.is_default_admin FROM public.profiles p WHERE p.id = auth.uid()), false)
      AND COALESCE(clinic_id::text, '') = COALESCE((SELECT p.clinic_id::text FROM public.profiles p WHERE p.id = auth.uid()), '')
    )
  );

-- 6) Lock down function EXECUTE grants
-- Revoke EXECUTE from PUBLIC and anon on all public functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Revoke EXECUTE from authenticated on internal/trigger-only functions
DO $$
DECLARE
  fn text;
  internal text[] := ARRAY[
    'handle_new_user','sync_profile_to_team','apply_stock_movement',
    'touch_last_restocked','prevent_profile_privilege_escalation',
    'patients_set_unaccent','update_updated_at_column','set_updated_at',
    'ensure_first_user_is_admin','prevent_unsafe_truncate',
    'generate_user_code','generate_clinic_invite_code','normalize_text',
    'consume_case_stock','reverse_case_stock','reverse_stock_rules_for_stage',
    'apply_stock_rules_for_stage','validate_tooth_rules_for_stage',
    'eligible_teeth_for_rule','profile_role','profile_is_default_admin'
  ];
  r record;
BEGIN
  FOREACH fn IN ARRAY internal LOOP
    FOR r IN
      SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
                     r.nspname, r.proname, r.args);
    END LOOP;
  END LOOP;
END $$;

-- ===== 20260709043241_47aea476-cdea-4ce0-bc89-c7de08f22106.sql =====

-- 1) Tabela de tipos de componente
CREATE TABLE IF NOT EXISTS public.implant_component_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  position int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_component_types TO authenticated;
GRANT ALL ON public.implant_component_types TO service_role;

ALTER TABLE public.implant_component_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can view implant component types"
  ON public.implant_component_types FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "admins can insert implant component types"
  ON public.implant_component_types FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "admins can update implant component types"
  ON public.implant_component_types FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "admins can delete implant component types"
  ON public.implant_component_types FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin());

CREATE TRIGGER trg_implant_component_types_updated_at
  BEFORE UPDATE ON public.implant_component_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed padrão
INSERT INTO public.implant_component_types (name, position) VALUES
  ('Análogo', 10),
  ('T-Base', 20),
  ('Link', 30),
  ('UCLA', 40),
  ('Munhão', 50),
  ('Parafuso de fixação', 60),
  ('Parafuso clínico', 70),
  ('Cicatrizador', 80),
  ('Transferente', 90),
  ('Outros', 999)
ON CONFLICT (name) DO NOTHING;

-- 2) Coluna component_type_id em implant_system_components
ALTER TABLE public.implant_system_components
  ADD COLUMN IF NOT EXISTS component_type_id uuid REFERENCES public.implant_component_types(id) ON DELETE SET NULL;

-- Backfill com "Outros"
UPDATE public.implant_system_components
   SET component_type_id = (SELECT id FROM public.implant_component_types WHERE name = 'Outros')
 WHERE component_type_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_implant_system_components_type
  ON public.implant_system_components(component_type_id);

-- 3) Atualiza RPC create_implant_system_with_stock para aceitar component_type_id / component_type
CREATE OR REPLACE FUNCTION public.create_implant_system_with_stock(_name text, _line text, _components jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_system_id uuid;
  v_comp_id uuid;
  v_cat_id uuid;
  v_type_id uuid;
  v_cat_name text := 'Implantes';
  v_default_type uuid;
  r jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF _name IS NULL OR length(trim(_name)) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome obrigatório');
  END IF;

  SELECT id INTO v_default_type FROM public.implant_component_types WHERE name = 'Outros' LIMIT 1;

  INSERT INTO public.implant_systems(name, line)
  VALUES (trim(_name), NULLIF(trim(COALESCE(_line,'')), ''))
  RETURNING id INTO v_system_id;

  SELECT id INTO v_cat_id FROM public.component_categories WHERE lower(name) = lower(v_cat_name) LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.component_categories(name, position)
    VALUES (v_cat_name, COALESCE((SELECT max(position) FROM public.component_categories), 0) + 10)
    RETURNING id INTO v_cat_id;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_components, '[]'::jsonb))
  LOOP
    v_type_id := NULL;
    IF (r ? 'component_type_id') AND NULLIF(r->>'component_type_id','') IS NOT NULL THEN
      v_type_id := (r->>'component_type_id')::uuid;
    ELSIF (r ? 'component_type') AND NULLIF(r->>'component_type','') IS NOT NULL THEN
      SELECT id INTO v_type_id FROM public.implant_component_types
       WHERE lower(name) = lower(r->>'component_type') LIMIT 1;
    END IF;
    IF v_type_id IS NULL THEN v_type_id := v_default_type; END IF;

    INSERT INTO public.implant_system_components(implant_system_id, name, sku, component_type_id)
    VALUES (v_system_id, r->>'name', NULLIF(r->>'sku',''), v_type_id)
    RETURNING id INTO v_comp_id;

    INSERT INTO public.stock_items(
      category, name, brand, unit, qty_on_hand, min_qty,
      implant_system_component_id, category_id, type
    )
    VALUES (
      'component',
      (r->>'name'),
      trim(_name),
      COALESCE(NULLIF(r->>'unit',''), 'un'),
      COALESCE((r->>'qty')::numeric, 0),
      COALESCE((r->>'min_qty')::numeric, 0),
      v_comp_id,
      v_cat_id,
      trim(_name)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'implant_system_id', v_system_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $function$;

-- 4) Novo RPC add_implant_component
CREATE OR REPLACE FUNCTION public.add_implant_component(
  _system_id uuid,
  _type_id uuid,
  _name text,
  _sku text DEFAULT NULL,
  _qty numeric DEFAULT 0,
  _min_qty numeric DEFAULT 0,
  _unit text DEFAULT 'un'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_comp_id uuid;
  v_cat_id uuid;
  v_sys_name text;
  v_cat_name text := 'Implantes';
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF _name IS NULL OR length(trim(_name)) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do componente obrigatório');
  END IF;

  SELECT name INTO v_sys_name FROM public.implant_systems WHERE id = _system_id;
  IF v_sys_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sistema inválido');
  END IF;

  IF _type_id IS NULL THEN
    SELECT id INTO _type_id FROM public.implant_component_types WHERE name = 'Outros' LIMIT 1;
  END IF;

  SELECT id INTO v_cat_id FROM public.component_categories WHERE lower(name) = lower(v_cat_name) LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.component_categories(name, position)
    VALUES (v_cat_name, COALESCE((SELECT max(position) FROM public.component_categories), 0) + 10)
    RETURNING id INTO v_cat_id;
  END IF;

  INSERT INTO public.implant_system_components(implant_system_id, name, sku, component_type_id)
  VALUES (_system_id, trim(_name), NULLIF(_sku,''), _type_id)
  RETURNING id INTO v_comp_id;

  INSERT INTO public.stock_items(
    category, name, brand, unit, qty_on_hand, min_qty,
    implant_system_component_id, category_id, type
  ) VALUES (
    'component',
    trim(_name),
    v_sys_name,
    COALESCE(NULLIF(_unit,''), 'un'),
    COALESCE(_qty, 0),
    COALESCE(_min_qty, 0),
    v_comp_id,
    v_cat_id,
    v_sys_name
  );

  RETURN jsonb_build_object('success', true, 'component_id', v_comp_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- ===== 20260710041701_1285861a-2782-4182-9b78-8631ec409506.sql =====

ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_implant_components_for_stage(_case_id uuid, _stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requires boolean;
  v_implant_teeth int[];
  v_pending int[];
BEGIN
  SELECT requires_implant_components INTO v_requires FROM public.stages WHERE id = _stage_id;
  IF v_requires IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT implant_teeth INTO v_implant_teeth FROM public.cases WHERE id = _case_id;
  IF v_implant_teeth IS NULL OR array_length(v_implant_teeth, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT ARRAY(
    SELECT t FROM unnest(v_implant_teeth) AS t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.case_implant_teeth cit
      WHERE cit.case_id = _case_id
        AND cit.tooth_fdi = t
        AND cit.reversed_at IS NULL
    )
    ORDER BY t
  ) INTO v_pending;

  IF array_length(v_pending, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'error', 'Aponte o componente de implante para o(s) dente(s): ' || array_to_string(v_pending, ', '),
    'pending', to_jsonb(v_pending)
  );
END $$;

CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur RECORD; next_stage RECORD;
  v_user uuid := auth.uid();
  v_case_label text; r record;
  v_has_assignees boolean; v_is_assignee boolean;
  v_rules jsonb;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF c.current_stage_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id) INTO v_has_assignees;
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id AND user_id = v_user) INTO v_is_assignee;
    IF v_has_assignees AND NOT v_is_assignee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Apenas o responsável pela etapa pode avançar.');
    END IF;
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO next_stage FROM public.stages WHERE id = _stage_id;
  ELSIF c.current_stage_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;
    SELECT * INTO next_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position > cur.position
      ORDER BY position LIMIT 1;
  ELSE
    SELECT * INTO next_stage FROM public.stages ORDER BY position LIMIT 1;
  END IF;

  IF next_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa.');
  END IF;

  IF c.current_stage_id IS NOT NULL THEN
    v_rules := public.validate_tooth_rules_for_stage(_case_id, c.current_stage_id);
    IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
    END IF;

    v_rules := public.validate_implant_components_for_stage(_case_id, c.current_stage_id);
    IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
    END IF;
  END IF;

  v_rules := public.apply_stock_rules_for_stage(_case_id, next_stage.id, v_user);
  IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
  END IF;

  UPDATE public.cases
     SET current_stage_id = next_stage.id,
         current_phase_id = next_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN SELECT DISTINCT user_id AS u FROM public.stage_assignments
           WHERE stage_id = next_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (v_user, r.u, 'Nova tarefa: ' || next_stage.name,
            'O caso ' || v_case_label || ' agora está em ' || next_stage.name || '.',
            'task_assigned',
            jsonb_build_object('case_id', _case_id, 'stage_id', next_stage.id));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', next_stage.phase_id, 'stage_id', next_stage.id);
END $function$;

-- ===== 20260710051953_186428c8-7d0b-416b-a4f1-a005286fed3c.sql =====

ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'implant_usage';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'implant_usage_reverse';

-- ===== 20260711014134_8a54b728-7fcd-4b05-8bee-025a1229d104.sql =====

CREATE OR REPLACE FUNCTION public.reverse_all_case_stock(_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  k RECORD;
  m RECORD;
  v_mid uuid;
BEGIN
  -- 1. Reverse implant tooth usages
  FOR k IN
    SELECT * FROM public.case_implant_teeth
     WHERE case_id = _case_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'implant_usage_reverse', k.qty, 0, 0, _case_id, v_user, 'Reversão por exclusão/cancelamento do caso (implante FDI ' || k.tooth_fdi || ')')
    RETURNING id INTO v_mid;
    UPDATE public.case_implant_teeth SET reversed_at = now(), reversed_by = v_user WHERE id = k.id;
  END LOOP;

  -- 2. Reverse per-tooth stock usage
  FOR k IN
    SELECT * FROM public.case_tooth_stock_usage
     WHERE case_id = _case_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'tooth_usage_reverse', k.qty, 0, 0, _case_id, v_user, 'Reversão por exclusão/cancelamento do caso (dente ' || k.tooth_fdi || ')')
    RETURNING id INTO v_mid;
    UPDATE public.case_tooth_stock_usage SET reversed_at = now(), reversed_by = v_user WHERE id = k.id;
  END LOOP;

  -- 3. Reverse automatic rule consumptions
  FOR k IN
    SELECT * FROM public.case_stock_consumptions
     WHERE case_id = _case_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'reverse_rule', k.qty, 0, 0, _case_id, v_user, 'Reversão por exclusão/cancelamento do caso')
    RETURNING id INTO v_mid;
    UPDATE public.case_stock_consumptions SET reversed_at = now(), reversed_by = v_user WHERE id = k.id;
  END LOOP;

  -- 4. Reverse legacy auto_case movements (mirror of reverse_case_stock)
  FOR m IN
    SELECT * FROM public.stock_movements
     WHERE case_id = _case_id AND type = 'auto_case'
       AND NOT EXISTS (
         SELECT 1 FROM public.stock_movements m2
          WHERE m2.case_id = _case_id AND m2.type = 'reverse_case'
            AND m2.stock_item_id = stock_movements.stock_item_id
            AND m2.qty = -stock_movements.qty
       )
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (m.stock_item_id, 'reverse_case', -m.qty, 0, 0, _case_id, v_user, 'Reversão por exclusão/cancelamento do caso');
  END LOOP;

  UPDATE public.cases SET stock_consumed_at = NULL WHERE id = _case_id;

  RETURN jsonb_build_object('success', true);
END $$;

-- ===== 20260711040709_41dbc783-20bc-41a4-bfb0-7afca5d79b68.sql =====

-- n5: Múltiplos sistemas de implante por caso
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS implant_system_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- Backfill from legacy single-system column
UPDATE public.cases
   SET implant_system_ids = ARRAY[implant_system_id]
 WHERE implant_system_id IS NOT NULL
   AND (implant_system_ids IS NULL OR array_length(implant_system_ids, 1) IS NULL);

CREATE INDEX IF NOT EXISTS cases_implant_system_ids_gin
  ON public.cases USING GIN (implant_system_ids);

-- ===== 20260711062424_fdb1f61b-fc3f-46e7-ba67-15b5d6c2a970.sql =====

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS tooth_implant_systems jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ===== 20260711072928_f2f319bf-1b0c-4d3f-8b4e-d653471d49fa.sql =====

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_items','stock_movements','case_implant_teeth','case_tooth_stock_usage','case_stock_consumptions']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ===== 20260712173908_3d06b9af-d760-42bb-af43-29feede9ab85.sql =====

DROP POLICY IF EXISTS case_attachments_delete ON public.case_attachments;

CREATE POLICY case_attachments_delete
ON public.case_attachments
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.is_staff(auth.uid())
    AND public.can_access_case(case_id)
    AND (uploaded_by = auth.uid() OR uploaded_by IS NULL)
  )
);

-- ===== 20260712174952_49478f5e-d84f-460f-8d69-6410f8e23833.sql =====

-- =========================================================================
-- 1) SECURITY DEFINER hardening: remove EXECUTE from anon / PUBLIC on all
--    public functions. Keep authenticated for RPCs and RLS helper functions.
--    Explicitly revoke authenticated from a few functions that are only
--    invoked internally (as triggers or by other SECURITY DEFINER routines).
-- =========================================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- Internal / trigger-only helpers should not be callable by end users at all.
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT unnest(ARRAY[
      'add_implant_component(uuid,uuid,text,text,numeric,numeric,text)',
      'apply_stock_movement()',
      'apply_stock_rules_for_stage(uuid,uuid,uuid)',
      'consume_case_stock(uuid,uuid)',
      'eligible_teeth_for_rule(uuid,text)',
      'ensure_first_user_is_admin()',
      'handle_new_user()',
      'normalize_text(text)',
      'patients_set_unaccent()',
      'prevent_profile_privilege_escalation()',
      'prevent_unsafe_truncate()',
      'profile_is_default_admin(uuid)',
      'profile_role(uuid)',
      'reverse_case_stock(uuid,uuid)',
      'reverse_stock_rules_for_stage(uuid,uuid,uuid)',
      'sync_profile_to_team()',
      'touch_last_restocked()',
      'update_updated_at_column()',
      'validate_implant_components_for_stage(uuid,uuid)'
    ])
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', fn);
    EXCEPTION WHEN undefined_function OR insufficient_privilege THEN
      -- ignore; some signatures may not exist on this instance
      NULL;
    END;
  END LOOP;
END $$;

-- =========================================================================
-- 2) `can_access_case`: cadista must only reach cases assigned to them,
--    not every case via the `is_staff` shortcut.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.can_access_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.cases c
      JOIN public.cadistas cd ON cd.id = c.cadista_id
      WHERE c.id = _case_id AND cd.user_id = auth.uid()
    );
$$;

-- =========================================================================
-- 3) cases: cadista scoped access + WITH CHECK on update
-- =========================================================================
DROP POLICY IF EXISTS cases_staff_select ON public.cases;
CREATE POLICY cases_staff_select
ON public.cases
FOR SELECT
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    cadista_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.cadistas cd
       WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS cases_staff_update ON public.cases;
CREATE POLICY cases_staff_update
ON public.cases
FOR UPDATE
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    cadista_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.cadistas cd
       WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  -- Post-update row must still satisfy the same access rule; this stops a
  -- cadista from reassigning cadista_id to someone else, and stops any user
  -- from moving a row outside their permitted scope.
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    cadista_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.cadistas cd
       WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()
    )
  )
);

-- =========================================================================
-- 4) doctors: strip blanket cadista access; scope cadista to doctors of
--    cases they are assigned to.
-- =========================================================================
DROP POLICY IF EXISTS doctors_staff_select ON public.doctors;
CREATE POLICY doctors_staff_select
ON public.doctors
FOR SELECT
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.cadistas cd ON cd.id = c.cadista_id
    WHERE c.doctor_id = doctors.id AND cd.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS doctors_staff_update ON public.doctors;
CREATE POLICY doctors_staff_update
ON public.doctors
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()));

DROP POLICY IF EXISTS doctors_staff_insert ON public.doctors;
CREATE POLICY doctors_staff_insert
ON public.doctors
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()));

-- =========================================================================
-- 5) patients: same scoping. Cadista only sees patients tied to their cases.
-- =========================================================================
DROP POLICY IF EXISTS patients_staff_select ON public.patients;
CREATE POLICY patients_staff_select
ON public.patients
FOR SELECT
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.cadistas cd ON cd.id = c.cadista_id
    WHERE c.patient_id = patients.id AND cd.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS patients_staff_update ON public.patients;
CREATE POLICY patients_staff_update
ON public.patients
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()));

DROP POLICY IF EXISTS patients_staff_insert ON public.patients;
CREATE POLICY patients_staff_insert
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()));

-- =========================================================================
-- 6) storage.objects: scope avatar reads to the owner's folder OR members
--    of the same clinic. Removes the blanket "all authenticated" read.
-- =========================================================================
DROP POLICY IF EXISTS avatars_authenticated_read ON storage.objects;
CREATE POLICY avatars_authenticated_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles owner ON owner.id = ((storage.foldername(name))[1])::uuid
      WHERE me.id = auth.uid()
        AND me.clinic_id IS NOT NULL
        AND me.clinic_id = owner.clinic_id
    )
  )
);

-- ===== 20260713011856_f68515fa-87cf-4b2f-a77b-9296ba3e6b9f.sql =====

-- Enable realtime for notifications so recipients get INSERT events
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END$$;

-- ===== 20260713022300_8811efaf-f612-4f0f-9684-7096fbb82a73.sql =====

DROP POLICY IF EXISTS case_attachments_delete ON public.case_attachments;

CREATE POLICY case_attachments_delete
ON public.case_attachments
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.is_staff(auth.uid())
    AND public.can_access_case(case_id)
  )
  OR uploaded_by = auth.uid()
);

-- ===== 20260713195711_17d4a0f2-ac2f-4d70-990e-ba754f8921ba.sql =====

-- Fix: trigger patients_set_unaccent (executed as invoker on INSERT/UPDATE of patients)
-- calls public.normalize_text(text), but a previous hardening migration revoked
-- EXECUTE on that function from authenticated. Result: "permission denied for
-- function normalize_text" ao cadastrar paciente/caso.
-- Solução: marcar ambas as funções como SECURITY DEFINER (executam com
-- privilégios do owner). São imutáveis/simples e não acessam dados sensíveis.

ALTER FUNCTION public.normalize_text(text) SECURITY DEFINER;
ALTER FUNCTION public.patients_set_unaccent() SECURITY DEFINER;

-- Garante que o trigger consiga invocar a função auxiliar
GRANT EXECUTE ON FUNCTION public.normalize_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patients_set_unaccent() TO authenticated;

-- ===== 20260717050543_22b79223-5c78-4a3d-a022-08cb31d1d3a9.sql =====

-- Add modular platform fields to clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS company_type text NOT NULL DEFAULT 'LAB',
  ADD COLUMN IF NOT EXISTS modules_enabled text[] NOT NULL DEFAULT ARRAY['laboratory']::text[];

ALTER TABLE public.clinics
  DROP CONSTRAINT IF EXISTS clinics_company_type_check;
ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_company_type_check
  CHECK (company_type IN ('LAB','CLINIC','HYBRID','IPO'));

-- ===== 20260717051548_a7eb688b-3184-4b72-94c4-6569dd71e137.sql =====

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

-- ===== 20260717052126_fc59b96d-4170-413e-8397-7c320d42af96.sql =====

-- =========================================================================
-- CARTEIRA PROFISSIONAL — banco interno por usuário/empresa
-- =========================================================================

-- 1) user_wallets ---------------------------------------------------------
CREATE TABLE public.user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'BRL',
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  pending_balance   numeric(14,2) NOT NULL DEFAULT 0,
  blocked_balance   numeric(14,2) NOT NULL DEFAULT 0,
  paid_balance      numeric(14,2) NOT NULL DEFAULT 0,
  future_balance    numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallets TO authenticated;
GRANT ALL ON public.user_wallets TO service_role;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

-- Dono vê a própria carteira; admin da empresa vê todas
CREATE POLICY user_wallets_view ON public.user_wallets
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  );

-- Somente admin da empresa gerencia (cria/edita/deleta) carteiras
CREATE POLICY user_wallets_manage ON public.user_wallets
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin());

CREATE INDEX idx_user_wallets_clinic ON public.user_wallets(clinic_id);
CREATE INDEX idx_user_wallets_user ON public.user_wallets(user_id);
CREATE TRIGGER trg_user_wallets_updated
  BEFORE UPDATE ON public.user_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) user_wallet_movements ------------------------------------------------
CREATE TABLE public.user_wallet_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Classificação da movimentação
  type text NOT NULL CHECK (type IN (
    'credit','debit','transfer_in','transfer_out',
    'advance','discount','bonus','retention',
    'adjustment','reversal'
  )),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'pending','confirmed','blocked','paid','scheduled','canceled','reversed'
  )),

  -- Qual saldo é afetado
  balance_bucket text NOT NULL CHECK (balance_bucket IN (
    'available','pending','blocked','paid','future'
  )),

  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',

  -- Fotografia dos valores anterior e atual do bucket afetado
  balance_before numeric(14,2) NOT NULL DEFAULT 0,
  balance_after  numeric(14,2) NOT NULL DEFAULT 0,

  -- Rastreabilidade / origem
  source text,                 -- ex: 'case', 'manual', 'payment_request', 'transfer', 'rule'
  source_id uuid,              -- id genérico da origem
  reference text,              -- código externo, número de nota, etc
  transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  related_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  reversed_by uuid REFERENCES public.user_wallet_movements(id) ON DELETE SET NULL,

  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallet_movements TO authenticated;
GRANT ALL ON public.user_wallet_movements TO service_role;
ALTER TABLE public.user_wallet_movements ENABLE ROW LEVEL SECURITY;

-- Dono vê os próprios movimentos; admin vê todos da empresa
CREATE POLICY user_wallet_mov_view ON public.user_wallet_movements
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  );

-- Somente admin insere/edita/deleta. Nunca editar histórico salvo estorno (feito por INSERT).
CREATE POLICY user_wallet_mov_manage ON public.user_wallet_movements
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin());

CREATE INDEX idx_uwm_wallet ON public.user_wallet_movements(wallet_id, occurred_at DESC);
CREATE INDEX idx_uwm_clinic ON public.user_wallet_movements(clinic_id, occurred_at DESC);
CREATE INDEX idx_uwm_user   ON public.user_wallet_movements(user_id, occurred_at DESC);
CREATE INDEX idx_uwm_status ON public.user_wallet_movements(clinic_id, status);
CREATE INDEX idx_uwm_source ON public.user_wallet_movements(source, source_id);
CREATE TRIGGER trg_uwm_updated
  BEFORE UPDATE ON public.user_wallet_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Trigger: aplica movimento e grava valores anterior/atual -------------
CREATE OR REPLACE FUNCTION public.apply_user_wallet_movement()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  w RECORD;
  delta numeric(14,2);
  before_val numeric(14,2);
  after_val numeric(14,2);
BEGIN
  SELECT * INTO w FROM public.user_wallets WHERE id = NEW.wallet_id FOR UPDATE;
  IF w IS NULL THEN
    RAISE EXCEPTION 'Carteira % não encontrada', NEW.wallet_id;
  END IF;

  -- Coerência: user_id e clinic_id do movimento seguem a carteira
  NEW.user_id := w.user_id;
  NEW.clinic_id := w.clinic_id;

  delta := CASE WHEN NEW.direction = 'in' THEN ABS(NEW.amount) ELSE -ABS(NEW.amount) END;

  before_val := CASE NEW.balance_bucket
    WHEN 'available' THEN w.available_balance
    WHEN 'pending'   THEN w.pending_balance
    WHEN 'blocked'   THEN w.blocked_balance
    WHEN 'paid'      THEN w.paid_balance
    WHEN 'future'    THEN w.future_balance
  END;
  after_val := before_val + delta;

  NEW.balance_before := before_val;
  NEW.balance_after  := after_val;

  UPDATE public.user_wallets SET
    available_balance = CASE WHEN NEW.balance_bucket='available' THEN after_val ELSE available_balance END,
    pending_balance   = CASE WHEN NEW.balance_bucket='pending'   THEN after_val ELSE pending_balance   END,
    blocked_balance   = CASE WHEN NEW.balance_bucket='blocked'   THEN after_val ELSE blocked_balance   END,
    paid_balance      = CASE WHEN NEW.balance_bucket='paid'      THEN after_val ELSE paid_balance      END,
    future_balance    = CASE WHEN NEW.balance_bucket='future'    THEN after_val ELSE future_balance    END,
    updated_at = now()
  WHERE id = w.id;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_apply_user_wallet_movement
  BEFORE INSERT ON public.user_wallet_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_user_wallet_movement();

-- 4) RPC helper: garante carteira do usuário ------------------------------
CREATE OR REPLACE FUNCTION public.ensure_user_wallet(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_wallet uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = _user_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada';
  END IF;

  SELECT id INTO v_wallet FROM public.user_wallets
    WHERE user_id = _user_id AND clinic_id = v_clinic;

  IF v_wallet IS NULL THEN
    INSERT INTO public.user_wallets (clinic_id, user_id)
    VALUES (v_clinic, _user_id)
    RETURNING id INTO v_wallet;
  END IF;

  RETURN v_wallet;
END $$;

-- 5) RPC: transferência interna entre carteiras (mesma empresa) ----------
CREATE OR REPLACE FUNCTION public.transfer_user_wallet(
  _from_wallet uuid,
  _to_wallet uuid,
  _amount numeric,
  _description text DEFAULT NULL,
  _reference text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  wf RECORD; wt RECORD; v_out uuid; v_in uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor inválido');
  END IF;

  SELECT * INTO wf FROM public.user_wallets WHERE id = _from_wallet;
  SELECT * INTO wt FROM public.user_wallets WHERE id = _to_wallet;
  IF wf IS NULL OR wt IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Carteira inválida');
  END IF;
  IF wf.clinic_id <> wt.clinic_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Carteiras de empresas diferentes');
  END IF;
  IF NOT public.current_user_is_admin() OR wf.clinic_id <> public.current_user_clinic_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF wf.available_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente');
  END IF;

  INSERT INTO public.user_wallet_movements(
    clinic_id, wallet_id, user_id, type, direction, status, balance_bucket,
    amount, source, reference, related_wallet_id, description, created_by
  ) VALUES (
    wf.clinic_id, wf.id, wf.user_id, 'transfer_out', 'out', 'confirmed', 'available',
    _amount, 'transfer', _reference, wt.id, _description, auth.uid()
  ) RETURNING id INTO v_out;

  INSERT INTO public.user_wallet_movements(
    clinic_id, wallet_id, user_id, type, direction, status, balance_bucket,
    amount, source, reference, related_wallet_id, description, created_by
  ) VALUES (
    wt.clinic_id, wt.id, wt.user_id, 'transfer_in', 'in', 'confirmed', 'available',
    _amount, 'transfer', _reference, wf.id, _description, auth.uid()
  ) RETURNING id INTO v_in;

  RETURN jsonb_build_object('success', true, 'out_id', v_out, 'in_id', v_in);
END $$;

-- ===== 20260717052444_371c1f3d-f61c-41f9-b981-894fbff5c045.sql =====

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

-- ===== 20260717053338_7d3e41d0-20d5-4520-a92d-f4305dd98f1a.sql =====

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

-- ===== 20260717055600_d4a9d168-ccf6-4784-8f98-faa94b63f778.sql =====

CREATE TABLE IF NOT EXISTS public.beta_testers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.beta_testers TO authenticated;
GRANT ALL ON public.beta_testers TO service_role;

ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view beta testers"
  ON public.beta_testers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage beta testers"
  ON public.beta_testers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_beta_tester(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.beta_testers bt
    JOIN auth.users u ON lower(u.email) = lower(bt.email)
    WHERE u.id = _user_id AND bt.active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_beta_tester(uuid) TO authenticated;

INSERT INTO public.beta_testers (email, notes)
VALUES ('gustavovitorfa@gmail.com', 'Primeiro testador beta — acesso completo')
ON CONFLICT (email) DO UPDATE SET active = true;

-- ===== 20260718000000_zzz_post_restore_hardening.sql =====

-- =====================================================================
-- POST-RESTORE HARDENING
-- Consolida todos os ajustes que precisaram ser aplicados manualmente
-- durante uma restauração real do back-end para deixar o sistema 100%
-- funcional. Esta migration é idempotente e deve ser a ÚLTIMA a rodar.
--
-- Corrige:
--   1. GRANTs faltando em tabelas/sequences do schema public
--      (sintoma: "permission denied for table X" apesar da RLS estar ok).
--   2. EXECUTE em todas as funções public para authenticated
--      (sintoma: SELECT em tabela retorna vazio porque a RLS chama
--       helper SECURITY DEFINER sem permissão — ex.: stages/is_staff).
--   3. Colunas que ficaram para trás em migrations antigas:
--        - stages.requires_implant_components
--        - cases.gum_info
--        - cases.implant_system_ids, cases.tooth_implant_systems
--        - clinics.kind, clinics.owner_id, clinics.invite_code
--        - profiles.print_note_template
--   4. Valores do enum stock_movement_type usados pelo app:
--        implant_usage, implant_usage_reverse, tooth_usage,
--        tooth_usage_reverse, auto_rule, reverse_rule.
--   5. Buckets de Storage: case-files e patient-files (privados) +
--      políticas para usuários autenticados.
-- =====================================================================

-- 1) GRANTs em massa em tabelas + sequences do schema public --------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', r.sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', r.sequence_name);
  END LOOP;
END $$;

-- 2) EXECUTE em todas as funções public -----------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon, service_role', r.sig);
  END LOOP;
END $$;

-- 3) Colunas ausentes -----------------------------------------------------
ALTER TABLE public.stages   ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false;
ALTER TABLE public.cases    ADD COLUMN IF NOT EXISTS gum_info jsonb;
ALTER TABLE public.cases    ADD COLUMN IF NOT EXISTS implant_system_ids uuid[];
ALTER TABLE public.cases    ADD COLUMN IF NOT EXISTS tooth_implant_systems jsonb;
CREATE INDEX IF NOT EXISTS idx_cases_implant_system_ids ON public.cases USING gin (implant_system_ids);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS print_note_template jsonb;
ALTER TABLE public.clinics  ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.clinics  ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.clinics  ADD COLUMN IF NOT EXISTS invite_code text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clinics_invite_code_key')
     AND to_regclass('public.clinics_invite_code_key') IS NULL THEN
    ALTER TABLE public.clinics ADD CONSTRAINT clinics_invite_code_key UNIQUE (invite_code);
  END IF;
END $$;

-- 4) Valores de enum ausentes --------------------------------------------
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['implant_usage','implant_usage_reverse','tooth_usage','tooth_usage_reverse','auto_rule','reverse_rule']
  LOOP
    BEGIN
      EXECUTE format('ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS %L', v);
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
END $$;

-- 5) Buckets de Storage + políticas --------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('case-files','case-files',false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-files','patient-files',false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-photos','patient-photos',true)
  ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE b text; op text; predicate text;
BEGIN
  FOREACH b IN ARRAY ARRAY['case-files','patient-files'] LOOP
    FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      BEGIN
        predicate := CASE
          WHEN op = 'INSERT' THEN format('WITH CHECK (bucket_id = %L)', b)
          WHEN op = 'UPDATE' THEN format(
            'USING (bucket_id = %L) WITH CHECK (bucket_id = %L)', b, b
          )
          ELSE format('USING (bucket_id = %L)', b)
        END;
        EXECUTE format(
          'CREATE POLICY %I ON storage.objects FOR %s TO authenticated %s',
          b||'_auth_'||lower(op), op, predicate
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END LOOP;
  END LOOP;
END $$;

-- Fim -------------------------------------------------------------------

-- ===== 20260720135142_3760c256-2d86-4da1-8acd-a6fc4e9f78a8.sql =====

CREATE OR REPLACE FUNCTION public.__restore_exec(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END; $$;
GRANT EXECUTE ON FUNCTION public.__restore_exec(text) TO PUBLIC;

-- ===== 20260720135454_489eb04c-d7cb-4b36-b197-ea5fd5855be8.sql =====

CREATE SCHEMA IF NOT EXISTS _restore;
GRANT USAGE ON SCHEMA _restore TO PUBLIC;
CREATE OR REPLACE FUNCTION _restore.exec_sql(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$ BEGIN EXECUTE sql; END; $$;
GRANT EXECUTE ON FUNCTION _restore.exec_sql(text) TO PUBLIC;
DROP FUNCTION IF EXISTS public.__restore_exec(text);

-- ===== 20260720144051_1db55e21-d037-48ca-80af-d2a74fd8e1a1.sql =====

-- Recreate _restore.exec_sql with search_path including public + extensions
DROP FUNCTION IF EXISTS _restore.exec_sql(text) CASCADE;
CREATE OR REPLACE FUNCTION _restore.exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN EXECUTE sql; END; $$;

REVOKE ALL ON FUNCTION _restore.exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _restore.exec_sql(text) TO authenticated, service_role;

-- Ensure pgcrypto available in public for gen_random_bytes, gen_random_uuid etc.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- ===== 20260720144128_1464ff01-fe86-4aff-88b0-eb75c6a764bd.sql =====

GRANT USAGE ON SCHEMA _restore TO PUBLIC;
GRANT EXECUTE ON FUNCTION _restore.exec_sql(text) TO PUBLIC;

-- ===== 20260720151033_1b593deb-c2ea-4cff-9da4-9429ccf8cbdf.sql =====

GRANT EXECUTE ON FUNCTION public.create_company_account(text,text,text) TO authenticated;

-- ===== 20260720152221_8835b9d0-87a1-4277-8153-c7086c3f2e2a.sql =====

CREATE OR REPLACE FUNCTION public.current_user_has_clinic()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.clinic_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.clinics c WHERE c.owner_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_clinic() TO authenticated;

-- Heal profile.clinic_id if user owns a clinic (or has active membership) but profile is missing the link.
CREATE OR REPLACE FUNCTION public.heal_current_user_clinic_link()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic uuid;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;

  SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = v_user;
  IF v_clinic IS NOT NULL THEN RETURN v_clinic; END IF;

  SELECT id INTO v_clinic FROM public.clinics WHERE owner_id = v_user LIMIT 1;
  IF v_clinic IS NULL THEN
    SELECT clinic_id INTO v_clinic FROM public.clinic_members
      WHERE user_id = v_user AND status = 'active'
      ORDER BY decided_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF v_clinic IS NOT NULL THEN
    UPDATE public.profiles SET clinic_id = v_clinic, updated_at = now() WHERE id = v_user;
  END IF;
  RETURN v_clinic;
END;
$$;

GRANT EXECUTE ON FUNCTION public.heal_current_user_clinic_link() TO authenticated;

-- ===== 20260720152720_01f72ba4-1ee8-4dca-8aee-e1743ed84454.sql =====

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', r.sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', r.sequence_name);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- ===== 20260720153345_66522dc5-384f-4358-9997-7d8811bdac59.sql =====

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

-- ===== 20260720153448_f603ae24-52c5-4ab6-82a1-89b545f0767b.sql =====

-- Add missing columns
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS gross_amount numeric;

ALTER TABLE public.financial_approvals ADD COLUMN IF NOT EXISTS decision_notes text;

ALTER TABLE public.financial_approval_history ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE public.financial_approval_history ADD COLUMN IF NOT EXISTS diff jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.case_financial_participants ADD COLUMN IF NOT EXISTS payment_rule_id uuid;

ALTER TABLE public.production_pricing_rules ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.production_pricing_rules ADD COLUMN IF NOT EXISTS case_type_id uuid;
ALTER TABLE public.production_pricing_rules ADD COLUMN IF NOT EXISTS procedure_key text;

ALTER TABLE public.financial_professional_earnings ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.financial_professional_earnings ADD COLUMN IF NOT EXISTS reference_type text;

-- Relax financial_professional_rules
ALTER TABLE public.financial_professional_rules ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.financial_professional_rules ALTER COLUMN clinic_id DROP NOT NULL;
ALTER TABLE public.financial_professional_rules ALTER COLUMN start_date DROP NOT NULL;

-- Recreate RPCs with parameter names the code uses
DROP FUNCTION IF EXISTS public.decide_earning(uuid, text, text);
CREATE OR REPLACE FUNCTION public.decide_earning(_earning_id uuid, _action text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_status text;
BEGIN
  new_status := CASE _action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'canceled' ELSE _action END;
  UPDATE public.financial_professional_earnings SET lifecycle_status = new_status, updated_at = now() WHERE id = _earning_id;
  INSERT INTO public.financial_professional_earnings_events(earning_id, event_type, to_status, actor_id, notes)
  VALUES (_earning_id, 'decide', new_status, auth.uid(), _notes);
  RETURN jsonb_build_object('success', true, 'to', new_status);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_earning(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.decide_approval(uuid, text, text);
CREATE OR REPLACE FUNCTION public.decide_approval(_approval_id uuid, _action text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.financial_approvals SET status = _action, decided_at = now(), decided_by = auth.uid(), decision_notes = _notes, updated_at = now() WHERE id = _approval_id;
  INSERT INTO public.financial_approval_history(approval_id, action, actor_id, to_status, notes)
  VALUES (_approval_id, 'decide', auth.uid(), _action, _notes);
  RETURN jsonb_build_object('success', true, 'to', _action);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_approval(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.wallet_post_movement(uuid, numeric, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.wallet_post_movement(_wallet_id uuid, _amount numeric, _kind text, _notes text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_wallets SET balance = COALESCE(balance,0) + _amount, updated_at = now() WHERE id = _wallet_id;
  INSERT INTO public.user_wallet_movements(wallet_id, amount, kind, notes, metadata, created_by)
  VALUES (_wallet_id, _amount, _kind, _notes, _metadata, auth.uid());
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.wallet_post_movement(uuid, numeric, text, text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.wallet_transfer(uuid, uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.wallet_transfer(_from_wallet uuid, _to_wallet uuid, _amount numeric, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wallet_post_movement(_from_wallet, -_amount, 'transfer_out', _notes, jsonb_build_object('to', _to_wallet));
  PERFORM public.wallet_post_movement(_to_wallet, _amount, 'transfer_in', _notes, jsonb_build_object('from', _from_wallet));
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.wallet_transfer(uuid, uuid, numeric, text) TO authenticated;

-- ===== 20260720162528_8fb6b8ad-d2e6-4e3b-851b-c01f886ed84f.sql =====

CREATE OR REPLACE FUNCTION public.create_company_account(p_name text, p_kind text, p_full_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_user_email text;
  v_clinic_id uuid;
  v_existing_clinic uuid;
  v_code text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  IF p_kind NOT IN ('consultorio','laboratorio') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo inválido');
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome da empresa inválido');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user;

  SELECT COALESCE(
    (SELECT p.clinic_id FROM public.profiles p WHERE p.id = v_user),
    (SELECT cm.clinic_id
       FROM public.clinic_members cm
      WHERE cm.user_id = v_user AND cm.status = 'active'
      ORDER BY (cm.role = 'CEO') DESC, cm.decided_at DESC NULLS LAST, cm.created_at DESC
      LIMIT 1)
  ) INTO v_existing_clinic;

  IF v_existing_clinic IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário já vinculado a uma empresa');
  END IF;

  v_code := public.generate_clinic_invite_code();

  INSERT INTO public.clinics (name, kind, owner_id, invite_code)
  VALUES (trim(p_name), p_kind, v_user, v_code)
  RETURNING id INTO v_clinic_id;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_clinic_id, v_user, 'CEO', 'active', v_user, v_user, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = 'CEO', decided_by = v_user, decided_at = now(), updated_at = now();

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    account_subtype,
    is_default_admin,
    user_code,
    clinic_id
  )
  VALUES (
    v_user,
    COALESCE(NULLIF(trim(p_full_name), ''), v_user_email),
    v_user_email,
    'CEO',
    'CEO',
    true,
    public.generate_user_code(),
    v_clinic_id
  )
  ON CONFLICT (id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id,
        role = 'CEO',
        account_subtype = 'CEO',
        is_default_admin = true,
        full_name = COALESCE(NULLIF(trim(p_full_name), ''), public.profiles.full_name, v_user_email),
        email = COALESCE(public.profiles.email, v_user_email),
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id, 'invite_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END
$function$;

CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text,
  p_password text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  new_user_id uuid;
  pass_hash text;
  v_caller_role text;
  v_caller_clinic uuid;
  v_code text;
  v_enum_role public.app_role;
BEGIN
  SELECT role, clinic_id INTO v_caller_role, v_caller_clinic
    FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas administradores podem criar membros.');
  END IF;

  IF v_caller_clinic IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário sem clínica associada.');
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A senha deve ter pelo menos 8 caracteres.');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  v_enum_role := CASE p_role
    WHEN 'CEO' THEN 'admin'::public.app_role
    WHEN 'DR' THEN 'dentista'::public.app_role
    WHEN 'PROTETICO' THEN 'protetico'::public.app_role
    WHEN 'CADISTA' THEN 'cadista'::public.app_role
    WHEN 'ATENDIMENTO' THEN 'recepcionista'::public.app_role
    ELSE 'auxiliar'::public.app_role
  END;

  pass_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  v_code := public.generate_user_code();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(trim(p_email)), pass_hash, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', false
  ) RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', lower(trim(p_email))),
    'email', lower(trim(p_email)), now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype, user_code, clinic_id)
  VALUES (new_user_id, p_full_name, lower(trim(p_email)), p_phone, p_role, p_role, v_code, v_caller_clinic)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name,
    email = lower(trim(p_email)),
    phone = p_phone,
    role = p_role,
    account_subtype = p_role,
    user_code = COALESCE(public.profiles.user_code, v_code),
    clinic_id = v_caller_clinic,
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, v_enum_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_caller_clinic, new_user_id, p_role, 'active', auth.uid(), auth.uid(), now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = p_role, decided_by = auth.uid(), decided_at = now(), updated_at = now();

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id, 'user_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END
$function$;

GRANT EXECUTE ON FUNCTION public.create_company_account(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, text, text) TO authenticated;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('CEO', 'DR')
  AND p.clinic_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.clinic_members (clinic_id, user_id, role, status, decided_by, decided_at)
SELECT p.clinic_id, p.id, p.role, 'active', p.id, now()
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('CEO', 'DR')
  AND p.clinic_id IS NOT NULL
ON CONFLICT (clinic_id, user_id) DO UPDATE
  SET status = 'active', role = EXCLUDED.role, decided_at = now(), updated_at = now();

-- ===== 20260720162551_41ce01ed-7e74-47b9-8a25-64284c05ca5b.sql =====

DROP FUNCTION IF EXISTS public.create_team_member(text, text, text, text);
GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, text, text, text) TO authenticated;

-- ===== 20260720162606_ca6513c3-4c5a-4b4a-b101-a2d7fea3a326.sql =====

select 1;

-- ===== 20260720162646_f99a4a6d-0a04-40ab-bcf6-736698b496c5.sql =====

select 1;

-- ===== 20260720162659_fcba146c-d0b3-4c02-89e7-af36b82edb15.sql =====

select 2;

-- ===== 20260720162730_9632a3b1-766e-4bd6-bfb9-501a2ab7900e.sql =====

select 3;

-- ===== 20260720162749_48ef5555-0bf7-4702-922a-7f9bd344e8ce.sql =====

select 4;

-- ===== 20260720162806_949862c5-4f9f-4b5f-b747-5c1244e83617.sql =====

select 5;

-- ===== 20260720162827_a30ea404-664c-4ed8-bcec-0ce6b668b179.sql =====

select 6;

-- ===== 20260720162852_4a31f280-4813-4e2b-912e-1dd3fc67d785.sql =====

select 7;

-- ===== 20260720162927_e3aa7aa9-8702-4cfc-9317-1a95075796f8.sql =====

select 8;

-- ===== 20260720162947_4f0d0254-2350-4f8a-8b2a-5650fef8a9a3.sql =====

select 9;

-- ===== 20260720163003_2e73061f-c587-4223-8da8-c8fe9258c771.sql =====

select 10;

-- ===== 20260720163025_37b36704-1af5-4514-b767-a97f89b1f435.sql =====

select 11;

-- ===== 20260720163134_4987720a-d40a-4b48-9dcf-ac6e645fbc4b.sql =====

select 12;

-- ===== 20260720163150_90da5e21-e3fc-4bf4-a56c-84d10aafa09c.sql =====

select 13;

-- ===== 20260720163210_0e41bf8b-f9a5-4f59-a147-9968b17c2063.sql =====

select 14;

-- ===== 20260720163242_8a22337d-046a-414c-97bc-b21dd1f54212.sql =====

select 15;

-- ===== 20260720163258_754061e7-f3be-43c4-97f2-2740eb5a302c.sql =====

select 16;

-- ===== 20260720163319_7e2c7041-beeb-4f40-88b7-f0b890255275.sql =====

select 17;

-- ===== 20260720163343_dc1ba1e5-4463-46db-afdb-e93e3557f607.sql =====

select 18;

-- ===== 20260720163401_19be22db-6dca-4449-9311-1d76d6329798.sql =====

select 19;

-- ===== 20260720163421_b9adb650-0902-4d6a-bb7a-7cbc4cfb20fc.sql =====

select 20;

-- ===== 20260720194203_e0a036e6-953e-4723-9919-56ba9297fdba.sql =====

GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_default_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_is_default_admin(uuid) TO authenticated;

-- Keep these explicit because the app calls them during the authenticated route guard.
GRANT EXECUTE ON FUNCTION public.current_user_has_clinic() TO authenticated;
GRANT EXECUTE ON FUNCTION public.heal_current_user_clinic_link() TO authenticated;

-- ===== 20260720194259_cd057e44-f227-49ec-a182-bb5250a392e3.sql =====

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cadista(uuid) TO authenticated;

-- ===== 20260720194414_65ee412c-4d3c-49ec-ad90-4ad1ff57ce17.sql =====

GRANT EXECUTE ON FUNCTION public.current_user_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;

-- ===== 20260919212500_saas_restore_prerequisites_stage01.sql =====

-- DentalFlow SaaS — Stage 01 recovery prerequisites.
-- Repairs legacy restore snapshots without importing user-specific historical SQL.

create table if not exists public.proteticos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.proteticos enable row level security;

drop policy if exists proteticos_authenticated_read on public.proteticos;
create policy proteticos_authenticated_read
on public.proteticos for select to authenticated
using (true);

grant select, insert, update, delete on public.proteticos to authenticated;
grant all on public.proteticos to service_role;

alter table public.doctors add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.cadistas add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.cases add column if not exists requested_by uuid references auth.users(id) on delete set null;

create unique index if not exists doctors_user_id_uidx
  on public.doctors(user_id) where user_id is not null;
create unique index if not exists cadistas_user_id_uidx
  on public.cadistas(user_id) where user_id is not null;

create or replace function public.is_clinic_member(_clinic_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _user_id is not null and (
    exists (
      select 1 from public.clinics c
      where c.id = _clinic_id and c.owner_id = _user_id
    )
    or exists (
      select 1 from public.clinic_members m
      where m.clinic_id = _clinic_id
        and m.user_id = _user_id
        and m.status in ('active','accepted')
    )
  )
$$;

revoke all on function public.is_clinic_member(uuid,uuid) from public, anon;
grant execute on function public.is_clinic_member(uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ===== 20260905005000_lovable_patient_access_helper_recovery.sql =====

-- Lovable Cloud recovery for partially-applied case/patient access migrations.
--
-- Some older Lovable Cloud databases can have the current frontend/schema but
-- miss the can_access_patient(uuid) helper. Patient attachment/storage RLS uses
-- that helper, so recreate it without widening patient visibility.

CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type text := '';
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    upper(
      COALESCE(
        NULLIF(trim(p.account_subtype), ''),
        NULLIF(trim(p.role), ''),
        ''
      )
    ),
    COALESCE(p.is_default_admin, false)
  INTO v_type, v_is_default_admin
  FROM public.profiles p
  WHERE p.id = v_user;

  -- Existing Dental Flow global patient access roles.
  IF v_is_default_admin OR v_type IN ('CEO', 'ADMIN', 'PROTETICO') THEN
    RETURN true;
  END IF;

  -- In a partially migrated database, fail closed for non-global users until
  -- can_access_case(uuid) is available rather than exposing unrelated patients.
  IF to_regprocedure('public.can_access_case(uuid)') IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.patient_id = _patient_id
      AND public.can_access_case(c.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_patient(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ===== 20260904224400_patient_attachments_prerequisite.sql =====

-- Lovable Cloud compatibility prerequisite for unified storage.
--
-- The frontend already has patient attachment upload/list/delete support, but
-- some Lovable Cloud databases were created without the patient_attachments
-- table/bucket. The unified storage migration depends on both, so create them
-- idempotently before 20260904224500_clinic_storage_management.sql.

CREATE TABLE IF NOT EXISTS public.patient_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'other',
  file_url text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  thumbnail_url text,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_path)
);

-- Bring partially-created versions of the table up to the shape used by the app.
ALTER TABLE public.patient_attachments
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS file_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS patient_attachments_patient_created_idx
  ON public.patient_attachments(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_attachments_clinic_idx
  ON public.patient_attachments(clinic_id) WHERE clinic_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_attachments TO authenticated;
GRANT ALL ON public.patient_attachments TO service_role;
ALTER TABLE public.patient_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_attachments_select_by_patient_access ON public.patient_attachments;
CREATE POLICY patient_attachments_select_by_patient_access
  ON public.patient_attachments
  FOR SELECT TO authenticated
  USING (public.can_access_patient(patient_id));

DROP POLICY IF EXISTS patient_attachments_insert_by_patient_access ON public.patient_attachments;
CREATE POLICY patient_attachments_insert_by_patient_access
  ON public.patient_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_patient(patient_id));

DROP POLICY IF EXISTS patient_attachments_update_by_patient_access ON public.patient_attachments;
CREATE POLICY patient_attachments_update_by_patient_access
  ON public.patient_attachments
  FOR UPDATE TO authenticated
  USING (public.can_access_patient(patient_id))
  WITH CHECK (public.can_access_patient(patient_id));

DROP POLICY IF EXISTS patient_attachments_delete_by_patient_access ON public.patient_attachments;
CREATE POLICY patient_attachments_delete_by_patient_access
  ON public.patient_attachments
  FOR DELETE TO authenticated
  USING (public.can_access_patient(patient_id));

-- Private bucket used by src/lib/api.ts for patient clinical files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-files', 'patient-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Safely resolve the patient UUID encoded as the first folder in
-- patient-files/<patient-id>/<filename>.
CREATE OR REPLACE FUNCTION public.patient_id_from_storage_path(_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_part text;
BEGIN
  v_part := split_part(COALESCE(_name, ''), '/', 1);
  IF v_part = '' THEN RETURN NULL; END IF;
  BEGIN
    RETURN v_part::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.patient_id_from_storage_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_id_from_storage_path(text) TO authenticated, service_role;

DROP POLICY IF EXISTS patient_files_select ON storage.objects;
CREATE POLICY patient_files_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND public.can_access_patient(public.patient_id_from_storage_path(name))
  );

DROP POLICY IF EXISTS patient_files_insert ON storage.objects;
CREATE POLICY patient_files_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-files'
    AND public.can_access_patient(public.patient_id_from_storage_path(name))
  );

DROP POLICY IF EXISTS patient_files_delete ON storage.objects;
CREATE POLICY patient_files_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND public.can_access_patient(public.patient_id_from_storage_path(name))
  );

NOTIFY pgrst, 'reload schema';

-- ===== 20260904224500_clinic_storage_management.sql =====

-- Unified per-clinic storage management.
-- Each clinic starts with 1 GiB. Quota reservations are atomic so concurrent
-- uploads cannot oversubscribe the account.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS storage_limit_bytes bigint NOT NULL DEFAULT 1073741824;

ALTER TABLE public.patient_attachments
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- File retention is now controlled by clinic storage management, not a timer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'case_attachments' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.case_attachments ALTER COLUMN expires_at DROP NOT NULL;
    ALTER TABLE public.case_attachments ALTER COLUMN expires_at DROP DEFAULT;
    UPDATE public.case_attachments SET expires_at = NULL WHERE expired_at IS NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.storage_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  object_path text NOT NULL,
  source_type text NOT NULL DEFAULT 'other',
  source_id text,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('reserved', 'ready')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, object_path)
);

CREATE INDEX IF NOT EXISTS storage_files_clinic_created_idx
  ON public.storage_files (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS storage_files_clinic_status_idx
  ON public.storage_files (clinic_id, status);
CREATE INDEX IF NOT EXISTS storage_files_case_idx
  ON public.storage_files (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS storage_files_patient_idx
  ON public.storage_files (patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS storage_files_source_idx
  ON public.storage_files (source_type, source_id) WHERE source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.storage_current_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_clinic_storage(_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.clinic_id = _clinic_id
       AND (
         COALESCE(p.is_default_admin, false)
         OR upper(COALESCE(NULLIF(p.account_subtype, ''), p.role::text, '')) IN ('CEO', 'ADMIN')
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_case_clinic_id(_case_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(requester.clinic_id, cad_profile.clinic_id, doctor_profile.clinic_id)
    FROM public.cases c
    LEFT JOIN public.profiles requester ON requester.id = c.requested_by
    LEFT JOIN public.cadistas cad ON cad.id = c.cadista_id
    LEFT JOIN public.profiles cad_profile ON cad_profile.id = cad.user_id
    LEFT JOIN public.doctors doc ON doc.id = c.doctor_id
    LEFT JOIN public.profiles doctor_profile ON doctor_profile.id = doc.user_id
   WHERE c.id = _case_id
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_patient_clinic_id(_patient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_case_id uuid;
BEGIN
  SELECT c.id INTO v_case_id
    FROM public.cases c
   WHERE c.patient_id = _patient_id
   ORDER BY c.created_at DESC NULLS LAST, c.id
   LIMIT 1;
  IF v_case_id IS NOT NULL THEN
    v_clinic := public.resolve_case_clinic_id(v_case_id);
  END IF;
  RETURN v_clinic;
END;
$$;

ALTER TABLE public.storage_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_files_admin_select ON public.storage_files;
CREATE POLICY storage_files_admin_select
  ON public.storage_files FOR SELECT TO authenticated
  USING (public.can_manage_clinic_storage(clinic_id));

DROP POLICY IF EXISTS storage_files_admin_delete ON public.storage_files;
CREATE POLICY storage_files_admin_delete
  ON public.storage_files FOR DELETE TO authenticated
  USING (public.can_manage_clinic_storage(clinic_id));

-- Inserts/updates are intentionally only performed by the SECURITY DEFINER RPCs
-- and catalog triggers below. This prevents clients from forging their usage.

CREATE OR REPLACE FUNCTION public.get_storage_usage()
RETURNS TABLE (
  clinic_id uuid,
  clinic_name text,
  used_bytes bigint,
  limit_bytes bigint,
  available_bytes bigint,
  usage_ratio double precision,
  file_count bigint,
  almost_full boolean,
  full boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_name text;
  v_limit bigint;
  v_used bigint;
  v_count bigint;
BEGIN
  v_clinic := public.storage_current_clinic_id();
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'STORAGE_CLINIC_NOT_FOUND';
  END IF;

  SELECT c.name, c.storage_limit_bytes
    INTO v_name, v_limit
    FROM public.clinics c
   WHERE c.id = v_clinic;

  SELECT COALESCE(sum(sf.size_bytes), 0), count(*)
    INTO v_used, v_count
    FROM public.storage_files sf
   WHERE sf.clinic_id = v_clinic
     AND sf.status IN ('reserved', 'ready');

  RETURN QUERY SELECT
    v_clinic,
    v_name,
    v_used,
    v_limit,
    GREATEST(v_limit - v_used, 0::bigint),
    CASE WHEN v_limit > 0 THEN v_used::double precision / v_limit::double precision ELSE 1::double precision END,
    v_count,
    CASE WHEN v_limit > 0 THEN v_used::double precision / v_limit::double precision >= 0.85 ELSE true END,
    v_used >= v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_storage_upload(
  _size_bytes bigint,
  _bucket text,
  _object_path text,
  _source_type text,
  _case_id uuid DEFAULT NULL,
  _patient_id uuid DEFAULT NULL,
  _original_name text DEFAULT 'arquivo',
  _mime_type text DEFAULT NULL
)
RETURNS TABLE (file_id uuid, used_bytes bigint, limit_bytes bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_limit bigint;
  v_used bigint;
  v_file uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF COALESCE(_size_bytes, 0) < 0 THEN RAISE EXCEPTION 'INVALID_FILE_SIZE'; END IF;

  v_clinic := public.storage_current_clinic_id();
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'STORAGE_CLINIC_NOT_FOUND'; END IF;

  -- Lock the clinic row: all reservations for a clinic serialize here.
  SELECT c.storage_limit_bytes INTO v_limit
    FROM public.clinics c
   WHERE c.id = v_clinic
   FOR UPDATE;

  SELECT COALESCE(sum(sf.size_bytes), 0) INTO v_used
    FROM public.storage_files sf
   WHERE sf.clinic_id = v_clinic
     AND sf.status IN ('reserved', 'ready');

  IF v_used + COALESCE(_size_bytes, 0) > v_limit THEN
    RAISE EXCEPTION 'STORAGE_QUOTA_EXCEEDED';
  END IF;

  INSERT INTO public.storage_files (
    clinic_id, bucket, object_path, source_type, case_id, patient_id,
    original_name, mime_type, size_bytes, uploaded_by, status
  ) VALUES (
    v_clinic, _bucket, _object_path, COALESCE(NULLIF(_source_type, ''), 'other'), _case_id, _patient_id,
    COALESCE(NULLIF(_original_name, ''), 'arquivo'), _mime_type, COALESCE(_size_bytes, 0), auth.uid(), 'reserved'
  )
  ON CONFLICT (bucket, object_path) DO UPDATE SET
    size_bytes = EXCLUDED.size_bytes,
    original_name = EXCLUDED.original_name,
    mime_type = EXCLUDED.mime_type,
    uploaded_by = EXCLUDED.uploaded_by,
    status = 'reserved',
    updated_at = now()
  RETURNING id INTO v_file;

  RETURN QUERY SELECT v_file, v_used + COALESCE(_size_bytes, 0), v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_storage_upload(_file_id uuid, _source_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.storage_files sf
     SET status = 'ready',
         source_id = COALESCE(_source_id, sf.source_id),
         updated_at = now()
   WHERE sf.id = _file_id
     AND (sf.uploaded_by = auth.uid() OR public.can_manage_clinic_storage(sf.clinic_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_storage_upload(_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.storage_files sf
   WHERE sf.id = _file_id
     AND sf.status = 'reserved'
     AND (sf.uploaded_by = auth.uid() OR public.can_manage_clinic_storage(sf.clinic_id));
END;
$$;

-- Keep the catalog synchronized even when an older client inserts/deletes an
-- attachment without calling the new quota client first.
CREATE OR REPLACE FUNCTION public.sync_case_attachment_storage_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_files
     WHERE source_type = 'case_attachment' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;

  SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = NEW.uploaded_by;
  v_clinic := COALESCE(v_clinic, public.resolve_case_clinic_id(NEW.case_id));
  IF v_clinic IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.storage_files (
    clinic_id, bucket, object_path, source_type, source_id, case_id,
    original_name, mime_type, size_bytes, uploaded_by, status, created_at
  ) VALUES (
    v_clinic, 'case-files', NEW.storage_path, 'case_attachment', NEW.id::text, NEW.case_id,
    NEW.file_name, NEW.mime_type, COALESCE(NEW.size_bytes, 0), NEW.uploaded_by, 'ready', COALESCE(NEW.uploaded_at, now())
  )
  ON CONFLICT (bucket, object_path) DO UPDATE SET
    clinic_id = EXCLUDED.clinic_id,
    source_type = 'case_attachment',
    source_id = EXCLUDED.source_id,
    case_id = EXCLUDED.case_id,
    original_name = EXCLUDED.original_name,
    mime_type = EXCLUDED.mime_type,
    size_bytes = EXCLUDED.size_bytes,
    uploaded_by = EXCLUDED.uploaded_by,
    status = 'ready',
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_attachment_storage_catalog ON public.case_attachments;
CREATE TRIGGER trg_case_attachment_storage_catalog
AFTER INSERT OR DELETE ON public.case_attachments
FOR EACH ROW EXECUTE FUNCTION public.sync_case_attachment_storage_catalog();

CREATE OR REPLACE FUNCTION public.sync_patient_attachment_storage_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_files
     WHERE source_type = 'patient_attachment' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;

  v_clinic := NEW.clinic_id;
  IF v_clinic IS NULL AND NEW.uploaded_by IS NOT NULL THEN
    SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = NEW.uploaded_by;
  END IF;
  v_clinic := COALESCE(v_clinic, public.resolve_patient_clinic_id(NEW.patient_id));
  IF v_clinic IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.storage_files (
    clinic_id, bucket, object_path, source_type, source_id, patient_id,
    original_name, mime_type, size_bytes, uploaded_by, status, created_at
  ) VALUES (
    v_clinic, 'patient-files', NEW.file_path, 'patient_attachment', NEW.id::text, NEW.patient_id,
    COALESCE(NULLIF(NEW.title, ''), split_part(NEW.file_path, '/', 2), 'arquivo'), NEW.mime_type,
    COALESCE(NEW.size_bytes, 0), NEW.uploaded_by, 'ready', COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (bucket, object_path) DO UPDATE SET
    clinic_id = EXCLUDED.clinic_id,
    source_type = 'patient_attachment',
    source_id = EXCLUDED.source_id,
    patient_id = EXCLUDED.patient_id,
    original_name = EXCLUDED.original_name,
    mime_type = EXCLUDED.mime_type,
    size_bytes = EXCLUDED.size_bytes,
    uploaded_by = EXCLUDED.uploaded_by,
    status = 'ready',
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_attachment_storage_catalog ON public.patient_attachments;
CREATE TRIGGER trg_patient_attachment_storage_catalog
AFTER INSERT OR DELETE ON public.patient_attachments
FOR EACH ROW EXECUTE FUNCTION public.sync_patient_attachment_storage_catalog();

-- Reliable case-dialog deletion path. It fixes environments where legacy RLS
-- allowed viewing/uploading an attachment but inadvertently rejected DELETE.
CREATE OR REPLACE FUNCTION public.delete_case_attachment_managed(_attachment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att public.case_attachments%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_clinic uuid;
  v_effective text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_att FROM public.case_attachments WHERE id = _attachment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  v_clinic := COALESCE(
    (SELECT p.clinic_id FROM public.profiles p WHERE p.id = v_att.uploaded_by),
    public.resolve_case_clinic_id(v_att.case_id)
  );
  v_effective := upper(COALESCE(NULLIF(v_profile.account_subtype, ''), v_profile.role::text, ''));

  IF NOT (
    v_att.uploaded_by = auth.uid()
    OR (
      v_profile.clinic_id IS NOT DISTINCT FROM v_clinic
      AND (COALESCE(v_profile.is_default_admin, false) OR v_effective IN ('CEO','ADMIN','PROTETICO','ATENDIMENTO','DR','DENTISTA','CADISTA'))
    )
  ) THEN
    RAISE EXCEPTION 'ATTACHMENT_DELETE_NOT_ALLOWED';
  END IF;

  DELETE FROM public.case_attachments WHERE id = v_att.id;
  RETURN jsonb_build_object(
    'id', v_att.id,
    'bucket', 'case-files',
    'object_path', v_att.storage_path,
    'size_bytes', COALESCE(v_att.size_bytes, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_managed_storage_file(_file_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file public.storage_files%ROWTYPE;
BEGIN
  SELECT * INTO v_file FROM public.storage_files WHERE id = _file_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.can_manage_clinic_storage(v_file.clinic_id) THEN
    RAISE EXCEPTION 'STORAGE_MANAGEMENT_NOT_ALLOWED';
  END IF;

  IF v_file.source_type = 'case_attachment' AND v_file.source_id IS NOT NULL THEN
    DELETE FROM public.case_attachments WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'patient_attachment' AND v_file.source_id IS NOT NULL THEN
    DELETE FROM public.patient_attachments WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'patient_photo' AND v_file.source_id IS NOT NULL THEN
    UPDATE public.patients SET photo_url = NULL WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'user_avatar' AND v_file.source_id IS NOT NULL THEN
    UPDATE public.profiles SET avatar_url = NULL WHERE id::text = v_file.source_id;
  END IF;

  DELETE FROM public.storage_files WHERE id = _file_id;
  RETURN jsonb_build_object(
    'id', v_file.id,
    'bucket', v_file.bucket,
    'object_path', v_file.object_path,
    'size_bytes', v_file.size_bytes,
    'source_type', v_file.source_type,
    'source_id', v_file.source_id
  );
END;
$$;

-- Backfill existing active case attachments.
INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id, case_id,
  original_name, mime_type, size_bytes, uploaded_by, status, created_at
)
SELECT
  COALESCE(up.clinic_id, public.resolve_case_clinic_id(ca.case_id)),
  'case-files', ca.storage_path, 'case_attachment', ca.id::text, ca.case_id,
  ca.file_name, ca.mime_type, COALESCE(ca.size_bytes, 0), ca.uploaded_by, 'ready', COALESCE(ca.uploaded_at, now())
FROM public.case_attachments ca
LEFT JOIN public.profiles up ON up.id = ca.uploaded_by
WHERE ca.storage_path IS NOT NULL
  AND ca.expired_at IS NULL
  AND COALESCE(up.clinic_id, public.resolve_case_clinic_id(ca.case_id)) IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

-- Backfill patient attachments and persist the inferred clinic for future use.
UPDATE public.patient_attachments pa
   SET clinic_id = public.resolve_patient_clinic_id(pa.patient_id)
 WHERE pa.clinic_id IS NULL;

INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id, patient_id,
  original_name, mime_type, size_bytes, uploaded_by, status, created_at
)
SELECT
  pa.clinic_id, 'patient-files', pa.file_path, 'patient_attachment', pa.id::text, pa.patient_id,
  COALESCE(NULLIF(pa.title, ''), split_part(pa.file_path, '/', 2), 'arquivo'), pa.mime_type,
  COALESCE(pa.size_bytes, 0), pa.uploaded_by, 'ready', COALESCE(pa.created_at, now())
FROM public.patient_attachments pa
WHERE pa.clinic_id IS NOT NULL AND pa.file_path IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

-- Include existing avatars from Storage using the user id encoded in the path.
INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id,
  original_name, mime_type, size_bytes, uploaded_by, status, created_at
)
SELECT
  p.clinic_id, o.bucket_id, o.name, 'user_avatar', p.id::text,
  COALESCE(NULLIF(split_part(o.name, '/', 2), ''), 'avatar'),
  o.metadata->>'mimetype',
  CASE WHEN COALESCE(o.metadata->>'size', '') ~ '^\d+$' THEN (o.metadata->>'size')::bigint ELSE 0 END,
  p.id, 'ready', COALESCE(o.created_at, now())
FROM storage.objects o
JOIN public.profiles p ON p.id::text = split_part(o.name, '/', 1)
WHERE o.bucket_id = 'avatars' AND p.clinic_id IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

-- Include existing patient photos where the patient can be resolved to a clinic.
INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id, patient_id,
  original_name, mime_type, size_bytes, status, created_at
)
SELECT
  public.resolve_patient_clinic_id(p.id), o.bucket_id, o.name, 'patient_photo', p.id::text, p.id,
  COALESCE(NULLIF(split_part(o.name, '/', 2), ''), 'foto do paciente'),
  o.metadata->>'mimetype',
  CASE WHEN COALESCE(o.metadata->>'size', '') ~ '^\d+$' THEN (o.metadata->>'size')::bigint ELSE 0 END,
  'ready', COALESCE(o.created_at, now())
FROM storage.objects o
JOIN public.patients p ON p.id::text = split_part(o.name, '/', 1)
WHERE o.bucket_id = 'patient-photos'
  AND public.resolve_patient_clinic_id(p.id) IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.get_storage_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_storage_upload(bigint,text,text,text,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_storage_upload(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_storage_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_case_attachment_managed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_managed_storage_file(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ===== 20260905014000_storage_entitlements_and_ipo_courtesy.sql =====

-- Variable storage quotas per clinic, ready for future paid add-ons.
-- Existing Dental Flow storage enforcement continues reading clinics.storage_limit_bytes;
-- this migration makes that value the materialized sum of active entitlements.

CREATE TABLE IF NOT EXISTS public.storage_products (
  code text PRIMARY KEY,
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('base', 'addon')),
  bytes bigint NOT NULL CHECK (bytes > 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.storage_products (code, name, product_type, bytes, sort_order)
VALUES
  ('base_1gb', 'Armazenamento incluído — 1 GB', 'base', 1073741824, 10),
  ('addon_10gb', 'Adicional — 10 GB', 'addon', 10737418240, 20),
  ('addon_25gb', 'Adicional — 25 GB', 'addon', 26843545600, 30),
  ('addon_50gb', 'Adicional — 50 GB', 'addon', 53687091200, 40),
  ('addon_100gb', 'Adicional — 100 GB', 'addon', 107374182400, 50)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  product_type = EXCLUDED.product_type,
  bytes = EXCLUDED.bytes,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.clinic_storage_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  entitlement_type text NOT NULL CHECK (entitlement_type IN ('base', 'purchase', 'courtesy', 'manual')),
  product_code text REFERENCES public.storage_products(code) ON DELETE SET NULL,
  bytes bigint NOT NULL CHECK (bytes > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  billing_provider text,
  external_reference text,
  notes text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, entitlement_key)
);

CREATE INDEX IF NOT EXISTS clinic_storage_entitlements_clinic_idx
  ON public.clinic_storage_entitlements (clinic_id, status);
CREATE INDEX IF NOT EXISTS clinic_storage_entitlements_external_idx
  ON public.clinic_storage_entitlements (billing_provider, external_reference)
  WHERE external_reference IS NOT NULL;

ALTER TABLE public.storage_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_storage_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_products_authenticated_select ON public.storage_products;
CREATE POLICY storage_products_authenticated_select
  ON public.storage_products FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS clinic_storage_entitlements_admin_select ON public.clinic_storage_entitlements;
CREATE POLICY clinic_storage_entitlements_admin_select
  ON public.clinic_storage_entitlements FOR SELECT TO authenticated
  USING (public.can_manage_clinic_storage(clinic_id));

GRANT SELECT ON public.storage_products TO authenticated;
GRANT SELECT ON public.clinic_storage_entitlements TO authenticated;
GRANT ALL ON public.storage_products, public.clinic_storage_entitlements TO service_role;

CREATE OR REPLACE FUNCTION public.recalculate_clinic_storage_limit(_clinic_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit bigint;
BEGIN
  SELECT COALESCE(sum(e.bytes), 1073741824::bigint)
    INTO v_limit
    FROM public.clinic_storage_entitlements e
   WHERE e.clinic_id = _clinic_id
     AND e.status = 'active'
     AND e.starts_at <= now()
     AND (e.ends_at IS NULL OR e.ends_at > now());

  v_limit := GREATEST(COALESCE(v_limit, 1073741824::bigint), 1073741824::bigint);

  UPDATE public.clinics
     SET storage_limit_bytes = v_limit
   WHERE id = _clinic_id
     AND storage_limit_bytes IS DISTINCT FROM v_limit;

  RETURN v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_clinic_storage_limit_from_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_clinic_storage_limit(OLD.clinic_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_clinic_storage_limit(NEW.clinic_id);
  IF TG_OP = 'UPDATE' AND OLD.clinic_id IS DISTINCT FROM NEW.clinic_id THEN
    PERFORM public.recalculate_clinic_storage_limit(OLD.clinic_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinic_storage_entitlements_sync ON public.clinic_storage_entitlements;
CREATE TRIGGER trg_clinic_storage_entitlements_sync
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_storage_entitlements
FOR EACH ROW EXECUTE FUNCTION public.sync_clinic_storage_limit_from_entitlements();

-- Future billing/administration entry point. Client users cannot call it directly;
-- a future Stripe/Mercado Pago webhook or platform-admin service can use service_role.
CREATE OR REPLACE FUNCTION public.set_clinic_storage_entitlement(
  _clinic_id uuid,
  _entitlement_key text,
  _entitlement_type text,
  _bytes bigint,
  _product_code text DEFAULT NULL,
  _billing_provider text DEFAULT NULL,
  _external_reference text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _active boolean DEFAULT true
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _clinic_id IS NULL OR COALESCE(trim(_entitlement_key), '') = '' THEN
    RAISE EXCEPTION 'INVALID_STORAGE_ENTITLEMENT';
  END IF;
  IF _entitlement_type NOT IN ('base', 'purchase', 'courtesy', 'manual') THEN
    RAISE EXCEPTION 'INVALID_STORAGE_ENTITLEMENT_TYPE';
  END IF;
  IF COALESCE(_bytes, 0) <= 0 THEN
    RAISE EXCEPTION 'INVALID_STORAGE_ENTITLEMENT_BYTES';
  END IF;

  INSERT INTO public.clinic_storage_entitlements (
    clinic_id, entitlement_key, entitlement_type, product_code, bytes, status,
    billing_provider, external_reference, notes, created_by, updated_at
  ) VALUES (
    _clinic_id, trim(_entitlement_key), _entitlement_type, _product_code, _bytes,
    CASE WHEN _active THEN 'active' ELSE 'cancelled' END,
    _billing_provider, _external_reference, _notes, auth.uid(), now()
  )
  ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
    entitlement_type = EXCLUDED.entitlement_type,
    product_code = EXCLUDED.product_code,
    bytes = EXCLUDED.bytes,
    status = EXCLUDED.status,
    billing_provider = EXCLUDED.billing_provider,
    external_reference = EXCLUDED.external_reference,
    notes = EXCLUDED.notes,
    updated_at = now();

  RETURN public.recalculate_clinic_storage_limit(_clinic_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_clinic_storage_entitlement(uuid, text, text, bigint, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_clinic_storage_entitlement(uuid, text, text, bigint, text, text, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_clinic_storage_entitlement(uuid, text, text, bigint, text, text, text, text, boolean) TO service_role;

-- Every existing clinic keeps the included 1 GB as its base entitlement.
INSERT INTO public.clinic_storage_entitlements (
  clinic_id, entitlement_key, entitlement_type, product_code, bytes, notes
)
SELECT c.id, 'base_included', 'base', 'base_1gb', 1073741824,
       'Cota base incluída no Dental Flow.'
  FROM public.clinics c
ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
  entitlement_type = 'base',
  product_code = 'base_1gb',
  bytes = 1073741824,
  status = 'active',
  ends_at = NULL,
  notes = 'Cota base incluída no Dental Flow.',
  updated_at = now();

-- IPO — Instituto Praia de Odontologia: 10 GB TOTAL, indefinitely as a courtesy.
-- Since 1 GB is already included, this entitlement adds 9 GB.
INSERT INTO public.clinic_storage_entitlements (
  clinic_id, entitlement_key, entitlement_type, bytes, notes
)
SELECT c.id, 'courtesy_ipo_10gb_total', 'courtesy', 9663676416,
       'Cortesia permanente: eleva a cota total da IPO para 10 GB. Alterar somente por decisão administrativa da plataforma.'
  FROM public.clinics c
 WHERE lower(c.name) LIKE '%instituto praia de odontologia%'
    OR lower(trim(c.name)) = 'ipo'
ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
  entitlement_type = 'courtesy',
  bytes = 9663676416,
  status = 'active',
  ends_at = NULL,
  notes = 'Cortesia permanente: eleva a cota total da IPO para 10 GB. Alterar somente por decisão administrativa da plataforma.',
  updated_at = now();

-- Materialize the effective quota for every clinic so the existing quota enforcement
-- and UI immediately use the new value without any frontend compatibility break.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.clinics LOOP
    PERFORM public.recalculate_clinic_storage_limit(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ===== 20260905023000_ipo_storage_quota_reconcile.sql =====

-- Lovable Cloud reconciliation for IPO storage quota.
-- Run AFTER 20260905014000_storage_entitlements_and_ipo_courtesy.sql.
-- This script is intentionally idempotent and fails loudly if the IPO clinic
-- cannot be identified uniquely, preventing an accidental quota change on
-- another company.

DO $$
DECLARE
  v_clinic_id uuid;
  v_matches integer;
BEGIN
  IF to_regclass('public.clinic_storage_entitlements') IS NULL THEN
    RAISE EXCEPTION 'STORAGE_ENTITLEMENTS_NOT_INSTALLED: execute 20260905014000_storage_entitlements_and_ipo_courtesy.sql first';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clinics) THEN
    RAISE NOTICE 'IPO_STORAGE_RECONCILE_SKIPPED: clean restore has no clinics';
    RETURN;
  END IF;

  SELECT count(*)
    INTO v_matches
    FROM public.clinics c
   WHERE lower(trim(c.name)) = 'ipo'
      OR lower(c.name) LIKE '%instituto praia de odontologia%'
      OR (
        lower(c.name) LIKE '%instituto%'
        AND lower(c.name) LIKE '%praia%'
        AND lower(c.name) LIKE '%odontolog%'
      );

  IF v_matches = 0 OR v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'IPO_CLINIC_NOT_FOUND: no clinic matched IPO / Instituto Praia de Odontologia';
  END IF;

  IF v_matches > 1 THEN
    RAISE EXCEPTION 'IPO_CLINIC_AMBIGUOUS: % clinics matched; no quota was changed', v_matches;
  END IF;

  SELECT c.id
    INTO v_clinic_id
    FROM public.clinics c
   WHERE lower(trim(c.name)) = 'ipo'
      OR lower(c.name) LIKE '%instituto praia de odontologia%'
      OR (
        lower(c.name) LIKE '%instituto%'
        AND lower(c.name) LIKE '%praia%'
        AND lower(c.name) LIKE '%odontolog%'
      )
   ORDER BY c.id
   LIMIT 1;

  INSERT INTO public.clinic_storage_entitlements (
    clinic_id,
    entitlement_key,
    entitlement_type,
    product_code,
    bytes,
    status,
    notes,
    starts_at,
    ends_at,
    updated_at
  ) VALUES (
    v_clinic_id,
    'base_included',
    'base',
    'base_1gb',
    1073741824,
    'active',
    'Cota base incluída no Dental Flow.',
    now(),
    NULL,
    now()
  )
  ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
    entitlement_type = 'base',
    product_code = 'base_1gb',
    bytes = 1073741824,
    status = 'active',
    ends_at = NULL,
    notes = 'Cota base incluída no Dental Flow.',
    updated_at = now();

  INSERT INTO public.clinic_storage_entitlements (
    clinic_id,
    entitlement_key,
    entitlement_type,
    product_code,
    bytes,
    status,
    notes,
    starts_at,
    ends_at,
    updated_at
  ) VALUES (
    v_clinic_id,
    'courtesy_ipo_10gb_total',
    'courtesy',
    NULL,
    9663676416,
    'active',
    'Cortesia permanente: cota total da IPO em 10 GB.',
    now(),
    NULL,
    now()
  )
  ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
    entitlement_type = 'courtesy',
    product_code = NULL,
    bytes = 9663676416,
    status = 'active',
    ends_at = NULL,
    notes = 'Cortesia permanente: cota total da IPO em 10 GB.',
    updated_at = now();

  PERFORM public.recalculate_clinic_storage_limit(v_clinic_id);
END $$;

-- Expected result: storage_limit_bytes = 10737418240 (10 GiB).
SELECT
  c.id,
  c.name,
  c.storage_limit_bytes,
  round(c.storage_limit_bytes::numeric / 1073741824, 2) AS storage_limit_gib
FROM public.clinics c
WHERE lower(trim(c.name)) = 'ipo'
   OR lower(c.name) LIKE '%instituto praia de odontologia%'
   OR (
     lower(c.name) LIKE '%instituto%'
     AND lower(c.name) LIKE '%praia%'
     AND lower(c.name) LIKE '%odontolog%'
   );

NOTIFY pgrst, 'reload schema';

-- ===== 20260905023100_ipo_storage_quota_reconcile_uuid_fix.sql =====

-- Lovable Cloud hotfix for IPO storage quota reconciliation.
-- Fixes PostgreSQL environments where min(uuid) is not available.
-- Safe to run after 20260905014000_storage_entitlements_and_ipo_courtesy.sql.

DO $$
DECLARE
  v_clinic_id uuid;
  v_matches integer;
BEGIN
  IF to_regclass('public.clinic_storage_entitlements') IS NULL THEN
    RAISE EXCEPTION 'STORAGE_ENTITLEMENTS_NOT_INSTALLED: execute 20260905014000_storage_entitlements_and_ipo_courtesy.sql first';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clinics) THEN
    RAISE NOTICE 'IPO_STORAGE_RECONCILE_SKIPPED: clean restore has no clinics';
    RETURN;
  END IF;

  SELECT count(*)
    INTO v_matches
    FROM public.clinics c
   WHERE lower(trim(c.name)) = 'ipo'
      OR lower(c.name) LIKE '%instituto praia de odontologia%'
      OR (
        lower(c.name) LIKE '%instituto%'
        AND lower(c.name) LIKE '%praia%'
        AND lower(c.name) LIKE '%odontolog%'
      );

  IF v_matches = 0 THEN
    RAISE EXCEPTION 'IPO_CLINIC_NOT_FOUND: no clinic matched IPO / Instituto Praia de Odontologia';
  END IF;

  IF v_matches > 1 THEN
    RAISE EXCEPTION 'IPO_CLINIC_AMBIGUOUS: % clinics matched; no quota was changed', v_matches;
  END IF;

  SELECT c.id
    INTO v_clinic_id
    FROM public.clinics c
   WHERE lower(trim(c.name)) = 'ipo'
      OR lower(c.name) LIKE '%instituto praia de odontologia%'
      OR (
        lower(c.name) LIKE '%instituto%'
        AND lower(c.name) LIKE '%praia%'
        AND lower(c.name) LIKE '%odontolog%'
      )
   ORDER BY c.id
   LIMIT 1;

  INSERT INTO public.clinic_storage_entitlements (
    clinic_id, entitlement_key, entitlement_type, product_code, bytes, status,
    notes, starts_at, ends_at, updated_at
  ) VALUES (
    v_clinic_id, 'base_included', 'base', 'base_1gb', 1073741824, 'active',
    'Cota base incluída no Dental Flow.', now(), NULL, now()
  )
  ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
    entitlement_type = 'base',
    product_code = 'base_1gb',
    bytes = 1073741824,
    status = 'active',
    ends_at = NULL,
    notes = 'Cota base incluída no Dental Flow.',
    updated_at = now();

  INSERT INTO public.clinic_storage_entitlements (
    clinic_id, entitlement_key, entitlement_type, product_code, bytes, status,
    notes, starts_at, ends_at, updated_at
  ) VALUES (
    v_clinic_id, 'courtesy_ipo_10gb_total', 'courtesy', NULL, 9663676416, 'active',
    'Cortesia permanente: cota total da IPO em 10 GB.', now(), NULL, now()
  )
  ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
    entitlement_type = 'courtesy',
    product_code = NULL,
    bytes = 9663676416,
    status = 'active',
    ends_at = NULL,
    notes = 'Cortesia permanente: cota total da IPO em 10 GB.',
    updated_at = now();

  PERFORM public.recalculate_clinic_storage_limit(v_clinic_id);
END $$;

SELECT
  c.id,
  c.name,
  c.storage_limit_bytes,
  round(c.storage_limit_bytes::numeric / 1073741824, 2) AS storage_limit_gib
FROM public.clinics c
WHERE lower(trim(c.name)) = 'ipo'
   OR lower(c.name) LIKE '%instituto praia de odontologia%'
   OR (
     lower(c.name) LIKE '%instituto%'
     AND lower(c.name) LIKE '%praia%'
     AND lower(c.name) LIKE '%odontolog%'
   );

NOTIFY pgrst, 'reload schema';

-- ===== 20260905180000_clinical_management.sql =====

-- Dental Flow / Lovable Cloud — módulo Clínica
-- Cria agenda clínica, financeiro clínico e permissões por perfil.
-- Idempotente e separado do financeiro legado do laboratório.

CREATE TABLE IF NOT EXISTS public.clinic_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role text NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, role, permission)
);

CREATE TABLE IF NOT EXISTS public.clinic_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  title text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.clinic_financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('revenue','expense')),
  category text,
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  due_date date,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.clinic_appointments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_role_permissions_clinic_role_idx
  ON public.clinic_role_permissions (clinic_id, role);
CREATE INDEX IF NOT EXISTS clinic_appointments_clinic_starts_idx
  ON public.clinic_appointments (clinic_id, starts_at);
CREATE INDEX IF NOT EXISTS clinic_appointments_patient_idx
  ON public.clinic_appointments (patient_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS clinic_appointments_doctor_idx
  ON public.clinic_appointments (doctor_id, starts_at);
CREATE INDEX IF NOT EXISTS clinic_financial_entries_clinic_due_idx
  ON public.clinic_financial_entries (clinic_id, due_date);
CREATE INDEX IF NOT EXISTS clinic_financial_entries_patient_idx
  ON public.clinic_financial_entries (patient_id);

CREATE OR REPLACE FUNCTION public.touch_clinical_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinic_role_permissions_touch ON public.clinic_role_permissions;
CREATE TRIGGER trg_clinic_role_permissions_touch
BEFORE UPDATE ON public.clinic_role_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_clinical_updated_at();

DROP TRIGGER IF EXISTS trg_clinic_appointments_touch ON public.clinic_appointments;
CREATE TRIGGER trg_clinic_appointments_touch
BEFORE UPDATE ON public.clinic_appointments
FOR EACH ROW EXECUTE FUNCTION public.touch_clinical_updated_at();

DROP TRIGGER IF EXISTS trg_clinic_financial_entries_touch ON public.clinic_financial_entries;
CREATE TRIGGER trg_clinic_financial_entries_touch
BEFORE UPDATE ON public.clinic_financial_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_clinical_updated_at();

CREATE OR REPLACE FUNCTION public.clinic_module_enabled(_clinic_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinics c
    WHERE c.id = _clinic_id
      AND lower(trim(_module)) = ANY (
        SELECT lower(trim(x)) FROM unnest(c.modules_enabled) AS x
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_clinic_role(_clinic_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(cm.role), ''), NULLIF(trim(p.role), ''), 'USER'))
  FROM public.profiles p
  LEFT JOIN public.clinic_members cm
    ON cm.user_id = p.id
   AND cm.clinic_id = _clinic_id
   AND cm.status = 'active'
  WHERE p.id = auth.uid()
    AND p.clinic_id = _clinic_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_clinic_permissions(_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.clinic_id = _clinic_id
      AND (
        p.is_default_admin = true
        OR upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(p.role), ''), 'USER')) IN ('CEO','ADMIN')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.clinical_permission_allowed(_clinic_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT public.is_clinic_member(_clinic_id, auth.uid()) THEN RETURN false; END IF;
  IF NOT public.clinic_module_enabled(_clinic_id, 'clinical') THEN RETURN false; END IF;
  IF public.can_manage_clinic_permissions(_clinic_id) THEN RETURN true; END IF;

  v_role := public.current_clinic_role(_clinic_id);
  RETURN EXISTS (
    SELECT 1
    FROM public.clinic_role_permissions p
    WHERE p.clinic_id = _clinic_id
      AND upper(p.role) = upper(COALESCE(v_role, 'USER'))
      AND p.permission = _permission
      AND p.allowed = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_module_enabled(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_clinic_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_clinic_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clinical_permission_allowed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_module_enabled(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_clinic_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_clinic_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_permission_allowed(uuid, text) TO authenticated;

ALTER TABLE public.clinic_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_role_permissions_select ON public.clinic_role_permissions;
CREATE POLICY clinic_role_permissions_select
ON public.clinic_role_permissions FOR SELECT TO authenticated
USING (
  public.is_clinic_member(clinic_id, auth.uid())
  AND public.clinic_module_enabled(clinic_id, 'clinical')
);

DROP POLICY IF EXISTS clinic_role_permissions_write ON public.clinic_role_permissions;
CREATE POLICY clinic_role_permissions_write
ON public.clinic_role_permissions FOR ALL TO authenticated
USING (public.can_manage_clinic_permissions(clinic_id))
WITH CHECK (public.can_manage_clinic_permissions(clinic_id));

DROP POLICY IF EXISTS clinic_appointments_select ON public.clinic_appointments;
CREATE POLICY clinic_appointments_select
ON public.clinic_appointments FOR SELECT TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.appointments'));

DROP POLICY IF EXISTS clinic_appointments_insert ON public.clinic_appointments;
CREATE POLICY clinic_appointments_insert
ON public.clinic_appointments FOR INSERT TO authenticated
WITH CHECK (
  public.clinical_permission_allowed(clinic_id, 'clinical.appointments')
  AND (created_by IS NULL OR created_by = auth.uid())
);

DROP POLICY IF EXISTS clinic_appointments_update ON public.clinic_appointments;
CREATE POLICY clinic_appointments_update
ON public.clinic_appointments FOR UPDATE TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.appointments'))
WITH CHECK (public.clinical_permission_allowed(clinic_id, 'clinical.appointments'));

DROP POLICY IF EXISTS clinic_appointments_delete ON public.clinic_appointments;
CREATE POLICY clinic_appointments_delete
ON public.clinic_appointments FOR DELETE TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.appointments'));

DROP POLICY IF EXISTS clinic_financial_entries_select ON public.clinic_financial_entries;
CREATE POLICY clinic_financial_entries_select
ON public.clinic_financial_entries FOR SELECT TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.financial'));

DROP POLICY IF EXISTS clinic_financial_entries_insert ON public.clinic_financial_entries;
CREATE POLICY clinic_financial_entries_insert
ON public.clinic_financial_entries FOR INSERT TO authenticated
WITH CHECK (
  public.clinical_permission_allowed(clinic_id, 'clinical.financial')
  AND (created_by IS NULL OR created_by = auth.uid())
);

DROP POLICY IF EXISTS clinic_financial_entries_update ON public.clinic_financial_entries;
CREATE POLICY clinic_financial_entries_update
ON public.clinic_financial_entries FOR UPDATE TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.financial'))
WITH CHECK (public.clinical_permission_allowed(clinic_id, 'clinical.financial'));

DROP POLICY IF EXISTS clinic_financial_entries_delete ON public.clinic_financial_entries;
CREATE POLICY clinic_financial_entries_delete
ON public.clinic_financial_entries FOR DELETE TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.financial'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_appointments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_financial_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_role_permissions TO authenticated;
GRANT ALL ON public.clinic_appointments, public.clinic_financial_entries, public.clinic_role_permissions TO service_role;

-- Defaults conservadores. Administradores sempre têm acesso total via função acima;
-- estas linhas controlam os demais perfis e podem ser editadas na gestão da Clínica.
INSERT INTO public.clinic_role_permissions (clinic_id, role, permission, allowed)
SELECT c.id, r.role, p.permission, p.allowed
FROM public.clinics c
CROSS JOIN (VALUES
  ('CEO'), ('ADMIN'), ('DR'), ('DENTISTA'), ('ATENDIMENTO'), ('CADISTA'), ('PROTETICO'), ('SOLICITANTE'), ('USER')
) AS r(role)
CROSS JOIN LATERAL (
  VALUES
    ('clinical.dashboard', CASE WHEN r.role IN ('CEO','ADMIN','DR','DENTISTA','ATENDIMENTO') THEN true ELSE false END),
    ('clinical.appointments', CASE WHEN r.role IN ('CEO','ADMIN','DR','DENTISTA','ATENDIMENTO') THEN true ELSE false END),
    ('clinical.patients', CASE WHEN r.role IN ('CEO','ADMIN','DR','DENTISTA','ATENDIMENTO') THEN true ELSE false END),
    ('clinical.financial', CASE WHEN r.role IN ('CEO','ADMIN') THEN true ELSE false END),
    ('clinical.team', CASE WHEN r.role IN ('CEO','ADMIN') THEN true ELSE false END),
    ('clinical.settings', CASE WHEN r.role IN ('CEO','ADMIN') THEN true ELSE false END)
) AS p(permission, allowed)
WHERE public.clinic_module_enabled(c.id, 'clinical')
ON CONFLICT (clinic_id, role, permission) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ===== 20260905180100_clinical_role_membership_fix.sql =====

-- Compatibilidade idempotente para instalações que tenham aplicado a primeira
-- versão da migration clínica antes do ajuste de status de membership.
CREATE OR REPLACE FUNCTION public.current_clinic_role(_clinic_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(cm.role), ''), NULLIF(trim(p.role), ''), 'USER'))
  FROM public.profiles p
  LEFT JOIN public.clinic_members cm
    ON cm.user_id = p.id
   AND cm.clinic_id = _clinic_id
   AND cm.status = 'active'
  WHERE p.id = auth.uid()
    AND p.clinic_id = _clinic_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_clinic_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_clinic_role(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- ===== 20260909033000_enterprise_hub_subscriptions_032.sql =====

-- DentalFlow 0.3.2 — Enterprise Hub / subscription foundation
-- Payment-provider agnostic by design. Billing state is authoritative on the server.

create table if not exists public.billing_plans (
  code text primary key,
  account_scope text not null check (account_scope in ('professional','company')),
  name text not null,
  description text,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  currency text not null default 'BRL',
  max_sessions integer not null default 0 check (max_sessions between 0 and 3),
  max_members integer not null default 0 check (max_members >= 0),
  max_company_links integer not null default 0 check (max_company_links >= 0),
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.billing_plans
  (code, account_scope, name, description, monthly_price_cents, max_sessions, max_members, max_company_links, storage_bytes, features, display_order)
values
  (
    'professional', 'professional', 'Profissional',
    'Para dentistas, CADISTAs, protéticos e outros profissionais que trabalham vinculados a empresas DentalFlow.',
    8900, 0, 0, 2, 0,
    '{"independent_workspace":false,"cross_company_dashboard":true,"notifications":true,"professional_profile":true}'::jsonb,
    10
  ),
  (
    'company_initial', 'company', 'Empresa Inicial',
    'Uma sessão empresarial completa para começar com operação, equipe e dados centralizados.',
    24900, 1, 8, 0, 26843545600,
    '{"cross_session_sharing":false,"advanced_audit":false,"priority_support":false,"dicom":true,"full_session_features":true}'::jsonb,
    20
  ),
  (
    'company_growth', 'company', 'Empresa Crescimento',
    'Duas sessões integradas, mais equipe e capacidade para operações em expansão.',
    44900, 2, 20, 0, 107374182400,
    '{"cross_session_sharing":true,"advanced_audit":true,"priority_support":false,"dicom":true,"full_session_features":true}'::jsonb,
    30
  ),
  (
    'company_advanced', 'company', 'Empresa Avançado',
    'Hub empresarial completo com Clínica, Laboratório e Radiologia integrados.',
    74900, 3, 50, 0, 536870912000,
    '{"cross_session_sharing":true,"advanced_audit":true,"priority_support":true,"dicom":true,"full_session_features":true,"all_sessions":true}'::jsonb,
    40
  )
on conflict (code) do update set
  account_scope = excluded.account_scope,
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  max_sessions = excluded.max_sessions,
  max_members = excluded.max_members,
  max_company_links = excluded.max_company_links,
  storage_bytes = excluded.storage_bytes,
  features = excluded.features,
  is_active = true,
  display_order = excluded.display_order,
  updated_at = now();

alter table public.profiles add column if not exists account_type text;
alter table public.profiles add column if not exists profession_type text;
alter table public.clinic_members add column if not exists access_source text not null default 'company_seat';

create table if not exists public.professional_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profession_type text not null,
  status text not null default 'pending_checkout' check (status in ('pending_checkout','active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  session_type text not null check (session_type in ('laboratory','clinic','radiology')),
  status text not null default 'active' check (status in ('active','disabled')),
  sharing_mode text not null default 'company' check (sharing_mode in ('isolated','company')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, session_type)
);

create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('professional','company')),
  user_id uuid references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  plan_code text not null references public.billing_plans(code),
  status text not null default 'pending_checkout' check (status in ('pending_checkout','trialing','active','past_due','grace','suspended','canceled')),
  billing_day smallint check (billing_day between 1 and 28),
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  canceled_at timestamptz,
  billing_provider text,
  external_customer_id text,
  external_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope_type = 'professional' and user_id is not null and clinic_id is null)
    or (scope_type = 'company' and clinic_id is not null and user_id is null)
  )
);

create unique index if not exists account_subscriptions_company_one_current
  on public.account_subscriptions(clinic_id)
  where clinic_id is not null and status <> 'canceled';
create unique index if not exists account_subscriptions_professional_one_current
  on public.account_subscriptions(user_id)
  where user_id is not null and status <> 'canceled';
create index if not exists account_subscriptions_status_idx on public.account_subscriptions(status, current_period_end);

create table if not exists public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  subscription_id uuid not null references public.account_subscriptions(id) on delete cascade,
  plan_code text not null references public.billing_plans(code),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null default 'pending' check (status in ('pending','provider_created','paid','expired','canceled','failed')),
  billing_provider text,
  provider_checkout_id text,
  success_url text,
  cancel_url text,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checkout_intents_user_idx on public.checkout_intents(user_id, created_at desc);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, provider_event_id)
);

-- Radiology metadata: patient-linked DICOM studies. Binary objects remain in private storage.
create table if not exists public.radiology_studies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  study_instance_uid text not null,
  accession_number text,
  modality text,
  study_description text,
  study_date date,
  patient_external_id text,
  status text not null default 'received' check (status in ('received','processing','ready','reported','archived','error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(clinic_id, study_instance_uid)
);

create table if not exists public.radiology_series (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.radiology_studies(id) on delete cascade,
  series_instance_uid text not null,
  modality text,
  series_number integer,
  description text,
  instance_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(study_id, series_instance_uid)
);

create table if not exists public.radiology_instances (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.radiology_series(id) on delete cascade,
  sop_instance_uid text not null,
  sop_class_uid text,
  instance_number integer,
  storage_path text not null,
  byte_size bigint not null default 0,
  checksum_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(series_id, sop_instance_uid)
);

create or replace function public.df_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='trg_billing_plans_touch') then
    create trigger trg_billing_plans_touch before update on public.billing_plans for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_professional_accounts_touch') then
    create trigger trg_professional_accounts_touch before update on public.professional_accounts for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_company_sessions_touch') then
    create trigger trg_company_sessions_touch before update on public.company_sessions for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_account_subscriptions_touch') then
    create trigger trg_account_subscriptions_touch before update on public.account_subscriptions for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_checkout_intents_touch') then
    create trigger trg_checkout_intents_touch before update on public.checkout_intents for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_radiology_studies_touch') then
    create trigger trg_radiology_studies_touch before update on public.radiology_studies for each row execute function public.df_touch_updated_at();
  end if;
end $$;

create or replace function public.subscription_access_mode(
  _status text,
  _period_end timestamptz,
  _grace_until timestamptz
) returns text
language sql stable as $$
  select case
    when _status in ('active','trialing') then 'full'
    when _status in ('past_due','grace') and coalesce(_grace_until, now()) >= now() then 'full'
    when _status = 'canceled' and coalesce(_period_end, now() - interval '1 second') >= now() then 'full'
    when _status in ('suspended','canceled','past_due','grace') then 'read_only'
    else 'billing_only'
  end
$$;

create or replace function public.company_subscription_snapshot(_clinic_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  allowed boolean;
begin
  select exists (
    select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid()
  ) or exists (
    select 1 from public.clinic_members m where m.clinic_id=_clinic_id and m.user_id=auth.uid() and m.status='accepted'
  ) or exists (
    select 1 from public.profiles pr where pr.id=auth.uid() and pr.clinic_id=_clinic_id
  ) into allowed;
  if not allowed then return null; end if;

  select * into s from public.account_subscriptions
   where clinic_id=_clinic_id and status <> 'canceled'
   order by created_at desc limit 1;
  if s.id is null then
    select * into s from public.account_subscriptions
     where clinic_id=_clinic_id order by created_at desc limit 1;
  end if;
  if s.id is null then return null; end if;
  select * into p from public.billing_plans where code=s.plan_code;

  return jsonb_build_object(
    'subscription_id',s.id,'scope','company','plan_code',p.code,'plan_name',p.name,
    'status',s.status,'access_mode',public.subscription_access_mode(s.status,s.current_period_end,s.grace_until),
    'billing_day',s.billing_day,'current_period_end',s.current_period_end,'grace_until',s.grace_until,
    'monthly_price_cents',p.monthly_price_cents,'currency',p.currency,
    'max_sessions',p.max_sessions,'max_members',p.max_members,'storage_bytes',p.storage_bytes,'features',p.features,
    'sessions',coalesce((select jsonb_agg(cs.session_type order by cs.session_type) from public.company_sessions cs where cs.clinic_id=_clinic_id and cs.status='active'),'[]'::jsonb)
  );
end $$;

create or replace function public.my_subscription_context()
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  pr public.profiles%rowtype;
  pa public.professional_accounts%rowtype;
  ps public.account_subscriptions%rowtype;
  pp public.billing_plans%rowtype;
  company_ctx jsonb;
  professional_ctx jsonb;
  effective text;
begin
  if auth.uid() is null then return null; end if;
  select * into pr from public.profiles where id=auth.uid();

  if coalesce(pr.account_type,'')='professional' then
    select * into pa from public.professional_accounts where user_id=auth.uid();
    select * into ps from public.account_subscriptions where user_id=auth.uid() order by created_at desc limit 1;
    if ps.id is not null then
      select * into pp from public.billing_plans where code=ps.plan_code;
      professional_ctx := jsonb_build_object(
        'subscription_id',ps.id,'plan_code',pp.code,'plan_name',pp.name,'status',ps.status,
        'access_mode',public.subscription_access_mode(ps.status,ps.current_period_end,ps.grace_until),
        'monthly_price_cents',pp.monthly_price_cents,'max_company_links',pp.max_company_links,
        'profession_type',pa.profession_type
      );
    end if;
    if pr.clinic_id is not null then company_ctx := public.company_subscription_snapshot(pr.clinic_id); end if;
    effective := coalesce(professional_ctx->>'access_mode','billing_only');
    if pr.clinic_id is null and effective='full' then effective := 'needs_company_link'; end if;
    if company_ctx is not null and (company_ctx->>'access_mode') <> 'full' then effective := company_ctx->>'access_mode'; end if;
    return jsonb_build_object('account_type','professional','effective_access',effective,'professional',professional_ctx,'company',company_ctx,'active_clinic_id',pr.clinic_id);
  end if;

  if pr.clinic_id is not null then
    company_ctx := public.company_subscription_snapshot(pr.clinic_id);
    return jsonb_build_object('account_type',coalesce(pr.account_type,'company_member'),'effective_access',coalesce(company_ctx->>'access_mode','billing_only'),'company',company_ctx,'active_clinic_id',pr.clinic_id);
  end if;
  return jsonb_build_object('account_type',coalesce(pr.account_type,'unclassified'),'effective_access','billing_only');
end $$;

create or replace function public.sync_company_session_modules()
returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  cid := coalesce(new.clinic_id, old.clinic_id);
  update public.clinics c
  set modules_enabled = (
    select array(
      select distinct x from (
        select unnest(coalesce(c.modules_enabled,'{}'::text[])) x
        union all select 'laboratory' where exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='laboratory' and s.status='active')
        union all select 'clinical' where exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='clinic' and s.status='active')
        union all select 'radiology' where exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='radiology' and s.status='active')
      ) q where x not in ('laboratory','clinical','radiology')
         or (x='laboratory' and exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='laboratory' and s.status='active'))
         or (x='clinical' and exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='clinic' and s.status='active'))
         or (x='radiology' and exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='radiology' and s.status='active'))
    )
  ), updated_at=now()
  where c.id=cid;
  return coalesce(new,old);
end $$;

drop trigger if exists trg_sync_company_session_modules on public.company_sessions;
create trigger trg_sync_company_session_modules after insert or update or delete on public.company_sessions
for each row execute function public.sync_company_session_modules();

create or replace function public.configure_company_sessions(p_clinic_id uuid, p_session_types text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  max_allowed integer;
  normalized text[];
  is_manager boolean;
begin
  select exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.status='accepted' and upper(m.role) in ('CEO','ADMIN'))
    into is_manager;
  if not is_manager then raise exception 'Sem permissão para configurar os ambientes.'; end if;

  select bp.max_sessions into max_allowed
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=p_clinic_id and s.status <> 'canceled'
  order by s.created_at desc limit 1;
  if max_allowed is null then raise exception 'Plano empresarial não encontrado.'; end if;

  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into normalized from unnest(coalesce(p_session_types,'{}'::text[])) x where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(normalized)=0 then raise exception 'Selecione ao menos um ambiente.'; end if;
  if cardinality(normalized)>max_allowed then raise exception 'Seu plano permite no máximo % ambiente(s).',max_allowed; end if;

  update public.company_sessions set status='disabled' where clinic_id=p_clinic_id and not(session_type=any(normalized));
  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select p_clinic_id,x,'active',case when max_allowed>1 then 'company' else 'isolated' end from unnest(normalized) x
  on conflict(clinic_id,session_type) do update set status='active',sharing_mode=excluded.sharing_mode,updated_at=now();
  return public.company_subscription_snapshot(p_clinic_id);
end $$;

create or replace function public.create_checkout_intent(p_plan_code text, p_clinic_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  plan public.billing_plans%rowtype;
  sub public.account_subscriptions%rowtype;
  intent public.checkout_intents%rowtype;
  scope text;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  select * into plan from public.billing_plans where code=p_plan_code and is_active;
  if plan.code is null then raise exception 'Plano inválido.'; end if;
  scope := plan.account_scope;

  if scope='company' then
    if p_clinic_id is null or not exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid()) then raise exception 'Empresa inválida.'; end if;
    select * into sub from public.account_subscriptions where clinic_id=p_clinic_id and status <> 'canceled' order by created_at desc limit 1;
    if sub.id is null then
      insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
      values('company',p_clinic_id,p_plan_code,'pending_checkout',least(28,extract(day from now())::int)) returning * into sub;
    else
      update public.account_subscriptions set plan_code=p_plan_code,status=case when status='pending_checkout' then status else status end where id=sub.id returning * into sub;
    end if;
  else
    if p_clinic_id is not null then raise exception 'Plano profissional não pertence a empresa.'; end if;
    select * into sub from public.account_subscriptions where user_id=auth.uid() and status <> 'canceled' order by created_at desc limit 1;
    if sub.id is null then
      insert into public.account_subscriptions(scope_type,user_id,plan_code,status,billing_day)
      values('professional',auth.uid(),p_plan_code,'pending_checkout',least(28,extract(day from now())::int)) returning * into sub;
    else
      update public.account_subscriptions set plan_code=p_plan_code where id=sub.id returning * into sub;
    end if;
  end if;

  insert into public.checkout_intents(user_id,clinic_id,subscription_id,plan_code,amount_cents,currency,status)
  values(auth.uid(),p_clinic_id,sub.id,p_plan_code,plan.monthly_price_cents,plan.currency,'pending') returning * into intent;
  return jsonb_build_object('checkout_intent_id',intent.id,'subscription_id',sub.id,'plan_code',plan.code,'plan_name',plan.name,'amount_cents',plan.monthly_price_cents,'currency',plan.currency,'status',intent.status);
end $$;

create or replace function public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text,
  p_plan_code text default 'company_initial',
  p_session_types text[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  plan public.billing_plans%rowtype;
  sessions text[];
  sub_id uuid;
  checkout jsonb;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_name,'')))<2 then return jsonb_build_object('success',false,'error','Informe o nome da empresa.'); end if;
  select * into plan from public.billing_plans where code=p_plan_code and account_scope='company' and is_active;
  if plan.code is null then return jsonb_build_object('success',false,'error','Plano empresarial inválido.'); end if;
  if exists(select 1 from public.clinics where owner_id=uid) then return jsonb_build_object('success',false,'error','Esta conta já possui uma empresa.'); end if;

  sessions := coalesce(p_session_types, array[case when lower(coalesce(p_kind,'')) in ('consultorio','clinica','clinic') then 'clinic' when lower(coalesce(p_kind,'')) in ('radiologia','radiology') then 'radiology' else 'laboratory' end]);
  select array_agg(distinct lower(x)) into sessions from unnest(sessions) x where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(sessions)=0 or cardinality(sessions)>plan.max_sessions then return jsonb_build_object('success',false,'error','Quantidade de ambientes incompatível com o plano.'); end if;

  insert into public.clinics(name,kind,company_type,owner_id,modules_enabled)
  values(trim(p_name),lower(coalesce(p_kind,'empresa')),'IPO',uid,'{}'::text[]) returning id into cid;

  insert into public.profiles(id,full_name,role,account_subtype,account_type,is_default_admin,clinic_id)
  values(uid,nullif(trim(p_full_name),''),'CEO','CEO','company_admin',true,cid)
  on conflict(id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),role='CEO',account_subtype='CEO',account_type='company_admin',is_default_admin=true,clinic_id=cid,updated_at=now();

  insert into public.clinic_members(clinic_id,user_id,role,status,decided_by,decided_at,access_source)
  values(cid,uid,'CEO','accepted',uid,now(),'company_seat')
  on conflict do nothing;

  insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
  values('company',cid,plan.code,'pending_checkout',least(28,extract(day from now())::int)) returning id into sub_id;

  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select cid,x,'active',case when plan.max_sessions>1 then 'company' else 'isolated' end from unnest(sessions) x;

  checkout := public.create_checkout_intent(plan.code,cid);
  return jsonb_build_object('success',true,'clinic_id',cid,'plan_code',plan.code,'checkout',checkout);
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

create or replace function public.create_professional_account(p_full_name text, p_profession_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  checkout jsonb;
  allowed text[]:=array['DENTISTA','CADISTA','PROTETICO','ATENDIMENTO','RADIOLOGISTA','OUTRO'];
  profession text:=upper(trim(coalesce(p_profession_type,'OUTRO')));
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if not(profession=any(allowed)) then profession:='OUTRO'; end if;
  insert into public.profiles(id,full_name,role,account_subtype,account_type,profession_type,is_default_admin)
  values(uid,nullif(trim(p_full_name),''),profession,profession,'professional',profession,false)
  on conflict(id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),role=profession,account_subtype=profession,account_type='professional',profession_type=profession,is_default_admin=false,updated_at=now();
  insert into public.professional_accounts(user_id,profession_type,status) values(uid,profession,'pending_checkout')
  on conflict(user_id) do update set profession_type=excluded.profession_type,updated_at=now();
  checkout:=public.create_checkout_intent('professional',null);
  return jsonb_build_object('success',true,'plan_code','professional','checkout',checkout);
exception when others then return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

create or replace function public.switch_company_context(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare acc text;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if not exists(select 1 from public.clinic_members where clinic_id=p_clinic_id and user_id=auth.uid() and status='accepted')
     and not exists(select 1 from public.clinics where id=p_clinic_id and owner_id=auth.uid()) then raise exception 'Você não pertence a esta empresa.'; end if;
  update public.profiles set clinic_id=p_clinic_id,updated_at=now() where id=auth.uid();
  return public.my_subscription_context();
end $$;

create or replace function public.enforce_membership_plan_limits()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  company_limit integer;
  company_count integer;
  link_limit integer;
  link_count integer;
  acct_type text;
begin
  if new.status <> 'accepted' then return new; end if;
  select bp.max_members into company_limit
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=new.clinic_id and s.status <> 'canceled' order by s.created_at desc limit 1;
  if company_limit is not null and company_limit>0 then
    select count(*) into company_count from public.clinic_members m where m.clinic_id=new.clinic_id and m.status='accepted' and m.id<>new.id;
    if company_count>=company_limit then raise exception 'Limite de membros do plano atingido (%).',company_limit; end if;
  end if;

  select account_type into acct_type from public.profiles where id=new.user_id;
  if acct_type='professional' and new.access_source='professional_subscription' then
    select bp.max_company_links into link_limit
    from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
    where s.user_id=new.user_id and s.status <> 'canceled' order by s.created_at desc limit 1;
    if link_limit is null or link_limit=0 then raise exception 'Plano profissional inativo ou sem vínculos disponíveis.'; end if;
    select count(*) into link_count from public.clinic_members m where m.user_id=new.user_id and m.status='accepted' and m.access_source='professional_subscription' and m.id<>new.id;
    if link_count>=link_limit then raise exception 'Seu plano profissional permite vínculo com até % empresas.',link_limit; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_membership_plan_limits on public.clinic_members;
create trigger trg_enforce_membership_plan_limits before insert or update of status,access_source on public.clinic_members
for each row execute function public.enforce_membership_plan_limits();

-- Future payment provider/edge-function entry point. Never callable from the client.
create or replace function public.billing_apply_subscription_state(
  p_subscription_id uuid,
  p_status text,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_grace_until timestamptz default null,
  p_provider text default null,
  p_external_customer_id text default null,
  p_external_subscription_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.account_subscriptions%rowtype;
begin
  if p_status not in ('pending_checkout','trialing','active','past_due','grace','suspended','canceled') then raise exception 'Status de cobrança inválido.'; end if;
  update public.account_subscriptions set
    status=p_status,current_period_start=coalesce(p_period_start,current_period_start),current_period_end=coalesce(p_period_end,current_period_end),
    grace_until=p_grace_until,billing_provider=coalesce(p_provider,billing_provider),external_customer_id=coalesce(p_external_customer_id,external_customer_id),
    external_subscription_id=coalesce(p_external_subscription_id,external_subscription_id),canceled_at=case when p_status='canceled' then now() else canceled_at end
  where id=p_subscription_id returning * into s;
  if s.id is null then raise exception 'Assinatura não encontrada.'; end if;
  if s.scope_type='professional' then update public.professional_accounts set status=case when p_status in ('active','trialing','past_due','grace') then 'active' when p_status='pending_checkout' then 'pending_checkout' else 'suspended' end where user_id=s.user_id; end if;
  if s.scope_type='company' and p_status in ('active','trialing','past_due','grace') then
    update public.clinics c set storage_limit_bytes=(select storage_bytes from public.billing_plans where code=s.plan_code) where c.id=s.clinic_id;
  end if;
  return jsonb_build_object('subscription_id',s.id,'status',s.status,'access_mode',public.subscription_access_mode(s.status,s.current_period_end,s.grace_until));
end $$;

revoke all on function public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text) to service_role;

-- Seed existing accounts without disrupting production. IPO is permanently internal Advanced.
update public.profiles set account_type=case when is_default_admin or upper(coalesce(role,'')) in ('CEO','ADMIN') then 'company_admin' else 'company_member' end
where clinic_id is not null and account_type is null;

insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
select c.id,x,'active','company'
from public.clinics c cross join lateral unnest(array[
  case when 'laboratory'=any(c.modules_enabled) then 'laboratory' end,
  case when 'clinical'=any(c.modules_enabled) then 'clinic' end,
  case when 'radiology'=any(c.modules_enabled) then 'radiology' end
]) x
where x is not null
on conflict(clinic_id,session_type) do update set status='active';

insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,metadata)
select 'company',c.id,
  case when c.company_type='IPO' or c.name ilike '%Instituto Praia%' then 'company_advanced' else 'company_advanced' end,
  'active',least(28,extract(day from c.created_at)::int),now(),
  case when c.company_type='IPO' or c.name ilike '%Instituto Praia%' then '2099-12-31 23:59:59+00'::timestamptz else now()+interval '30 days' end,
  case when c.company_type='IPO' or c.name ilike '%Instituto Praia%' then 'internal_override' else 'migration_grace' end,
  jsonb_build_object('migrated_in','0.3.2','grandfathered',true)
from public.clinics c
where not exists(select 1 from public.account_subscriptions s where s.clinic_id=c.id and s.status<>'canceled');

-- IPO always has the complete three-session plan.
insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
select c.id,s,'active','company' from public.clinics c cross join unnest(array['laboratory','clinic','radiology']) s
where c.company_type='IPO' or c.name ilike '%Instituto Praia%'
on conflict(clinic_id,session_type) do update set status='active',sharing_mode='company';

update public.clinics c set storage_limit_bytes=536870912000
where c.company_type='IPO' or c.name ilike '%Instituto Praia%';

-- RLS for new billing/session/DICOM structures.
alter table public.billing_plans enable row level security;
alter table public.professional_accounts enable row level security;
alter table public.company_sessions enable row level security;
alter table public.account_subscriptions enable row level security;
alter table public.checkout_intents enable row level security;
alter table public.billing_events enable row level security;
alter table public.radiology_studies enable row level security;
alter table public.radiology_series enable row level security;
alter table public.radiology_instances enable row level security;

drop policy if exists billing_plans_public_read on public.billing_plans;
create policy billing_plans_public_read on public.billing_plans for select using (is_active=true);

drop policy if exists professional_accounts_self_read on public.professional_accounts;
create policy professional_accounts_self_read on public.professional_accounts for select to authenticated using (user_id=auth.uid());

drop policy if exists company_sessions_member_read on public.company_sessions;
create policy company_sessions_member_read on public.company_sessions for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid()) or
  exists(select 1 from public.clinic_members m where m.clinic_id=company_sessions.clinic_id and m.user_id=auth.uid() and m.status='accepted') or
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=company_sessions.clinic_id)
);

drop policy if exists subscriptions_scope_read on public.account_subscriptions;
create policy subscriptions_scope_read on public.account_subscriptions for select to authenticated using (
  user_id=auth.uid() or
  (clinic_id is not null and (
    exists(select 1 from public.clinics c where c.id=account_subscriptions.clinic_id and c.owner_id=auth.uid()) or
    exists(select 1 from public.clinic_members m where m.clinic_id=account_subscriptions.clinic_id and m.user_id=auth.uid() and m.status='accepted')
  ))
);

drop policy if exists checkout_intents_self_read on public.checkout_intents;
create policy checkout_intents_self_read on public.checkout_intents for select to authenticated using (user_id=auth.uid());

-- billing_events intentionally has no client policies.

drop policy if exists radiology_studies_member_read on public.radiology_studies;
create policy radiology_studies_member_read on public.radiology_studies for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid()) or
  exists(select 1 from public.clinic_members m where m.clinic_id=radiology_studies.clinic_id and m.user_id=auth.uid() and m.status='accepted')
);
drop policy if exists radiology_studies_member_write on public.radiology_studies;
create policy radiology_studies_member_write on public.radiology_studies for all to authenticated using (
  exists(select 1 from public.company_sessions s where s.clinic_id=radiology_studies.clinic_id and s.session_type='radiology' and s.status='active') and
  (exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid()) or exists(select 1 from public.clinic_members m where m.clinic_id=radiology_studies.clinic_id and m.user_id=auth.uid() and m.status='accepted'))
) with check (
  exists(select 1 from public.company_sessions s where s.clinic_id=radiology_studies.clinic_id and s.session_type='radiology' and s.status='active') and
  (exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid()) or exists(select 1 from public.clinic_members m where m.clinic_id=radiology_studies.clinic_id and m.user_id=auth.uid() and m.status='accepted'))
);

drop policy if exists radiology_series_member_read on public.radiology_series;
create policy radiology_series_member_read on public.radiology_series for select to authenticated using (exists(select 1 from public.radiology_studies st where st.id=study_id));
drop policy if exists radiology_instances_member_read on public.radiology_instances;
create policy radiology_instances_member_read on public.radiology_instances for select to authenticated using (exists(select 1 from public.radiology_series se join public.radiology_studies st on st.id=se.study_id where se.id=series_id));

grant select on public.billing_plans to anon, authenticated;
grant select on public.professional_accounts,public.company_sessions,public.account_subscriptions,public.checkout_intents,public.radiology_studies,public.radiology_series,public.radiology_instances to authenticated;
grant execute on function public.company_subscription_snapshot(uuid),public.my_subscription_context(),public.configure_company_sessions(uuid,text[]),public.create_checkout_intent(text,uuid),public.create_company_account(text,text,text,text,text[]),public.create_professional_account(text,text),public.switch_company_context(uuid) to authenticated;

-- ===== 20260909034500_radiology_storage_and_access_032.sql =====

-- DentalFlow 0.3.2 — private DICOM storage and subscription-aware access

create or replace function public.company_has_operational_access(_clinic_id uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((
    select public.subscription_access_mode(s.status,s.current_period_end,s.grace_until)='full'
    from public.account_subscriptions s
    where s.clinic_id=_clinic_id
    order by (s.status<>'canceled') desc, s.created_at desc
    limit 1
  ), false)
$$;

create or replace function public.user_can_use_company_session(_clinic_id uuid, _session_type text)
returns boolean
language sql stable security definer set search_path=public as $$
  select
    public.company_has_operational_access(_clinic_id)
    and exists(select 1 from public.company_sessions s where s.clinic_id=_clinic_id and s.session_type=_session_type and s.status='active')
    and (
      exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=_clinic_id and m.user_id=auth.uid() and m.status='accepted')
      or exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=_clinic_id)
    )
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'dicom-files',
  'dicom-files',
  false,
  1073741824,
  array['application/dicom','application/octet-stream']::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types,
  updated_at=now();

-- Object names are always: <clinic_uuid>/<study_uuid>/<series_uuid>/<filename>
drop policy if exists dicom_objects_read on storage.objects;
create policy dicom_objects_read on storage.objects
for select to authenticated
using (
  bucket_id='dicom-files'
  and exists(
    select 1 from public.clinics c
    where c.id::text=split_part(name,'/',1)
      and (
        c.owner_id=auth.uid()
        or exists(select 1 from public.clinic_members m where m.clinic_id=c.id and m.user_id=auth.uid() and m.status='accepted')
        or exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=c.id)
      )
  )
);

drop policy if exists dicom_objects_insert on storage.objects;
create policy dicom_objects_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='dicom-files'
  and exists(
    select 1 from public.clinics c
    where c.id::text=split_part(name,'/',1)
      and public.user_can_use_company_session(c.id,'radiology')
  )
);

drop policy if exists dicom_objects_update on storage.objects;
create policy dicom_objects_update on storage.objects
for update to authenticated
using (
  bucket_id='dicom-files'
  and exists(select 1 from public.clinics c where c.id::text=split_part(name,'/',1) and public.user_can_use_company_session(c.id,'radiology'))
)
with check (
  bucket_id='dicom-files'
  and exists(select 1 from public.clinics c where c.id::text=split_part(name,'/',1) and public.user_can_use_company_session(c.id,'radiology'))
);

drop policy if exists dicom_objects_delete on storage.objects;
create policy dicom_objects_delete on storage.objects
for delete to authenticated
using (
  bucket_id='dicom-files'
  and exists(select 1 from public.clinics c where c.id::text=split_part(name,'/',1) and public.user_can_use_company_session(c.id,'radiology'))
);

-- Replace broad study write policy with subscription/session-aware policies.
drop policy if exists radiology_studies_member_write on public.radiology_studies;
drop policy if exists radiology_studies_write on public.radiology_studies;
create policy radiology_studies_write on public.radiology_studies
for all to authenticated
using (public.user_can_use_company_session(clinic_id,'radiology'))
with check (public.user_can_use_company_session(clinic_id,'radiology'));

drop policy if exists radiology_series_write on public.radiology_series;
create policy radiology_series_write on public.radiology_series
for all to authenticated
using (
  exists(select 1 from public.radiology_studies st where st.id=study_id and public.user_can_use_company_session(st.clinic_id,'radiology'))
)
with check (
  exists(select 1 from public.radiology_studies st where st.id=study_id and public.user_can_use_company_session(st.clinic_id,'radiology'))
);

drop policy if exists radiology_instances_write on public.radiology_instances;
create policy radiology_instances_write on public.radiology_instances
for all to authenticated
using (
  exists(
    select 1 from public.radiology_series se
    join public.radiology_studies st on st.id=se.study_id
    where se.id=series_id and public.user_can_use_company_session(st.clinic_id,'radiology')
  )
)
with check (
  exists(
    select 1 from public.radiology_series se
    join public.radiology_studies st on st.id=se.study_id
    where se.id=series_id and public.user_can_use_company_session(st.clinic_id,'radiology')
  )
);

grant insert,update,delete on public.radiology_studies,public.radiology_series,public.radiology_instances to authenticated;
grant execute on function public.company_has_operational_access(uuid),public.user_can_use_company_session(uuid,text) to authenticated;

-- ===== 20260909035000_membership_status_compat_032.sql =====

-- DentalFlow 0.3.2 — compatibility with the existing membership lifecycle.
-- Production uses `active` for accepted members; older/newer flows may also use `accepted`.

create or replace function public.active_company_member(_clinic_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.clinic_members m
    where m.clinic_id=_clinic_id and m.user_id=_user_id and m.status in ('active','accepted')
  )
$$;

create or replace function public.company_subscription_snapshot(_clinic_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  allowed boolean;
begin
  select exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or public.active_company_member(_clinic_id,auth.uid())
      or exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.clinic_id=_clinic_id)
    into allowed;
  if not allowed then return null; end if;

  select * into s from public.account_subscriptions where clinic_id=_clinic_id and status <> 'canceled' order by created_at desc limit 1;
  if s.id is null then select * into s from public.account_subscriptions where clinic_id=_clinic_id order by created_at desc limit 1; end if;
  if s.id is null then return null; end if;
  select * into p from public.billing_plans where code=s.plan_code;

  return jsonb_build_object(
    'subscription_id',s.id,'scope','company','plan_code',p.code,'plan_name',p.name,
    'status',s.status,'access_mode',public.subscription_access_mode(s.status,s.current_period_end,s.grace_until),
    'billing_day',s.billing_day,'current_period_end',s.current_period_end,'grace_until',s.grace_until,
    'monthly_price_cents',p.monthly_price_cents,'currency',p.currency,
    'max_sessions',p.max_sessions,'max_members',p.max_members,'storage_bytes',p.storage_bytes,'features',p.features,
    'sessions',coalesce((select jsonb_agg(cs.session_type order by cs.session_type) from public.company_sessions cs where cs.clinic_id=_clinic_id and cs.status='active'),'[]'::jsonb)
  );
end $$;

create or replace function public.configure_company_sessions(p_clinic_id uuid, p_session_types text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  max_allowed integer;
  normalized text[];
  is_manager boolean;
begin
  select exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.status in ('active','accepted') and upper(m.role) in ('CEO','ADMIN'))
    into is_manager;
  if not is_manager then raise exception 'Sem permissão para configurar os ambientes.'; end if;

  select bp.max_sessions into max_allowed
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=p_clinic_id and s.status <> 'canceled'
  order by s.created_at desc limit 1;
  if max_allowed is null then raise exception 'Plano empresarial não encontrado.'; end if;

  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into normalized
  from unnest(coalesce(p_session_types,'{}'::text[])) x
  where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(normalized)=0 then raise exception 'Selecione ao menos um ambiente.'; end if;
  if cardinality(normalized)>max_allowed then raise exception 'Seu plano permite no máximo % ambiente(s).',max_allowed; end if;

  update public.company_sessions set status='disabled' where clinic_id=p_clinic_id and not(session_type=any(normalized));
  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select p_clinic_id,x,'active',case when max_allowed>1 then 'company' else 'isolated' end from unnest(normalized) x
  on conflict(clinic_id,session_type) do update set status='active',sharing_mode=excluded.sharing_mode,updated_at=now();
  return public.company_subscription_snapshot(p_clinic_id);
end $$;

create or replace function public.switch_company_context(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if not public.active_company_member(p_clinic_id,auth.uid())
     and not exists(select 1 from public.clinics where id=p_clinic_id and owner_id=auth.uid()) then
    raise exception 'Você não pertence a esta empresa.';
  end if;
  update public.profiles set clinic_id=p_clinic_id,updated_at=now() where id=auth.uid();
  return public.my_subscription_context();
end $$;

create or replace function public.enforce_membership_plan_limits()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  company_limit integer;
  company_count integer;
  link_limit integer;
  link_count integer;
  acct_type text;
begin
  if new.status not in ('active','accepted') then return new; end if;

  select bp.max_members into company_limit
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=new.clinic_id and s.status <> 'canceled' order by s.created_at desc limit 1;
  if company_limit is not null and company_limit>0 then
    select count(*) into company_count
    from public.clinic_members m
    where m.clinic_id=new.clinic_id and m.status in ('active','accepted') and m.id<>new.id;
    if company_count>=company_limit then raise exception 'Limite de membros do plano atingido (%).',company_limit; end if;
  end if;

  select account_type into acct_type from public.profiles where id=new.user_id;
  if acct_type='professional' and new.access_source='professional_subscription' then
    select bp.max_company_links into link_limit
    from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
    where s.user_id=new.user_id and s.status <> 'canceled' order by s.created_at desc limit 1;
    if link_limit is null or link_limit=0 then raise exception 'Plano profissional inativo ou sem vínculos disponíveis.'; end if;
    select count(*) into link_count
    from public.clinic_members m
    where m.user_id=new.user_id and m.status in ('active','accepted') and m.access_source='professional_subscription' and m.id<>new.id;
    if link_count>=link_limit then raise exception 'Seu plano profissional permite vínculo com até % empresas.',link_limit; end if;
  end if;
  return new;
end $$;

create or replace function public.user_can_use_company_session(_clinic_id uuid, _session_type text)
returns boolean
language sql stable security definer set search_path=public as $$
  select
    public.company_has_operational_access(_clinic_id)
    and exists(select 1 from public.company_sessions s where s.clinic_id=_clinic_id and s.session_type=_session_type and s.status='active')
    and (
      exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or public.active_company_member(_clinic_id,auth.uid())
      or exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=_clinic_id)
    )
$$;

-- Company creation now follows the status value already used by the product.
create or replace function public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text,
  p_plan_code text default 'company_initial',
  p_session_types text[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  plan public.billing_plans%rowtype;
  sessions text[];
  sub_id uuid;
  checkout jsonb;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_name,'')))<2 then return jsonb_build_object('success',false,'error','Informe o nome da empresa.'); end if;
  select * into plan from public.billing_plans where code=p_plan_code and account_scope='company' and is_active;
  if plan.code is null then return jsonb_build_object('success',false,'error','Plano empresarial inválido.'); end if;
  if exists(select 1 from public.clinics where owner_id=uid) then return jsonb_build_object('success',false,'error','Esta conta já possui uma empresa.'); end if;

  sessions := coalesce(p_session_types,array[case when lower(coalesce(p_kind,'')) in ('consultorio','clinica','clinic') then 'clinic' when lower(coalesce(p_kind,'')) in ('radiologia','radiology') then 'radiology' else 'laboratory' end]);
  select array_agg(distinct lower(x)) into sessions from unnest(sessions) x where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(sessions)=0 or cardinality(sessions)>plan.max_sessions then return jsonb_build_object('success',false,'error','Quantidade de ambientes incompatível com o plano.'); end if;

  insert into public.clinics(name,kind,company_type,owner_id,modules_enabled)
  values(trim(p_name),lower(coalesce(p_kind,'empresa')),'IPO',uid,'{}'::text[]) returning id into cid;

  insert into public.profiles(id,full_name,role,account_subtype,account_type,is_default_admin,clinic_id)
  values(uid,nullif(trim(p_full_name),''),'CEO','CEO','company_admin',true,cid)
  on conflict(id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),role='CEO',account_subtype='CEO',account_type='company_admin',is_default_admin=true,clinic_id=cid,updated_at=now();

  insert into public.clinic_members(clinic_id,user_id,role,status,decided_by,decided_at,access_source)
  values(cid,uid,'CEO','active',uid,now(),'company_seat')
  on conflict do nothing;

  insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
  values('company',cid,plan.code,'pending_checkout',least(28,extract(day from now())::int)) returning id into sub_id;

  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select cid,x,'active',case when plan.max_sessions>1 then 'company' else 'isolated' end from unnest(sessions) x;

  checkout := public.create_checkout_intent(plan.code,cid);
  return jsonb_build_object('success',true,'clinic_id',cid,'plan_code',plan.code,'checkout',checkout);
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

-- Refresh new-table read policies to recognize both membership states.
drop policy if exists company_sessions_member_read on public.company_sessions;
create policy company_sessions_member_read on public.company_sessions for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid())
  or public.active_company_member(company_sessions.clinic_id,auth.uid())
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=company_sessions.clinic_id)
);

drop policy if exists subscriptions_scope_read on public.account_subscriptions;
create policy subscriptions_scope_read on public.account_subscriptions for select to authenticated using (
  user_id=auth.uid() or
  (clinic_id is not null and (
    exists(select 1 from public.clinics c where c.id=account_subscriptions.clinic_id and c.owner_id=auth.uid())
    or public.active_company_member(account_subscriptions.clinic_id,auth.uid())
  ))
);

drop policy if exists radiology_studies_member_read on public.radiology_studies;
create policy radiology_studies_member_read on public.radiology_studies for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid())
  or public.active_company_member(radiology_studies.clinic_id,auth.uid())
);

grant execute on function public.active_company_member(uuid,uuid) to authenticated;

-- ===== 20260909040500_professional_company_links_032.sql =====

-- DentalFlow 0.3.2 — Professional accounts join companies through a private invite code.
-- A professional subscription pays for mobility (max company links); the company plan pays for seats/sessions.

create or replace function public.my_professional_company_links()
returns table(
  clinic_id uuid,
  clinic_name text,
  membership_role text,
  membership_status text,
  access_source text,
  is_current boolean,
  company_plan_code text,
  company_plan_name text,
  company_access_mode text,
  sessions text[]
)
language sql stable security definer set search_path=public as $$
  select
    c.id,
    c.name,
    m.role,
    m.status,
    m.access_source,
    (p.clinic_id=c.id),
    bp.code,
    bp.name,
    public.subscription_access_mode(s.status,s.current_period_end,s.grace_until),
    coalesce(array(
      select cs.session_type
      from public.company_sessions cs
      where cs.clinic_id=c.id and cs.status='active'
      order by cs.session_type
    ),'{}'::text[])
  from public.clinic_members m
  join public.clinics c on c.id=m.clinic_id
  join public.profiles p on p.id=auth.uid()
  left join lateral (
    select sx.* from public.account_subscriptions sx
    where sx.clinic_id=c.id order by (sx.status<>'canceled') desc,sx.created_at desc limit 1
  ) s on true
  left join public.billing_plans bp on bp.code=s.plan_code
  where m.user_id=auth.uid()
    and m.access_source='professional_subscription'
  order by (m.status in ('active','accepted')) desc,c.name
$$;

create or replace function public.link_professional_company(p_invite_code text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  target public.clinics%rowtype;
  profession text;
  member_role text;
  prof_sub public.account_subscriptions%rowtype;
  prof_plan public.billing_plans%rowtype;
  company_sub public.account_subscriptions%rowtype;
  company_plan public.billing_plans%rowtype;
  existing public.clinic_members%rowtype;
  current_links integer;
  current_members integer;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_invite_code,'')))<4 then return jsonb_build_object('success',false,'error','Informe um código de empresa válido.'); end if;

  select coalesce(pa.profession_type,p.profession_type,p.account_subtype,p.role,'OUTRO')
  into profession
  from public.profiles p left join public.professional_accounts pa on pa.user_id=p.id
  where p.id=uid and p.account_type='professional';
  if profession is null then return jsonb_build_object('success',false,'error','Esta conta não é uma conta profissional.'); end if;

  select * into prof_sub from public.account_subscriptions
  where user_id=uid and status<>'canceled' order by created_at desc limit 1;
  if prof_sub.id is null then return jsonb_build_object('success',false,'error','Ative o plano Profissional antes de vincular uma empresa.'); end if;
  select * into prof_plan from public.billing_plans where code=prof_sub.plan_code and account_scope='professional';
  if public.subscription_access_mode(prof_sub.status,prof_sub.current_period_end,prof_sub.grace_until)<>'full' then
    return jsonb_build_object('success',false,'error','Seu plano Profissional precisa estar ativo para criar novos vínculos.');
  end if;

  select * into target from public.clinics
  where upper(trim(invite_code))=upper(trim(p_invite_code)) limit 1;
  if target.id is null then return jsonb_build_object('success',false,'error','Código de empresa não encontrado.'); end if;

  select * into company_sub from public.account_subscriptions
  where clinic_id=target.id and status<>'canceled' order by created_at desc limit 1;
  if company_sub.id is null then return jsonb_build_object('success',false,'error','A empresa ainda não possui um plano DentalFlow ativo.'); end if;
  select * into company_plan from public.billing_plans where code=company_sub.plan_code;
  if public.subscription_access_mode(company_sub.status,company_sub.current_period_end,company_sub.grace_until)<>'full' then
    return jsonb_build_object('success',false,'error','A assinatura desta empresa precisa ser regularizada antes de aceitar novos vínculos.');
  end if;

  select * into existing from public.clinic_members where clinic_id=target.id and user_id=uid;
  if existing.id is not null and existing.status in ('active','accepted') then
    update public.profiles set clinic_id=target.id,updated_at=now() where id=uid;
    return jsonb_build_object('success',true,'clinic_id',target.id,'clinic_name',target.name,'already_linked',true,'context',public.my_subscription_context());
  end if;

  select count(*) into current_links from public.clinic_members
  where user_id=uid and access_source='professional_subscription' and status in ('active','accepted');
  if current_links>=coalesce(prof_plan.max_company_links,0) then
    return jsonb_build_object('success',false,'error',format('Seu plano Profissional permite vínculo com até %s empresas.',prof_plan.max_company_links));
  end if;

  select count(*) into current_members from public.clinic_members
  where clinic_id=target.id and status in ('active','accepted');
  if coalesce(company_plan.max_members,0)>0 and current_members>=company_plan.max_members then
    return jsonb_build_object('success',false,'error','A empresa atingiu o limite de membros do plano atual.');
  end if;

  member_role:=case upper(profession)
    when 'DENTISTA' then 'DR'
    when 'CADISTA' then 'CADISTA'
    when 'PROTETICO' then 'PROTETICO'
    when 'ATENDIMENTO' then 'ATENDIMENTO'
    when 'RADIOLOGISTA' then 'USER'
    else 'USER'
  end;

  insert into public.clinic_members(clinic_id,user_id,role,status,decided_by,decided_at,invited_by,access_source)
  values(target.id,uid,member_role,'active',uid,now(),null,'professional_subscription')
  on conflict(clinic_id,user_id) do update set
    role=excluded.role,status='active',decided_by=uid,decided_at=now(),access_source='professional_subscription';

  update public.profiles set clinic_id=target.id,updated_at=now() where id=uid;
  return jsonb_build_object('success',true,'clinic_id',target.id,'clinic_name',target.name,'already_linked',false,'context',public.my_subscription_context());
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

create or replace function public.unlink_professional_company(p_clinic_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); next_clinic uuid;
begin
  if uid is null then raise exception 'Sessão inválida.'; end if;
  if not exists(select 1 from public.profiles where id=uid and account_type='professional') then raise exception 'Conta profissional necessária.'; end if;
  delete from public.clinic_members where clinic_id=p_clinic_id and user_id=uid and access_source='professional_subscription';
  select m.clinic_id into next_clinic from public.clinic_members m
  where m.user_id=uid and m.access_source='professional_subscription' and m.status in ('active','accepted')
  order by m.created_at limit 1;
  update public.profiles set clinic_id=next_clinic,updated_at=now() where id=uid;
  return public.my_subscription_context();
end $$;

grant execute on function public.my_professional_company_links(),public.link_professional_company(text),public.unlink_professional_company(uuid) to authenticated;

-- ===== 20260909043000_company_only_billing_sandbox_032.sql =====

-- DentalFlow 0.3.2 — company-only billing and controlled subscription sandbox.
-- Company accounts are the only billable accounts. Professional accounts are company seats.

update public.billing_plans
set is_active = false,
    updated_at = now()
where code = 'professional';

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.account_subscriptions(id) on delete cascade,
  checkout_intent_id uuid references public.checkout_intents(id) on delete set null,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null check (status in ('pending','paid','failed','refunded','canceled')),
  provider text,
  provider_payment_id text,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create index if not exists billing_payments_subscription_idx
  on public.billing_payments(subscription_id, created_at desc);

-- Test-mode capability is server-managed. No browser can enable itself.
create table if not exists public.billing_test_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled_until timestamptz not null,
  created_at timestamptz not null default now(),
  created_by text not null default 'manual'
);

alter table public.billing_payments enable row level security;
alter table public.billing_test_access enable row level security;

drop policy if exists billing_payments_company_read on public.billing_payments;
create policy billing_payments_company_read on public.billing_payments
for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=billing_payments.clinic_id and c.owner_id=auth.uid())
  or public.active_company_member(billing_payments.clinic_id,auth.uid())
);
-- billing_test_access intentionally has no client table policy.

grant select on public.billing_payments to authenticated;

create or replace function public.subscription_access_mode(
  _status text,
  _period_end timestamptz,
  _grace_until timestamptz
) returns text
language sql stable as $$
  select case
    when _status='trialing' and (_period_end is null or _period_end >= now()) then 'full'
    when _status='active' and _period_end is not null and _period_end >= now() then 'full'
    when _status in ('past_due','grace') and _grace_until is not null and _grace_until >= now() then 'full'
    when _status='canceled' and _period_end is not null and _period_end >= now() then 'full'
    else 'billing_only'
  end
$$;

create or replace function public.my_subscription_context()
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  pr public.profiles%rowtype;
  company_ctx jsonb;
  profession text;
begin
  if auth.uid() is null then return null; end if;
  select * into pr from public.profiles where id=auth.uid();
  if pr.id is null then return jsonb_build_object('account_type','unclassified','effective_access','billing_only'); end if;

  profession := coalesce(pr.profession_type,pr.account_subtype,pr.role);

  if pr.clinic_id is null then
    return jsonb_build_object(
      'account_type',coalesce(pr.account_type,'unclassified'),
      'effective_access',case when coalesce(pr.account_type,'')='professional' then 'needs_company_link' else 'billing_only' end,
      'active_clinic_id',null,
      'professional_profile',jsonb_build_object('profession_type',profession)
    );
  end if;

  company_ctx := public.company_subscription_snapshot(pr.clinic_id);
  return jsonb_build_object(
    'account_type',coalesce(pr.account_type,'company_member'),
    'effective_access',coalesce(company_ctx->>'access_mode','billing_only'),
    'active_clinic_id',pr.clinic_id,
    'company',company_ctx,
    'professional_profile',case when coalesce(pr.account_type,'')='professional'
      then jsonb_build_object('profession_type',profession) else null end
  );
end $$;

-- Only company plans can create checkout intents. A pending upgrade never changes live entitlements.
create or replace function public.create_checkout_intent(
  p_plan_code text,
  p_clinic_id uuid,
  p_session_types text[] default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  plan public.billing_plans%rowtype;
  sub public.account_subscriptions%rowtype;
  intent public.checkout_intents%rowtype;
  is_manager boolean;
  requested text[];
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if p_clinic_id is null then raise exception 'Empresa inválida.'; end if;

  select * into plan from public.billing_plans
  where code=p_plan_code and account_scope='company' and is_active;
  if plan.code is null then raise exception 'Plano empresarial inválido.'; end if;

  select exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.status in ('active','accepted') and upper(m.role) in ('CEO','ADMIN'))
  into is_manager;
  if not is_manager then raise exception 'Sem permissão para alterar a assinatura.'; end if;

  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into requested
  from unnest(coalesce(p_session_types,'{}'::text[])) x
  where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(requested)>plan.max_sessions then raise exception 'O plano selecionado permite no máximo % ambiente(s).',plan.max_sessions; end if;

  select * into sub from public.account_subscriptions
  where clinic_id=p_clinic_id and status<>'canceled'
  order by created_at desc limit 1;

  if sub.id is null then
    insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
    values('company',p_clinic_id,p_plan_code,'pending_checkout',least(28,extract(day from now())::int))
    returning * into sub;
  elsif sub.status='pending_checkout' then
    update public.account_subscriptions set plan_code=p_plan_code,updated_at=now() where id=sub.id returning * into sub;
  end if;

  update public.checkout_intents
  set status='expired',updated_at=now()
  where user_id=auth.uid() and clinic_id=p_clinic_id and status='pending' and expires_at<now();

  insert into public.checkout_intents(
    user_id,clinic_id,subscription_id,plan_code,amount_cents,currency,status,metadata
  ) values(
    auth.uid(),p_clinic_id,sub.id,p_plan_code,plan.monthly_price_cents,plan.currency,'pending',
    jsonb_build_object('requested_sessions',coalesce(to_jsonb(requested),'[]'::jsonb),'billing_version','0.3.2')
  ) returning * into intent;

  return jsonb_build_object(
    'checkout_intent_id',intent.id,
    'subscription_id',sub.id,
    'plan_code',plan.code,
    'plan_name',plan.name,
    'amount_cents',plan.monthly_price_cents,
    'currency',plan.currency,
    'status',intent.status,
    'billing_mode','live'
  );
end $$;

-- Provider/webhook entrypoint for a successful checkout. This is the only place that applies a paid upgrade.
create or replace function public.billing_apply_checkout_paid(
  p_checkout_intent_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_period_start timestamptz default now(),
  p_period_end timestamptz default (now()+interval '1 month')
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  intent public.checkout_intents%rowtype;
  sub public.account_subscriptions%rowtype;
  plan public.billing_plans%rowtype;
  requested text[];
begin
  select * into intent from public.checkout_intents where id=p_checkout_intent_id for update;
  if intent.id is null then raise exception 'Checkout não encontrado.'; end if;
  if intent.status='paid' then
    select * into sub from public.account_subscriptions where id=intent.subscription_id;
    return jsonb_build_object('subscription_id',sub.id,'status',sub.status,'idempotent',true);
  end if;
  if intent.status not in ('pending','provider_created') then raise exception 'Checkout não está disponível para pagamento.'; end if;

  select * into plan from public.billing_plans where code=intent.plan_code and account_scope='company';
  if plan.code is null then raise exception 'Plano do checkout não existe.'; end if;
  if p_period_end<=p_period_start then raise exception 'Período de assinatura inválido.'; end if;

  update public.account_subscriptions set
    plan_code=intent.plan_code,
    status='active',
    current_period_start=p_period_start,
    current_period_end=p_period_end,
    grace_until=null,
    billing_provider=p_provider,
    external_customer_id=coalesce(p_provider_customer_id,external_customer_id),
    external_subscription_id=coalesce(p_provider_subscription_id,external_subscription_id),
    updated_at=now()
  where id=intent.subscription_id returning * into sub;

  update public.checkout_intents set
    status='paid',billing_provider=p_provider,provider_checkout_id=coalesce(provider_checkout_id,p_provider_payment_id),updated_at=now()
  where id=intent.id;

  insert into public.billing_payments(
    subscription_id,checkout_intent_id,clinic_id,amount_cents,currency,status,provider,provider_payment_id,paid_at,period_start,period_end
  ) values(
    sub.id,intent.id,intent.clinic_id,intent.amount_cents,intent.currency,'paid',p_provider,p_provider_payment_id,now(),p_period_start,p_period_end
  ) on conflict(provider,provider_payment_id) do nothing;

  update public.clinics set storage_limit_bytes=plan.storage_bytes where id=intent.clinic_id;

  select coalesce(array_agg(value::text),'{}'::text[]) into requested
  from jsonb_array_elements_text(coalesce(intent.metadata->'requested_sessions','[]'::jsonb));
  if cardinality(requested)>0 then
    update public.company_sessions set status='disabled' where clinic_id=intent.clinic_id and not(session_type=any(requested));
    insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
    select intent.clinic_id,x,'active',case when plan.max_sessions>1 then 'company' else 'isolated' end
    from unnest(requested) x
    on conflict(clinic_id,session_type) do update set status='active',sharing_mode=excluded.sharing_mode,updated_at=now();
  end if;

  return jsonb_build_object(
    'subscription_id',sub.id,
    'status','active',
    'current_period_end',sub.current_period_end,
    'context',public.company_subscription_snapshot(intent.clinic_id)
  );
end $$;

revoke all on function public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz) to service_role;

-- Renewal/failure state entrypoint remains service-role only.
create or replace function public.billing_apply_subscription_state(
  p_subscription_id uuid,
  p_status text,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_grace_until timestamptz default null,
  p_provider text default null,
  p_external_customer_id text default null,
  p_external_subscription_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.account_subscriptions%rowtype;
begin
  if p_status not in ('pending_checkout','trialing','active','past_due','grace','suspended','canceled') then raise exception 'Status de cobrança inválido.'; end if;
  update public.account_subscriptions set
    status=p_status,
    current_period_start=coalesce(p_period_start,current_period_start),
    current_period_end=coalesce(p_period_end,current_period_end),
    grace_until=p_grace_until,
    billing_provider=coalesce(p_provider,billing_provider),
    external_customer_id=coalesce(p_external_customer_id,external_customer_id),
    external_subscription_id=coalesce(p_external_subscription_id,external_subscription_id),
    canceled_at=case when p_status='canceled' then now() else canceled_at end,
    updated_at=now()
  where id=p_subscription_id returning * into s;
  if s.id is null then raise exception 'Assinatura não encontrada.'; end if;
  return jsonb_build_object('subscription_id',s.id,'status',s.status,'access_mode',public.subscription_access_mode(s.status,s.current_period_end,s.grace_until));
end $$;
revoke all on function public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text) to service_role;

create or replace function public.create_professional_account(
  p_full_name text,
  p_profession_type text,
  p_invite_code text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  target public.clinics%rowtype;
  company_sub public.account_subscriptions%rowtype;
  company_plan public.billing_plans%rowtype;
  profession text:=upper(trim(coalesce(p_profession_type,'OUTRO')));
  profile_role text;
  app_role_value text;
  member_count integer;
  other_company_count integer;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_invite_code,'')))<4 then return jsonb_build_object('success',false,'error','Informe o código da empresa.'); end if;
  if profession not in ('DENTISTA','CADISTA','PROTETICO','ATENDIMENTO','RADIOLOGISTA','OUTRO') then profession:='OUTRO'; end if;

  select * into target from public.clinics where upper(trim(invite_code))=upper(trim(p_invite_code)) limit 1;
  if target.id is null then return jsonb_build_object('success',false,'error','Código de empresa inválido.'); end if;

  select * into company_sub from public.account_subscriptions
  where clinic_id=target.id and status<>'canceled' order by created_at desc limit 1;
  if company_sub.id is null then return jsonb_build_object('success',false,'error','A empresa não possui assinatura configurada.'); end if;
  select * into company_plan from public.billing_plans where code=company_sub.plan_code and account_scope='company';
  if public.subscription_access_mode(company_sub.status,company_sub.current_period_end,company_sub.grace_until)<>'full' then
    return jsonb_build_object('success',false,'error','A assinatura desta empresa precisa estar ativa.');
  end if;

  select count(*) into other_company_count from public.clinic_members
  where user_id=uid and status in ('active','accepted') and clinic_id<>target.id;
  if other_company_count>0 then return jsonb_build_object('success',false,'error','Uma conta profissional só pode pertencer a uma empresa.'); end if;

  select count(*) into member_count from public.clinic_members where clinic_id=target.id and status in ('active','accepted') and user_id<>uid;
  if company_plan.max_members>0 and member_count>=company_plan.max_members then
    return jsonb_build_object('success',false,'error','A empresa atingiu o limite de membros do plano.');
  end if;

  profile_role:=case profession when 'DENTISTA' then 'DR' when 'CADISTA' then 'CADISTA' when 'PROTETICO' then 'PROTETICO' when 'ATENDIMENTO' then 'ATENDIMENTO' when 'RADIOLOGISTA' then 'USER' else 'USER' end;
  app_role_value:=case profession when 'DENTISTA' then 'dentista' when 'CADISTA' then 'cadista' when 'PROTETICO' then 'protetico' when 'ATENDIMENTO' then 'recepcionista' else 'auxiliar' end;

  insert into public.profiles(id,full_name,role,account_subtype,account_type,profession_type,is_default_admin,clinic_id)
  values(uid,nullif(trim(p_full_name),''),profile_role,profile_role,'professional',profession,false,target.id)
  on conflict(id) do update set
    full_name=coalesce(excluded.full_name,profiles.full_name),role=profile_role,account_subtype=profile_role,
    account_type='professional',profession_type=profession,is_default_admin=false,clinic_id=target.id,updated_at=now();

  insert into public.clinic_members(clinic_id,user_id,role,status,decided_by,decided_at,access_source)
  values(target.id,uid,profile_role,'active',target.owner_id,now(),'company_seat')
  on conflict(clinic_id,user_id) do update set role=excluded.role,status='active',decided_by=excluded.decided_by,decided_at=now(),access_source='company_seat';

  delete from public.user_roles where user_id=uid;
  insert into public.user_roles(user_id,role) values(uid,app_role_value::public.app_role) on conflict(user_id,role) do nothing;

  if profession='CADISTA' then
    insert into public.cadistas(name,user_id) values(coalesce(nullif(trim(p_full_name),''),'Cadista'),uid)
    on conflict(user_id) do update set name=excluded.name;
  elsif profession='DENTISTA' then
    insert into public.doctors(name,user_id) values(coalesce(nullif(trim(p_full_name),''),'Dentista'),uid)
    on conflict(user_id) do update set name=excluded.name;
  elsif profession='PROTETICO' then
    insert into public.proteticos(name,user_id) values(coalesce(nullif(trim(p_full_name),''),'Protético'),uid)
    on conflict(user_id) do update set name=excluded.name;
  end if;

  return jsonb_build_object('success',true,'clinic_id',target.id,'clinic_name',target.name,'role',profile_role,'profession_type',profession,'context',public.my_subscription_context());
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

drop function if exists public.create_professional_account(text,text);
grant execute on function public.create_professional_account(text,text,text) to authenticated;

-- Existing recovery link is now one-company-only and has no professional billing dependency.
create or replace function public.link_professional_company(p_invite_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  pr public.profiles%rowtype;
  result jsonb;
begin
  select * into pr from public.profiles where id=uid;
  if pr.id is null or coalesce(pr.account_type,'')<>'professional' then return jsonb_build_object('success',false,'error','Conta profissional necessária.'); end if;
  if pr.clinic_id is not null then return jsonb_build_object('success',false,'error','Sua conta profissional já está vinculada a uma empresa.'); end if;
  result:=public.create_professional_account(pr.full_name,coalesce(pr.profession_type,pr.account_subtype,pr.role,'OUTRO'),p_invite_code);
  return result;
end $$;
grant execute on function public.link_professional_company(text) to authenticated;

create or replace function public.billing_test_capability()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'enabled',exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()),
    'until',(select t.enabled_until from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now() limit 1)
  )
$$;
grant execute on function public.billing_test_capability() to authenticated;

create or replace function public.billing_test_mark_checkout_paid(p_checkout_intent_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare allowed boolean; intent public.checkout_intents%rowtype; result jsonb;
begin
  select exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()) into allowed;
  if not allowed then return jsonb_build_object('success',false,'error','Modo de teste não autorizado.'); end if;
  select * into intent from public.checkout_intents where id=p_checkout_intent_id and user_id=auth.uid();
  if intent.id is null then return jsonb_build_object('success',false,'error','Checkout não encontrado.'); end if;
  result:=public.billing_apply_checkout_paid(intent.id,'sandbox','sandbox-'||intent.id::text,null,'sandbox-sub-'||intent.subscription_id::text,now(),now()+interval '30 days');
  return jsonb_build_object('success',true,'subscription_id',intent.subscription_id,'current_period_end',result->>'current_period_end','context',public.my_subscription_context());
exception when others then return jsonb_build_object('success',false,'error',sqlerrm); end $$;
grant execute on function public.billing_test_mark_checkout_paid(uuid) to authenticated;

create or replace function public.billing_test_simulate_nonpayment(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare allowed boolean; sub_id uuid;
begin
  select exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()) into allowed;
  if not allowed then return jsonb_build_object('success',false,'error','Modo de teste não autorizado.'); end if;
  if not exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid()) then return jsonb_build_object('success',false,'error','Somente o administrador da empresa pode simular cobrança.'); end if;
  select id into sub_id from public.account_subscriptions where clinic_id=p_clinic_id and status<>'canceled' order by created_at desc limit 1;
  if sub_id is null then return jsonb_build_object('success',false,'error','Assinatura não encontrada.'); end if;
  update public.account_subscriptions set status='past_due',current_period_end=now()-interval '1 second',grace_until=null,updated_at=now() where id=sub_id;
  return jsonb_build_object('success',true,'context',public.my_subscription_context());
exception when others then return jsonb_build_object('success',false,'error',sqlerrm); end $$;
grant execute on function public.billing_test_simulate_nonpayment(uuid) to authenticated;

-- ===== 20260909044000_company_invites_and_entitlement_guards_032.sql =====

-- DentalFlow 0.3.2 — company invite onboarding, one-company professional accounts,
-- billing QA enrollment, and server-side entitlement enforcement.

-- Neutralize the legacy two-argument checkout overload so every checkout follows
-- the company-only implementation created in the previous migration.
drop function if exists public.create_checkout_intent(text,uuid);
create function public.create_checkout_intent(p_plan_code text, p_clinic_id uuid)
returns jsonb
language sql security definer set search_path=public as $$
  select public.create_checkout_intent(p_plan_code,p_clinic_id,null::text[])
$$;
grant execute on function public.create_checkout_intent(text,uuid) to authenticated;

-- A professional code is validated before auth signup so an invalid/expired code
-- cannot leave behind a login account with no company.
create or replace function public.validate_company_invite_code(p_invite_code text)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  c public.clinics%rowtype;
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  member_count integer;
begin
  if length(trim(coalesce(p_invite_code,'')))<4 then
    return jsonb_build_object('valid',false,'reason','invalid_code');
  end if;

  select * into c from public.clinics
  where upper(trim(invite_code))=upper(trim(p_invite_code)) limit 1;
  if c.id is null then return jsonb_build_object('valid',false,'reason','invalid_code'); end if;

  select * into s from public.account_subscriptions
  where clinic_id=c.id and status<>'canceled' order by created_at desc limit 1;
  if s.id is null or public.subscription_access_mode(s.status,s.current_period_end,s.grace_until)<>'full' then
    return jsonb_build_object('valid',false,'reason','company_inactive','clinic_name',c.name);
  end if;

  select * into p from public.billing_plans where code=s.plan_code and account_scope='company' and is_active;
  select count(*) into member_count from public.clinic_members
  where clinic_id=c.id and status in ('active','accepted');

  if p.max_members>0 and member_count>=p.max_members then
    return jsonb_build_object('valid',false,'reason','seat_limit','clinic_name',c.name);
  end if;

  return jsonb_build_object(
    'valid',true,'clinic_name',c.name,'plan_name',p.name,
    'members_used',member_count,'members_limit',p.max_members
  );
end $$;
grant execute on function public.validate_company_invite_code(text) to anon,authenticated;

-- Company admins can retrieve the private invite code and current seat usage,
-- without exposing the company directory publicly.
create or replace function public.company_team_invite_info()
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  cid uuid;
  c public.clinics%rowtype;
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  member_count integer;
  code text;
  allowed boolean;
begin
  if uid is null then raise exception 'Sessão inválida.'; end if;
  select clinic_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Empresa não encontrada.'; end if;

  select exists(select 1 from public.clinics x where x.id=cid and x.owner_id=uid)
    or exists(select 1 from public.clinic_members m where m.clinic_id=cid and m.user_id=uid and m.status in ('active','accepted') and upper(m.role) in ('CEO','ADMIN'))
  into allowed;
  if not allowed then raise exception 'Somente o administrador pode convidar membros.'; end if;

  select * into c from public.clinics where id=cid;
  code:=nullif(trim(c.invite_code),'');
  if code is null then
    loop
      code:=upper(encode(gen_random_bytes(6),'hex'));
      exit when not exists(select 1 from public.clinics x where upper(coalesce(x.invite_code,''))=code);
    end loop;
    update public.clinics set invite_code=code,updated_at=now() where id=cid;
  end if;

  select * into s from public.account_subscriptions
  where clinic_id=cid and status<>'canceled' order by created_at desc limit 1;
  if s.id is not null then select * into p from public.billing_plans where code=s.plan_code; end if;
  select count(*) into member_count from public.clinic_members where clinic_id=cid and status in ('active','accepted');

  return jsonb_build_object(
    'clinic_id',cid,'clinic_name',c.name,'invite_code',code,
    'plan_code',p.code,'plan_name',p.name,'members_used',member_count,'members_limit',coalesce(p.max_members,0),
    'access_mode',case when s.id is null then 'billing_only' else public.subscription_access_mode(s.status,s.current_period_end,s.grace_until) end
  );
end $$;
grant execute on function public.company_team_invite_info() to authenticated;

-- Professional accounts are company seats, never multi-company identities.
create or replace function public.enforce_professional_single_company()
returns trigger language plpgsql security definer set search_path=public as $$
declare acct text;
begin
  if new.status not in ('active','accepted') then return new; end if;
  select account_type into acct from public.profiles where id=new.user_id;
  if acct='professional' and exists(
    select 1 from public.clinic_members m
    where m.user_id=new.user_id and m.clinic_id<>new.clinic_id
      and m.status in ('active','accepted') and m.id<>new.id
  ) then
    raise exception 'Uma conta profissional só pode pertencer a uma empresa.';
  end if;
  return new;
end $$;
drop trigger if exists trg_professional_single_company on public.clinic_members;
create trigger trg_professional_single_company
before insert or update of clinic_id,user_id,status on public.clinic_members
for each row execute function public.enforce_professional_single_company();

drop function if exists public.unlink_professional_company(uuid);

-- One-time QA codes let a fresh test company exercise the paid lifecycle without
-- opening a client-controlled "mark as paid" backdoor.
create table if not exists public.billing_test_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text,
  expires_at timestamptz not null,
  max_redemptions integer not null default 1 check(max_redemptions between 1 and 20),
  redemption_count integer not null default 0 check(redemption_count>=0),
  created_at timestamptz not null default now()
);
alter table public.billing_test_tokens enable row level security;
-- No table policies: codes are only consumed through the SECURITY DEFINER RPC.

create or replace function public.billing_test_redeem_token(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.billing_test_tokens%rowtype; until_at timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_token,'')))<8 then return jsonb_build_object('success',false,'error','Código de teste inválido.'); end if;

  select * into t from public.billing_test_tokens
  where token_hash=encode(digest(upper(trim(p_token)),'sha256'),'hex')
    and expires_at>now() and redemption_count<max_redemptions
  for update;
  if t.id is null then return jsonb_build_object('success',false,'error','Código de teste inválido, usado ou expirado.'); end if;

  update public.billing_test_tokens set redemption_count=redemption_count+1 where id=t.id;
  until_at:=least(t.expires_at,now()+interval '48 hours');
  insert into public.billing_test_access(user_id,enabled_until,created_by)
  values(auth.uid(),until_at,'one_time_token')
  on conflict(user_id) do update set enabled_until=greatest(billing_test_access.enabled_until,excluded.enabled_until),created_by='one_time_token';

  return jsonb_build_object('success',true,'enabled',true,'until',until_at);
end $$;
grant execute on function public.billing_test_redeem_token(text) to authenticated;

-- Email-confirmation-safe onboarding. Signup metadata is user supplied but every
-- field is revalidated by the authoritative company/professional creation RPCs.
create or replace function public.finalize_pending_onboarding()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  claims jsonb:=auth.jwt();
  meta jsonb;
  mode text;
  sessions text[];
  existing_profile public.profiles%rowtype;
  cid uuid;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  select * into existing_profile from public.profiles where id=uid;
  if existing_profile.clinic_id is not null then return jsonb_build_object('success',true,'already_finalized',true); end if;
  if exists(select 1 from public.clinics where owner_id=uid) then return jsonb_build_object('success',true,'already_finalized',true); end if;

  meta:=coalesce(claims->'user_metadata','{}'::jsonb);
  mode:=coalesce(meta->>'pending_account_mode','');
  if mode='professional' then
    return public.create_professional_account(
      coalesce(meta->>'full_name',''),
      coalesce(meta->>'pending_profession_type','OUTRO'),
      coalesce(meta->>'pending_invite_code','')
    );
  elsif mode='company' then
    select coalesce(array_agg(value),'{}'::text[]) into sessions
    from jsonb_array_elements_text(coalesce(meta->'pending_company_sessions','[]'::jsonb));
    return public.create_company_account(
      coalesce(meta->>'pending_company_name',''),
      case when sessions[1]='clinic' then 'consultorio' when sessions[1]='radiology' then 'radiologia' else 'laboratorio' end,
      coalesce(meta->>'full_name',''),
      coalesce(meta->>'pending_company_plan','company_initial'),
      sessions
    );
  end if;
  return jsonb_build_object('success',true,'nothing_pending',true);
end $$;
grant execute on function public.finalize_pending_onboarding() to authenticated;

-- Paid state must be authoritative below the UI as well. These role helpers are
-- used throughout legacy RLS policies, so expired companies lose operational
-- REST/storage access even if a client attempts to bypass SubscriptionGate.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.user_roles ur
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=_user_id and ur.role=_role and p.clinic_id is not null
      and public.company_has_operational_access(p.clinic_id)
  )
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.user_roles ur
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=_user_id and ur.role=any(_roles) and p.clinic_id is not null
      and public.company_has_operational_access(p.clinic_id)
  )
$$;

create or replace function public.is_cadista(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_role(_user_id,'cadista'::public.app_role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.user_roles ur
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=_user_id
      and ur.role in ('admin','dentista','recepcionista','auxiliar','protetico','SOLICITANTE')
      and p.clinic_id is not null and public.company_has_operational_access(p.clinic_id)
  )
$$;

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role in ('CEO','DR') and p.clinic_id is not null
      and public.company_has_operational_access(p.clinic_id)
  )
$$;

create or replace function public.can_access_case(_case_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.clinic_id is not null and public.company_has_operational_access(p.clinic_id)
  ) and (
    public.is_staff(auth.uid()) or public.current_user_is_admin() or exists(
      select 1 from public.cases c where c.id=_case_id and (
        c.requested_by=auth.uid() or exists(select 1 from public.cadistas cd where cd.id=c.cadista_id and cd.user_id=auth.uid())
      )
    )
  )
$$;

create or replace function public.can_access_patient(_patient_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_type text:=''; v_admin boolean:=false; v_clinic uuid;
begin
  if v_user is null then return false; end if;
  select upper(coalesce(nullif(trim(p.account_subtype),''),nullif(trim(p.role),''),'')),coalesce(p.is_default_admin,false),p.clinic_id
    into v_type,v_admin,v_clinic from public.profiles p where p.id=v_user;
  if v_clinic is null or not public.company_has_operational_access(v_clinic) then return false; end if;
  if v_admin or v_type in ('CEO','ADMIN','PROTETICO') then return true; end if;
  return exists(select 1 from public.cases c where c.patient_id=_patient_id and public.can_access_case(c.id));
end $$;

-- Clinical permission checks also fail closed when the company period expires.
create or replace function public.clinical_permission_allowed(_clinic_id uuid, _permission text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_role text;
begin
  if auth.uid() is null then return false; end if;
  if not public.company_has_operational_access(_clinic_id) then return false; end if;
  if not public.is_clinic_member(_clinic_id,auth.uid()) then return false; end if;
  if not public.clinic_module_enabled(_clinic_id,'clinical') then return false; end if;
  if public.can_manage_clinic_permissions(_clinic_id) then return true; end if;
  v_role:=public.current_clinic_role(_clinic_id);
  return exists(select 1 from public.clinic_role_permissions p where p.clinic_id=_clinic_id and upper(p.role)=upper(coalesce(v_role,'USER')) and p.permission=_permission and p.allowed=true);
end $$;

-- DICOM read access follows the same paid entitlement as write access.
drop policy if exists dicom_objects_read on storage.objects;
create policy dicom_objects_read on storage.objects for select to authenticated using (
  bucket_id='dicom-files' and exists(
    select 1 from public.clinics c
    where c.id::text=split_part(name,'/',1) and public.user_can_use_company_session(c.id,'radiology')
  )
);

drop policy if exists radiology_studies_member_read on public.radiology_studies;
create policy radiology_studies_member_read on public.radiology_studies for select to authenticated using (
  public.user_can_use_company_session(clinic_id,'radiology')
);

grant execute on function public.has_role(uuid,public.app_role),public.has_any_role(uuid,public.app_role[]),public.is_cadista(uuid),public.is_staff(uuid),public.current_user_is_admin(),public.can_access_case(uuid),public.can_access_patient(uuid),public.clinical_permission_allowed(uuid,text) to authenticated;

-- ===== 20260909144500_ipo_internal_full_access_032.sql =====

-- DentalFlow 0.3.2 — IPO internal account compatibility and full-access invariants.
--
-- Goals:
-- 1. Preserve the existing IPO company, users, roles and operational data.
-- 2. Make IPO permanently equivalent to the most complete company plan.
-- 3. Ensure ordinary companies can never inherit the internal IPO entitlement.
-- 4. Keep legacy modules_enabled in sync with the new company_sessions model.

alter table public.clinics
  add column if not exists billing_exempt boolean not null default false;

-- Only the pre-existing Instituto Praia account is promoted to internal full access.
-- New companies must never receive this flag automatically.
update public.clinics
set billing_exempt = true,
    company_type = 'IPO'
where company_type = 'IPO'
  and name ilike '%Instituto Praia%';

-- Defensive cleanup for any ordinary company accidentally created as IPO by an
-- intermediate 0.3.2 function before this migration is applied.
update public.clinics
set company_type = 'COMPANY'
where company_type = 'IPO'
  and billing_exempt = false;

create or replace function public.is_internal_full_access_company(_clinic_id uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.clinics c
    where c.id=_clinic_id and c.billing_exempt=true
  )
$$;

create or replace function public.company_has_operational_access(_clinic_id uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_internal_full_access_company(_clinic_id)
    or coalesce((
      select public.subscription_access_mode(s.status,s.current_period_end,s.grace_until)='full'
      from public.account_subscriptions s
      where s.clinic_id=_clinic_id
      order by (s.status<>'canceled') desc,s.created_at desc
      limit 1
    ),false)
$$;

-- Compatibility bridge: company_sessions is authoritative for the new Hub, but
-- existing routes still read clinics.modules_enabled. Preserve unrelated legacy
-- modules (e.g. financial) while mirroring Laboratory/Clinic/Radiology sessions.
create or replace function public.sync_company_legacy_modules(_clinic_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
declare
  extras text[];
  session_modules text[];
begin
  select coalesce(array_agg(distinct lower(m)),'{}'::text[])
    into extras
  from public.clinics c
  cross join lateral unnest(coalesce(c.modules_enabled,'{}'::text[])) m
  where c.id=_clinic_id
    and lower(m) not in ('laboratory','laboratorio','laboratório','lab','clinical','clinic','clinica','clínica','radiology','radiologia','imaging','image');

  select coalesce(array_agg(distinct case s.session_type
      when 'laboratory' then 'laboratory'
      when 'clinic' then 'clinical'
      when 'radiology' then 'radiology'
      else null end) filter (where s.status='active'),'{}'::text[])
    into session_modules
  from public.company_sessions s
  where s.clinic_id=_clinic_id;

  update public.clinics
  set modules_enabled=(
    select coalesce(array_agg(distinct x order by x),'{}'::text[])
    from unnest(coalesce(extras,'{}'::text[]) || coalesce(session_modules,'{}'::text[])) x
    where x is not null and x<>''
  )
  where id=_clinic_id;
end $$;

-- Preserve the legacy IPO member identities. No password/account is recreated;
-- missing company membership rows are simply backfilled around the existing users.
update public.profiles p
set account_type=case
      when coalesce(p.is_default_admin,false) or upper(coalesce(p.role,'')) in ('CEO','ADMIN') then 'company_admin'
      else 'company_member'
    end,
    profession_type=coalesce(p.profession_type,p.account_subtype,p.role),
    updated_at=now()
from public.clinics c
where p.clinic_id=c.id and c.billing_exempt=true;

insert into public.clinic_members(
  clinic_id,user_id,role,status,invited_by,decided_by,decided_at,access_source
)
select p.clinic_id,p.id,coalesce(p.role,'USER'),'active',c.owner_id,c.owner_id,now(),'company_seat'
from public.profiles p
join public.clinics c on c.id=p.clinic_id
where c.billing_exempt=true
on conflict(clinic_id,user_id) do update set
  access_source='company_seat';

-- IPO always owns the complete session set. Existing non-session modules stay intact.
insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
select c.id,s,'active','company'
from public.clinics c
cross join unnest(array['laboratory','clinic','radiology']::text[]) s
where c.billing_exempt=true
on conflict(clinic_id,session_type) do update set
  status='active',sharing_mode='company',updated_at=now();

-- Normalize/create the IPO subscription without touching patient/case/file data.
update public.account_subscriptions s
set scope_type='company',
    user_id=null,
    plan_code='company_advanced',
    status='active',
    current_period_start=coalesce(s.current_period_start,now()),
    current_period_end='9999-12-31 23:59:59+00'::timestamptz,
    grace_until=null,
    canceled_at=null,
    billing_provider='internal_override',
    metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object('internal_full_access',true,'account','IPO','version','0.3.2'),
    updated_at=now()
from public.clinics c
where s.clinic_id=c.id and c.billing_exempt=true and s.status<>'canceled';

insert into public.account_subscriptions(
  scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,metadata
)
select 'company',c.id,'company_advanced','active',1,now(),'9999-12-31 23:59:59+00'::timestamptz,'internal_override',
       jsonb_build_object('internal_full_access',true,'account','IPO','version','0.3.2')
from public.clinics c
where c.billing_exempt=true
  and not exists(select 1 from public.account_subscriptions s where s.clinic_id=c.id and s.status<>'canceled');

update public.clinics
set storage_limit_bytes=greatest(storage_limit_bytes,536870912000)
where billing_exempt=true;

select public.sync_company_legacy_modules(c.id)
from public.clinics c
where c.billing_exempt=true;

-- Even service-side billing state updates cannot accidentally downgrade an
-- internal account. This trigger is intentionally narrow: it only acts when the
-- company has billing_exempt=true.
create or replace function public.protect_internal_subscription()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  protected_clinic uuid;
begin
  protected_clinic:=coalesce(new.clinic_id,old.clinic_id);
  if public.is_internal_full_access_company(protected_clinic) then
    if tg_op='UPDATE' then new.clinic_id:=old.clinic_id; end if;
    new.scope_type:='company';
    new.user_id:=null;
    new.plan_code:='company_advanced';
    new.status:='active';
    new.current_period_start:=coalesce(old.current_period_start,new.current_period_start,now());
    new.current_period_end:='9999-12-31 23:59:59+00'::timestamptz;
    new.grace_until:=null;
    new.canceled_at:=null;
    new.billing_provider:='internal_override';
    new.metadata:=coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('internal_full_access',true,'account','IPO');
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_internal_subscription on public.account_subscriptions;
create trigger trg_protect_internal_subscription
before insert or update on public.account_subscriptions
for each row execute function public.protect_internal_subscription();

create or replace function public.prevent_internal_subscription_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.is_internal_full_access_company(old.clinic_id) then return null; end if;
  return old;
end $$;

drop trigger if exists trg_prevent_internal_subscription_delete on public.account_subscriptions;
create trigger trg_prevent_internal_subscription_delete
before delete on public.account_subscriptions
for each row execute function public.prevent_internal_subscription_delete();

-- Protect the internal company marker, complete modules and minimum storage from
-- ordinary clinic updates. Existing name/kind/settings remain editable.
create or replace function public.protect_internal_company_entitlements()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.billing_exempt=true then
    new.billing_exempt:=true;
    new.company_type:='IPO';
    new.storage_limit_bytes:=greatest(coalesce(new.storage_limit_bytes,0),536870912000);
    new.modules_enabled:=(
      select array_agg(distinct x order by x)
      from unnest(coalesce(new.modules_enabled,'{}'::text[]) || array['laboratory','clinical','radiology']::text[]) x
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_internal_company_entitlements on public.clinics;
create trigger trg_protect_internal_company_entitlements
before update on public.clinics
for each row execute function public.protect_internal_company_entitlements();

-- Snapshot reports the permanent full entitlement for IPO but keeps the exact
-- same JSON shape consumed by Web/Desktop clients.
create or replace function public.company_subscription_snapshot(_clinic_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  allowed boolean;
  internal boolean;
begin
  select exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or public.active_company_member(_clinic_id,auth.uid())
      or exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.clinic_id=_clinic_id)
    into allowed;
  if not allowed then return null; end if;

  internal:=public.is_internal_full_access_company(_clinic_id);
  select * into s from public.account_subscriptions
   where clinic_id=_clinic_id and status<>'canceled' order by created_at desc limit 1;
  if s.id is null then
    select * into s from public.account_subscriptions where clinic_id=_clinic_id order by created_at desc limit 1;
  end if;
  if s.id is null then return null; end if;
  select * into p from public.billing_plans where code=case when internal then 'company_advanced' else s.plan_code end;

  return jsonb_build_object(
    'subscription_id',s.id,'scope','company','plan_code',p.code,'plan_name',p.name,
    'status',case when internal then 'active' else s.status end,
    'access_mode',case when internal then 'full' else public.subscription_access_mode(s.status,s.current_period_end,s.grace_until) end,
    'billing_day',s.billing_day,
    'current_period_end',case when internal then '9999-12-31 23:59:59+00'::timestamptz else s.current_period_end end,
    'grace_until',case when internal then null else s.grace_until end,
    'monthly_price_cents',p.monthly_price_cents,'currency',p.currency,
    'max_sessions',p.max_sessions,'max_members',p.max_members,'storage_bytes',p.storage_bytes,'features',p.features,
    'internal_full_access',internal,
    'sessions',coalesce((select jsonb_agg(cs.session_type order by cs.session_type) from public.company_sessions cs where cs.clinic_id=_clinic_id and cs.status='active'),'[]'::jsonb)
  );
end $$;

-- IPO session selection is immutable/full; ordinary companies keep plan limits.
create or replace function public.configure_company_sessions(p_clinic_id uuid,p_session_types text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  max_allowed integer;
  normalized text[];
  is_manager boolean;
begin
  select exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.status in ('active','accepted') and upper(m.role) in ('CEO','ADMIN'))
    into is_manager;
  if not is_manager then raise exception 'Sem permissão para configurar os ambientes.'; end if;

  if public.is_internal_full_access_company(p_clinic_id) then
    insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
    select p_clinic_id,x,'active','company' from unnest(array['laboratory','clinic','radiology']::text[]) x
    on conflict(clinic_id,session_type) do update set status='active',sharing_mode='company',updated_at=now();
    perform public.sync_company_legacy_modules(p_clinic_id);
    return public.company_subscription_snapshot(p_clinic_id);
  end if;

  select bp.max_sessions into max_allowed
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=p_clinic_id and s.status<>'canceled'
  order by s.created_at desc limit 1;
  if max_allowed is null then raise exception 'Plano empresarial não encontrado.'; end if;

  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into normalized
  from unnest(coalesce(p_session_types,'{}'::text[])) x
  where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(normalized)=0 then raise exception 'Selecione ao menos um ambiente.'; end if;
  if cardinality(normalized)>max_allowed then raise exception 'Seu plano permite no máximo % ambiente(s).',max_allowed; end if;

  update public.company_sessions set status='disabled' where clinic_id=p_clinic_id and not(session_type=any(normalized));
  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select p_clinic_id,x,'active',case when max_allowed>1 then 'company' else 'isolated' end from unnest(normalized) x
  on conflict(clinic_id,session_type) do update set status='active',sharing_mode=excluded.sharing_mode,updated_at=now();
  perform public.sync_company_legacy_modules(p_clinic_id);
  return public.company_subscription_snapshot(p_clinic_id);
end $$;

-- Correct the intermediate function that tagged every new company as IPO.
create or replace function public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text,
  p_plan_code text default 'company_initial',
  p_session_types text[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  cid uuid;
  plan public.billing_plans%rowtype;
  sessions text[];
  sub_id uuid;
  checkout jsonb;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_name,'')))<2 then return jsonb_build_object('success',false,'error','Informe o nome da empresa.'); end if;
  select * into plan from public.billing_plans where code=p_plan_code and account_scope='company' and is_active;
  if plan.code is null then return jsonb_build_object('success',false,'error','Plano empresarial inválido.'); end if;
  if exists(select 1 from public.clinics where owner_id=uid) then return jsonb_build_object('success',false,'error','Esta conta já possui uma empresa.'); end if;

  sessions:=coalesce(p_session_types,array[case when lower(coalesce(p_kind,'')) in ('consultorio','clinica','clinic') then 'clinic' when lower(coalesce(p_kind,'')) in ('radiologia','radiology') then 'radiology' else 'laboratory' end]);
  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into sessions
  from unnest(sessions) x where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(sessions)=0 or cardinality(sessions)>plan.max_sessions then
    return jsonb_build_object('success',false,'error','Quantidade de ambientes incompatível com o plano.');
  end if;

  insert into public.clinics(name,kind,company_type,owner_id,modules_enabled,billing_exempt)
  values(trim(p_name),lower(coalesce(p_kind,'empresa')),'COMPANY',uid,'{}'::text[],false)
  returning id into cid;

  insert into public.profiles(id,full_name,role,account_subtype,account_type,is_default_admin,clinic_id)
  values(uid,nullif(trim(p_full_name),''),'CEO','CEO','company_admin',true,cid)
  on conflict(id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),role='CEO',account_subtype='CEO',account_type='company_admin',is_default_admin=true,clinic_id=cid,updated_at=now();

  insert into public.clinic_members(clinic_id,user_id,role,status,invited_by,decided_by,decided_at,access_source)
  values(cid,uid,'CEO','active',uid,uid,now(),'company_seat')
  on conflict(clinic_id,user_id) do nothing;

  insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
  values('company',cid,plan.code,'pending_checkout',least(28,extract(day from now())::int)) returning id into sub_id;

  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select cid,x,'active',case when plan.max_sessions>1 then 'company' else 'isolated' end from unnest(sessions) x;
  perform public.sync_company_legacy_modules(cid);

  checkout:=public.create_checkout_intent(plan.code,cid,sessions);
  return jsonb_build_object('success',true,'clinic_id',cid,'plan_code',plan.code,'checkout',checkout);
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

-- Sandbox non-payment must never suspend IPO.
create or replace function public.billing_test_simulate_nonpayment(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare allowed boolean; sub_id uuid;
begin
  select exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()) into allowed;
  if not allowed then return jsonb_build_object('success',false,'error','Modo de teste não autorizado.'); end if;
  if not exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid()) then
    return jsonb_build_object('success',false,'error','Somente o administrador da empresa pode simular cobrança.');
  end if;
  if public.is_internal_full_access_company(p_clinic_id) then
    return jsonb_build_object('success',false,'error','A conta interna IPO possui acesso permanente e não pode ser suspensa pelo sandbox.');
  end if;
  select id into sub_id from public.account_subscriptions where clinic_id=p_clinic_id and status<>'canceled' order by created_at desc limit 1;
  if sub_id is null then return jsonb_build_object('success',false,'error','Assinatura não encontrada.'); end if;
  update public.account_subscriptions set status='past_due',current_period_end=now()-interval '1 second',grace_until=null,updated_at=now() where id=sub_id;
  return jsonb_build_object('success',true,'context',public.my_subscription_context());
exception when others then return jsonb_build_object('success',false,'error',sqlerrm); end $$;

grant execute on function public.is_internal_full_access_company(uuid),public.company_has_operational_access(uuid),public.sync_company_legacy_modules(uuid),public.configure_company_sessions(uuid,text[]),public.create_company_account(text,text,text,text,text[]),public.billing_test_simulate_nonpayment(uuid) to authenticated;

-- ===== 20260909145500_ipo_entitlement_hardening_032.sql =====

-- DentalFlow 0.3.2 — harden the permanent IPO entitlement against every billing path.

-- Safe for both INSERT and UPDATE; never dereference OLD during INSERT.
create or replace function public.protect_internal_subscription()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  protected_clinic uuid;
  previous_start timestamptz;
begin
  if tg_op='INSERT' then
    protected_clinic:=new.clinic_id;
    previous_start:=null;
  else
    protected_clinic:=coalesce(new.clinic_id,old.clinic_id);
    previous_start:=old.current_period_start;
  end if;

  if public.is_internal_full_access_company(protected_clinic) then
    if tg_op='UPDATE' then new.clinic_id:=old.clinic_id; end if;
    new.scope_type:='company';
    new.user_id:=null;
    new.plan_code:='company_advanced';
    new.status:='active';
    new.current_period_start:=coalesce(previous_start,new.current_period_start,now());
    new.current_period_end:='9999-12-31 23:59:59+00'::timestamptz;
    new.grace_until:=null;
    new.canceled_at:=null;
    new.billing_provider:='internal_override';
    new.metadata:=coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('internal_full_access',true,'account','IPO');
  end if;
  return new;
end $$;

-- Billing-provider code updates company_sessions directly after payment. These
-- triggers ensure no checkout, downgrade or sandbox call can disable an IPO area.
create or replace function public.protect_internal_company_session()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  target_clinic uuid;
begin
  if tg_op='INSERT' then target_clinic:=new.clinic_id;
  else target_clinic:=coalesce(new.clinic_id,old.clinic_id);
  end if;

  if public.is_internal_full_access_company(target_clinic) then
    if tg_op='UPDATE' then
      new.clinic_id:=old.clinic_id;
      new.session_type:=old.session_type;
    end if;
    new.status:='active';
    new.sharing_mode:='company';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_internal_company_session on public.company_sessions;
create trigger trg_protect_internal_company_session
before insert or update on public.company_sessions
for each row execute function public.protect_internal_company_session();

create or replace function public.prevent_internal_company_session_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.is_internal_full_access_company(old.clinic_id) then return null; end if;
  return old;
end $$;

drop trigger if exists trg_prevent_internal_company_session_delete on public.company_sessions;
create trigger trg_prevent_internal_company_session_delete
before delete on public.company_sessions
for each row execute function public.prevent_internal_company_session_delete();

-- Re-assert all three sessions after trigger installation.
insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
select c.id,s,'active','company'
from public.clinics c
cross join unnest(array['laboratory','clinic','radiology']::text[]) s
where c.billing_exempt=true
on conflict(clinic_id,session_type) do update set
  status='active',sharing_mode='company',updated_at=now();

-- Test checkout approval is explicitly denied for internal accounts. The normal
-- product never shows the checkout to IPO, but this closes the direct RPC path too.
create or replace function public.billing_test_mark_checkout_paid(p_checkout_intent_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  allowed boolean;
  intent public.checkout_intents%rowtype;
  result jsonb;
begin
  select exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()) into allowed;
  if not allowed then return jsonb_build_object('success',false,'error','Modo de teste não autorizado.'); end if;

  select * into intent from public.checkout_intents where id=p_checkout_intent_id and user_id=auth.uid();
  if intent.id is null then return jsonb_build_object('success',false,'error','Checkout não encontrado.'); end if;
  if public.is_internal_full_access_company(intent.clinic_id) then
    return jsonb_build_object('success',false,'error','A conta interna IPO já possui acesso completo permanente e não participa da cobrança.');
  end if;

  result:=public.billing_apply_checkout_paid(
    intent.id,'sandbox','sandbox-'||intent.id::text,null,'sandbox-sub-'||intent.subscription_id::text,
    now(),now()+interval '30 days'
  );
  return jsonb_build_object(
    'success',true,
    'subscription_id',intent.subscription_id,
    'current_period_end',result->>'current_period_end',
    'context',public.my_subscription_context()
  );
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

grant execute on function public.billing_test_mark_checkout_paid(uuid) to authenticated;

-- Diagnostic used during rollout and future migrations. It never mutates data.
create or replace function public.ipo_internal_invariant_report()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'clinic_id',c.id,
    'name',c.name,
    'billing_exempt',c.billing_exempt,
    'storage_ok',c.storage_limit_bytes>=536870912000,
    'subscription_ok',exists(
      select 1 from public.account_subscriptions s
      where s.clinic_id=c.id and s.status='active' and s.plan_code='company_advanced'
        and s.current_period_end>now()+interval '10 years'
    ),
    'sessions_ok',(select count(*) from public.company_sessions cs where cs.clinic_id=c.id and cs.status='active' and cs.session_type in ('laboratory','clinic','radiology'))=3,
    'legacy_modules_ok',c.modules_enabled@>array['laboratory','clinical','radiology']::text[],
    'profiles',(select count(*) from public.profiles p where p.clinic_id=c.id),
    'members',(select count(*) from public.clinic_members m where m.clinic_id=c.id and m.status in ('active','accepted'))
  )),'[]'::jsonb)
  from public.clinics c
  where c.billing_exempt=true
$$;

revoke all on function public.ipo_internal_invariant_report() from public,anon,authenticated;
grant execute on function public.ipo_internal_invariant_report() to service_role;

-- ===== 20260909150000_ipo_billing_exclusion_032.sql =====

-- DentalFlow 0.3.2 — IPO never enters a commercial checkout lifecycle.
-- Ordinary companies keep the same provider-agnostic checkout contract.

create or replace function public.create_checkout_intent(
  p_plan_code text,
  p_clinic_id uuid,
  p_session_types text[] default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  plan public.billing_plans%rowtype;
  sub public.account_subscriptions%rowtype;
  intent public.checkout_intents%rowtype;
  is_manager boolean;
  requested text[];
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if p_clinic_id is null then raise exception 'Empresa inválida.'; end if;
  if public.is_internal_full_access_company(p_clinic_id) then
    raise exception 'A conta interna IPO possui acesso completo permanente e não participa da cobrança.';
  end if;

  select * into plan from public.billing_plans
  where code=p_plan_code and account_scope='company' and is_active;
  if plan.code is null then raise exception 'Plano empresarial inválido.'; end if;

  select exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.status in ('active','accepted') and upper(m.role) in ('CEO','ADMIN'))
  into is_manager;
  if not is_manager then raise exception 'Sem permissão para alterar a assinatura.'; end if;

  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into requested
  from unnest(coalesce(p_session_types,'{}'::text[])) x
  where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(requested)>plan.max_sessions then
    raise exception 'O plano selecionado permite no máximo % ambiente(s).',plan.max_sessions;
  end if;

  select * into sub from public.account_subscriptions
  where clinic_id=p_clinic_id and status<>'canceled'
  order by created_at desc limit 1;

  if sub.id is null then
    insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
    values('company',p_clinic_id,p_plan_code,'pending_checkout',least(28,extract(day from now())::int))
    returning * into sub;
  elsif sub.status='pending_checkout' then
    update public.account_subscriptions set plan_code=p_plan_code,updated_at=now()
    where id=sub.id returning * into sub;
  end if;

  update public.checkout_intents
  set status='expired',updated_at=now()
  where user_id=auth.uid() and clinic_id=p_clinic_id and status='pending' and expires_at<now();

  insert into public.checkout_intents(
    user_id,clinic_id,subscription_id,plan_code,amount_cents,currency,status,metadata
  ) values(
    auth.uid(),p_clinic_id,sub.id,p_plan_code,plan.monthly_price_cents,plan.currency,'pending',
    jsonb_build_object('requested_sessions',coalesce(to_jsonb(requested),'[]'::jsonb),'billing_version','0.3.2')
  ) returning * into intent;

  return jsonb_build_object(
    'checkout_intent_id',intent.id,
    'subscription_id',sub.id,
    'plan_code',plan.code,
    'plan_name',plan.name,
    'amount_cents',plan.monthly_price_cents,
    'currency',plan.currency,
    'status',intent.status,
    'billing_mode','live'
  );
end $$;

drop function if exists public.create_checkout_intent(text,uuid);
create function public.create_checkout_intent(p_plan_code text,p_clinic_id uuid)
returns jsonb language sql security definer set search_path=public as $$
  select public.create_checkout_intent(p_plan_code,p_clinic_id,null::text[])
$$;

grant execute on function public.create_checkout_intent(text,uuid,text[]) to authenticated;
grant execute on function public.create_checkout_intent(text,uuid) to authenticated;

-- ===== 20260919213000_saas_contract_recovery_stage01.sql =====

-- DentalFlow SaaS — Stage 01: canonical billing contract and provider identity.
--
-- This migration does not contact Asaas and does not activate subscriptions.
-- It prepares an environment-aware, idempotent contract for the provider adapter.

alter table public.account_subscriptions
  add column if not exists provider_environment text,
  add column if not exists billing_cycle text not null default 'MONTHLY';

alter table public.checkout_intents
  add column if not exists provider_environment text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_payment_url text;

alter table public.billing_payments
  add column if not exists provider_environment text;

alter table public.billing_events
  add column if not exists provider_environment text;

-- Existing records predate the environment namespace. The only provider-backed
-- flow before this migration was the controlled sandbox; IPO uses an internal
-- override. No record is promoted to Production by inference.
update public.account_subscriptions
set provider_environment = case
  when billing_provider = 'internal_override' then 'internal'
  else 'sandbox'
end
where provider_environment is null
  and billing_provider is not null
  and (external_customer_id is not null or external_subscription_id is not null);

update public.checkout_intents
set provider_environment = case
  when billing_provider = 'internal_override' then 'internal'
  else 'sandbox'
end
where provider_environment is null
  and billing_provider is not null
  and (provider_checkout_id is not null or provider_payment_id is not null);

update public.billing_payments
set provider_environment = case
  when provider = 'internal_override' then 'internal'
  else 'sandbox'
end
where provider_environment is null
  and provider is not null
  and provider_payment_id is not null;

update public.billing_events
set provider_environment = case
  when provider = 'internal_override' then 'internal'
  else 'sandbox'
end
where provider_environment is null;

alter table public.billing_events
  alter column provider_environment drop default,
  alter column provider_environment set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_subscriptions'::regclass
      and conname = 'account_subscriptions_provider_environment_check'
  ) then
    alter table public.account_subscriptions
      add constraint account_subscriptions_provider_environment_check
      check (provider_environment is null or provider_environment in ('sandbox','production','internal'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_subscriptions'::regclass
      and conname = 'account_subscriptions_billing_cycle_check'
  ) then
    alter table public.account_subscriptions
      add constraint account_subscriptions_billing_cycle_check
      check (billing_cycle = 'MONTHLY');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_subscriptions'::regclass
      and conname = 'account_subscriptions_external_identity_check'
  ) then
    alter table public.account_subscriptions
      add constraint account_subscriptions_external_identity_check
      check (
        (external_customer_id is null and external_subscription_id is null)
        or (billing_provider is not null and provider_environment is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checkout_intents'::regclass
      and conname = 'checkout_intents_provider_environment_check'
  ) then
    alter table public.checkout_intents
      add constraint checkout_intents_provider_environment_check
      check (provider_environment is null or provider_environment in ('sandbox','production','internal'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checkout_intents'::regclass
      and conname = 'checkout_intents_external_identity_check'
  ) then
    alter table public.checkout_intents
      add constraint checkout_intents_external_identity_check
      check (
        (provider_checkout_id is null and provider_payment_id is null and provider_payment_url is null)
        or (billing_provider is not null and provider_environment is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_payments'::regclass
      and conname = 'billing_payments_provider_environment_check'
  ) then
    alter table public.billing_payments
      add constraint billing_payments_provider_environment_check
      check (provider_environment is null or provider_environment in ('sandbox','production','internal'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_payments'::regclass
      and conname = 'billing_payments_external_identity_check'
  ) then
    alter table public.billing_payments
      add constraint billing_payments_external_identity_check
      check (
        provider_payment_id is null
        or (provider is not null and provider_environment is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_events'::regclass
      and conname = 'billing_events_provider_environment_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_provider_environment_check
      check (provider_environment in ('sandbox','production','internal'));
  end if;
end $$;

-- Provider IDs are namespaced by provider + environment. Customer IDs are not
-- unique on subscriptions because a company may have multiple historical
-- subscriptions attached to the same canonical Asaas customer.
alter table public.billing_events
  drop constraint if exists billing_events_provider_provider_event_id_key;

alter table public.billing_payments
  drop constraint if exists billing_payments_provider_provider_payment_id_key;

create unique index if not exists account_subscriptions_provider_subscription_uidx
  on public.account_subscriptions (billing_provider, provider_environment, external_subscription_id)
  where external_subscription_id is not null;

create unique index if not exists checkout_intents_provider_checkout_uidx
  on public.checkout_intents (billing_provider, provider_environment, provider_checkout_id)
  where provider_checkout_id is not null;

create unique index if not exists checkout_intents_provider_payment_uidx
  on public.checkout_intents (billing_provider, provider_environment, provider_payment_id)
  where provider_payment_id is not null;

create unique index if not exists billing_payments_provider_payment_uidx
  on public.billing_payments (provider, provider_environment, provider_payment_id)
  where provider_payment_id is not null;

create unique index if not exists billing_events_provider_event_uidx
  on public.billing_events (provider, provider_environment, provider_event_id);

create or replace function public.billing_valid_br_tax_id(p_value text)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_digits text := regexp_replace(p_value, '[^0-9]', '', 'g');
  v_sum integer := 0;
  v_first integer;
  v_second integer;
  v_weights integer[];
  i integer;
begin
  if char_length(v_digits) not in (11, 14)
     or v_digits = repeat(substr(v_digits, 1, 1), char_length(v_digits)) then
    return false;
  end if;

  if char_length(v_digits) = 11 then
    for i in 1..9 loop
      v_sum := v_sum + substr(v_digits, i, 1)::integer * (11 - i);
    end loop;
    v_first := case when (v_sum % 11) < 2 then 0 else 11 - (v_sum % 11) end;

    v_sum := 0;
    for i in 1..10 loop
      v_sum := v_sum + substr(v_digits, i, 1)::integer * (12 - i);
    end loop;
    v_second := case when (v_sum % 11) < 2 then 0 else 11 - (v_sum % 11) end;
  else
    v_weights := array[5,4,3,2,9,8,7,6,5,4,3,2];
    for i in 1..12 loop
      v_sum := v_sum + substr(v_digits, i, 1)::integer * v_weights[i];
    end loop;
    v_first := case when (v_sum % 11) < 2 then 0 else 11 - (v_sum % 11) end;

    v_sum := 0;
    v_weights := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
    for i in 1..13 loop
      v_sum := v_sum + substr(v_digits, i, 1)::integer * v_weights[i];
    end loop;
    v_second := case when (v_sum % 11) < 2 then 0 else 11 - (v_sum % 11) end;
  end if;

  return substr(v_digits, char_length(v_digits) - 1, 1)::integer = v_first
     and substr(v_digits, char_length(v_digits), 1)::integer = v_second;
end;
$$;

revoke all on function public.billing_valid_br_tax_id(text)
  from public, anon, authenticated;
grant execute on function public.billing_valid_br_tax_id(text)
  to service_role;

create table if not exists public.company_billing_profiles (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  legal_name text not null,
  tax_id_type text not null,
  tax_id_digits text not null,
  billing_email text not null,
  billing_phone_digits text not null,
  postal_code_digits text not null,
  address_line text not null,
  address_number text not null,
  address_complement text,
  district text not null,
  city text not null,
  state text not null,
  country_code text not null default 'BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_billing_profiles_legal_name_check
    check (char_length(trim(legal_name)) between 2 and 160),
  constraint company_billing_profiles_tax_id_type_check
    check (tax_id_type in ('CPF','CNPJ')),
  constraint company_billing_profiles_tax_id_digits_check
    check (
      tax_id_digits ~ '^[0-9]+$'
      and ((tax_id_type = 'CPF' and char_length(tax_id_digits) = 11)
        or (tax_id_type = 'CNPJ' and char_length(tax_id_digits) = 14))
      and public.billing_valid_br_tax_id(tax_id_digits)
    ),
  constraint company_billing_profiles_email_check
    check (
      billing_email = lower(trim(billing_email))
      and billing_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint company_billing_profiles_phone_check
    check (billing_phone_digits ~ '^[0-9]{10,13}$'),
  constraint company_billing_profiles_postal_code_check
    check (postal_code_digits ~ '^[0-9]{8}$'),
  constraint company_billing_profiles_address_check
    check (
      char_length(trim(address_line)) between 2 and 160
      and char_length(trim(address_number)) between 1 and 30
      and char_length(trim(district)) between 2 and 100
      and char_length(trim(city)) between 2 and 100
    ),
  constraint company_billing_profiles_state_check
    check (state ~ '^[A-Z]{2}$'),
  constraint company_billing_profiles_country_check
    check (country_code = 'BR')
);

create table if not exists public.billing_provider_customers (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null check (provider = 'asaas'),
  provider_environment text not null check (provider_environment in ('sandbox','production')),
  provider_customer_id text not null check (provider_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  profile_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, provider, provider_environment)
);

create unique index if not exists billing_provider_customers_provider_customer_uidx
  on public.billing_provider_customers (provider, provider_environment, provider_customer_id);

alter table public.company_billing_profiles enable row level security;
alter table public.billing_provider_customers enable row level security;

-- Deliberately no client table policy. Fiscal identifiers are available only
-- through the masked manager RPC below; the provider adapter uses service_role.
revoke all on table public.company_billing_profiles from public, anon, authenticated;
revoke all on table public.billing_provider_customers from public, anon, authenticated;
grant all on table public.company_billing_profiles to service_role;
grant all on table public.billing_provider_customers to service_role;

create or replace function public.billing_touch_company_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_company_billing_profiles_touch on public.company_billing_profiles;
create trigger trg_company_billing_profiles_touch
before update on public.company_billing_profiles
for each row execute function public.billing_touch_company_profile_updated_at();

drop trigger if exists trg_billing_provider_customers_touch on public.billing_provider_customers;
create trigger trg_billing_provider_customers_touch
before update on public.billing_provider_customers
for each row execute function public.billing_touch_company_profile_updated_at();

create or replace function public.billing_user_can_manage_company(
  p_clinic_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.clinics c
    where c.id = p_clinic_id
      and (
        c.owner_id = p_user_id
        or exists (
          select 1
          from public.clinic_members m
          where m.clinic_id = c.id
            and m.user_id = p_user_id
            and m.status in ('active','accepted')
            and upper(m.role) in ('CEO','ADMIN')
        )
      )
  )
$$;

revoke all on function public.billing_user_can_manage_company(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.billing_user_can_manage_company(uuid,uuid)
  to service_role;

create or replace function public.billing_get_company_profile(p_clinic_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.company_billing_profiles%rowtype;
begin
  if auth.uid() is null
     or not public.billing_user_can_manage_company(p_clinic_id, auth.uid()) then
    raise exception 'BILLING_PROFILE_FORBIDDEN';
  end if;

  select * into v_profile
  from public.company_billing_profiles
  where clinic_id = p_clinic_id;

  if v_profile.clinic_id is null then
    return jsonb_build_object('configured', false, 'clinic_id', p_clinic_id);
  end if;

  return jsonb_build_object(
    'configured', true,
    'clinic_id', v_profile.clinic_id,
    'legal_name', v_profile.legal_name,
    'tax_id_type', v_profile.tax_id_type,
    'tax_id_masked', case
      when v_profile.tax_id_type = 'CPF' then '***.***.***-' || right(v_profile.tax_id_digits, 2)
      else '**.***.***/****-' || right(v_profile.tax_id_digits, 2)
    end,
    'billing_email', v_profile.billing_email,
    'billing_phone_digits', v_profile.billing_phone_digits,
    'postal_code_digits', v_profile.postal_code_digits,
    'address_line', v_profile.address_line,
    'address_number', v_profile.address_number,
    'address_complement', v_profile.address_complement,
    'district', v_profile.district,
    'city', v_profile.city,
    'state', v_profile.state,
    'country_code', v_profile.country_code,
    'provider_bound_sandbox', exists (
      select 1 from public.billing_provider_customers pc
      where pc.clinic_id = p_clinic_id
        and pc.provider = 'asaas'
        and pc.provider_environment = 'sandbox'
    ),
    'provider_bound_production', exists (
      select 1 from public.billing_provider_customers pc
      where pc.clinic_id = p_clinic_id
        and pc.provider = 'asaas'
        and pc.provider_environment = 'production'
    ),
    'updated_at', v_profile.updated_at
  );
end;
$$;

create or replace function public.billing_upsert_company_profile(
  p_clinic_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_billing_email text,
  p_billing_phone text,
  p_postal_code text,
  p_address_line text,
  p_address_number text,
  p_address_complement text,
  p_district text,
  p_city text,
  p_state text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tax_id text := regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g');
  v_phone text := regexp_replace(coalesce(p_billing_phone, ''), '[^0-9]', '', 'g');
  v_postal_code text := regexp_replace(coalesce(p_postal_code, ''), '[^0-9]', '', 'g');
  v_email text := lower(trim(coalesce(p_billing_email, '')));
  v_state text := upper(trim(coalesce(p_state, '')));
  v_tax_id_type text;
begin
  if auth.uid() is null
     or not public.billing_user_can_manage_company(p_clinic_id, auth.uid()) then
    raise exception 'BILLING_PROFILE_FORBIDDEN';
  end if;

  if char_length(v_tax_id) = 11 then
    v_tax_id_type := 'CPF';
  elsif char_length(v_tax_id) = 14 then
    v_tax_id_type := 'CNPJ';
  else
    raise exception 'BILLING_PROFILE_INVALID_TAX_ID';
  end if;
  if not public.billing_valid_br_tax_id(v_tax_id) then
    raise exception 'BILLING_PROFILE_INVALID_TAX_ID';
  end if;

  if char_length(trim(coalesce(p_legal_name, ''))) not between 2 and 160 then
    raise exception 'BILLING_PROFILE_INVALID_LEGAL_NAME';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'BILLING_PROFILE_INVALID_EMAIL';
  end if;
  if v_phone !~ '^[0-9]{10,13}$' then
    raise exception 'BILLING_PROFILE_INVALID_PHONE';
  end if;
  if v_postal_code !~ '^[0-9]{8}$' then
    raise exception 'BILLING_PROFILE_INVALID_POSTAL_CODE';
  end if;
  if v_state !~ '^[A-Z]{2}$' then
    raise exception 'BILLING_PROFILE_INVALID_STATE';
  end if;

  insert into public.company_billing_profiles (
    clinic_id, legal_name, tax_id_type, tax_id_digits, billing_email,
    billing_phone_digits, postal_code_digits, address_line, address_number,
    address_complement, district, city, state, country_code
  ) values (
    p_clinic_id, trim(p_legal_name), v_tax_id_type, v_tax_id, v_email,
    v_phone, v_postal_code, trim(p_address_line), trim(p_address_number),
    nullif(trim(coalesce(p_address_complement, '')), ''), trim(p_district),
    trim(p_city), v_state, 'BR'
  )
  on conflict (clinic_id) do update set
    legal_name = excluded.legal_name,
    tax_id_type = excluded.tax_id_type,
    tax_id_digits = excluded.tax_id_digits,
    billing_email = excluded.billing_email,
    billing_phone_digits = excluded.billing_phone_digits,
    postal_code_digits = excluded.postal_code_digits,
    address_line = excluded.address_line,
    address_number = excluded.address_number,
    address_complement = excluded.address_complement,
    district = excluded.district,
    city = excluded.city,
    state = excluded.state,
    country_code = excluded.country_code,
    updated_at = now();

  update public.billing_provider_customers
  set profile_synced_at = null,
      updated_at = now()
  where clinic_id = p_clinic_id;

  return public.billing_get_company_profile(p_clinic_id);
end;
$$;

create or replace function public.billing_bind_asaas_customer(
  p_clinic_id uuid,
  p_provider_environment text,
  p_provider_customer_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_provider_environment not in ('sandbox','production') then
    raise exception 'BILLING_PROVIDER_INVALID_ENVIRONMENT';
  end if;
  if trim(coalesce(p_provider_customer_id, '')) !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'BILLING_PROVIDER_INVALID_CUSTOMER_ID';
  end if;

  if not exists (
    select 1 from public.company_billing_profiles where clinic_id = p_clinic_id
  ) then
    raise exception 'BILLING_PROFILE_REQUIRED';
  end if;

  insert into public.billing_provider_customers (
    clinic_id, provider, provider_environment, provider_customer_id,
    profile_synced_at
  ) values (
    p_clinic_id, 'asaas', p_provider_environment,
    trim(p_provider_customer_id), now()
  )
  on conflict (clinic_id, provider, provider_environment) do update set
    provider_customer_id = excluded.provider_customer_id,
    profile_synced_at = now(),
    updated_at = now();
end;
$$;

revoke all on function public.billing_get_company_profile(uuid)
  from public, anon;
revoke all on function public.billing_upsert_company_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
revoke all on function public.billing_bind_asaas_customer(uuid,text,text)
  from public, anon, authenticated;

grant execute on function public.billing_get_company_profile(uuid)
  to authenticated;
grant execute on function public.billing_upsert_company_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) to authenticated;
grant execute on function public.billing_bind_asaas_customer(uuid,text,text)
  to service_role;

comment on table public.company_billing_profiles is
  'Restricted fiscal profile for a billable company.';
comment on table public.billing_provider_customers is
  'Canonical provider customer identity, separated by company and Sandbox/Production environment.';
comment on column public.company_billing_profiles.tax_id_digits is
  'CPF/CNPJ digits. Never expose directly to browser clients; use the masked RPC.';
comment on column public.account_subscriptions.provider_environment is
  'Provider namespace: sandbox, production, or internal. Sandbox IDs must never be reused in Production.';

-- Compare enum roles as text so restored databases remain compatible with both
-- legacy lowercase and current uppercase specialist labels.
create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = _user_id
      and upper(ur.role::text) in (
        'ADMIN','DENTISTA','RECEPCIONISTA','AUXILIAR','PROTETICO','SOLICITANTE'
      )
      and p.clinic_id is not null
      and public.company_has_operational_access(p.clinic_id)
  )
$$;

revoke all on function public.is_staff(uuid) from public, anon;
grant execute on function public.is_staff(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ===== 20260718000001_zzz_self_heal_v2.sql =====

-- =====================================================================
-- SELF-HEAL v2 — idempotente. Roda depois de todo o restore.
-- Consolida ajustes recorrentes descobertos em restaurações reais para
-- não precisar corrigir manualmente após reconstruir o projeto do zip.
--
-- Cobre:
--   1. Coluna requirements (jsonb) em public.stages (novo sistema de
--      "exigir na etapa" com dropdown de tipos).
--   2. RPCs advance_case_workflow / return_case_workflow /
--      case_stage_requirement_blockers (fluxo com bloqueio por requisito).
--   3. Função export_backup + backend_schema_hash (botão "Backup Backend").
--   4. Coluna stock_items.type (texto livre) usada pelo dialog de estoque.
--   5. Tabela stock_item_custom_fields (campos personalizados dos itens).
--   6. Backfill: garantir clinic_id em profiles CEO/DR + criar clinics.
--   7. Skip email confirmation para o primeiro CEO cadastrado.
-- =====================================================================

-- 1) requirements em stages ---------------------------------------------
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migra flag legada para o novo formato quando ainda não houver requisitos
UPDATE public.stages
   SET requirements = jsonb_build_array(jsonb_build_object(
         'type', 'implant_components',
         'blocks_advance', 'true'))
 WHERE COALESCE(requires_implant_components, false) = true
   AND (requirements IS NULL OR jsonb_typeof(requirements) <> 'array' OR jsonb_array_length(requirements) = 0);

-- 2) stock_items.type + stock_item_custom_fields ------------------------
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS type text;

CREATE TABLE IF NOT EXISTS public.stock_item_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sicf_item ON public.stock_item_custom_fields(stock_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_custom_fields TO authenticated;
GRANT ALL ON public.stock_item_custom_fields TO service_role;
ALTER TABLE public.stock_item_custom_fields ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.stock_item_custom_fields'::regclass AND polname='sicf_staff_all') THEN
    CREATE POLICY sicf_staff_all ON public.stock_item_custom_fields
      FOR ALL TO authenticated
      USING (public.is_staff(auth.uid()))
      WITH CHECK (public.is_staff(auth.uid()));
  END IF;
END $$;

-- 3) RPCs de fluxo -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.case_stage_requirement_blockers(_case_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_case public.cases%ROWTYPE;
  v_requirements jsonb := '[]'::jsonb;
  v_req jsonb;
  v_type text;
  v_blocks boolean;
  v_blockers text[] := ARRAY[]::text[];
  v_implant_teeth integer[];
  v_missing_implants integer[];
BEGIN
  SELECT * INTO v_case FROM public.cases WHERE id = _case_id;
  IF NOT FOUND THEN RETURN ARRAY['Caso não encontrado']; END IF;

  SELECT COALESCE(s.requirements,'[]'::jsonb) INTO v_requirements FROM public.stages s WHERE s.id = v_case.current_stage_id;
  IF v_requirements IS NULL OR jsonb_typeof(v_requirements) <> 'array' THEN RETURN ARRAY[]::text[]; END IF;

  FOR v_req IN SELECT value FROM jsonb_array_elements(v_requirements) LOOP
    v_blocks := lower(COALESCE(v_req->>'blocks_advance','false')) = 'true';
    IF NOT v_blocks THEN CONTINUE; END IF;
    v_type := v_req->>'type';

    IF v_type = 'implant_components' THEN
      v_implant_teeth := COALESCE(v_case.implant_teeth, ARRAY[]::integer[]);
      IF COALESCE(array_length(v_implant_teeth,1),0) = 0 THEN CONTINUE; END IF;
      SELECT array_agg(t ORDER BY t) INTO v_missing_implants
        FROM unnest(v_implant_teeth) AS t
        WHERE NOT EXISTS (SELECT 1 FROM public.case_implant_teeth cit
                          WHERE cit.case_id=_case_id AND cit.tooth_fdi=t AND cit.reversed_at IS NULL);
      IF COALESCE(array_length(v_missing_implants,1),0) > 0 THEN
        v_blockers := array_append(v_blockers,
          'Apontar componente para dentes com implantes (' || array_to_string(v_missing_implants, ', ') || ')');
      END IF;
    ELSIF v_type = 'download_scans' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_activity ca
        WHERE ca.case_id=_case_id AND ca.kind='download' AND ca.metadata->>'kind'='scans')
      THEN v_blockers := array_append(v_blockers, 'Baixar arquivos da aba "Escaneamentos"'); END IF;
    ELSIF v_type = 'upload_models' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id=_case_id AND a.kind='model' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Modelos"'); END IF;
    ELSIF v_type = 'upload_fabrication' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id=_case_id AND a.kind='fabrication' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Confecção"'); END IF;
    ELSIF v_type = 'upload_html' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id=_case_id AND a.kind='exocad_html' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Html"'); END IF;
    ELSIF v_type = 'upload_gallery' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id=_case_id AND a.kind='gallery' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar imagem na aba "Galeria"'); END IF;
    END IF;
  END LOOP;
  RETURN v_blockers;
END $$;

-- 4) Backfill de clinic_id para CEO/DR ----------------------------------
DO $$
DECLARE r record; new_clinic uuid;
BEGIN
  FOR r IN SELECT id, role FROM public.profiles WHERE clinic_id IS NULL AND role IN ('CEO','DR') LOOP
    new_clinic := gen_random_uuid();
    UPDATE public.profiles SET clinic_id = new_clinic WHERE id = r.id;
  END LOOP;
END $$;

-- 5) handle_new_user cria clinic para o primeiro usuário ---------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_role text; v_full_name text; is_first boolean; v_clinic uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  v_role := COALESCE(new.raw_user_meta_data->>'role', CASE WHEN is_first THEN 'CEO' ELSE 'USER' END);
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  v_clinic := CASE WHEN is_first OR v_role IN ('CEO','DR') THEN gen_random_uuid() ELSE NULL END;
  INSERT INTO public.profiles (id, full_name, email, role, is_default_admin, clinic_id)
    VALUES (new.id, v_full_name, new.email, v_role, is_first, v_clinic)
    ON CONFLICT (id) DO NOTHING;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING;
    -- Skip email confirmation para o primeiro CEO
    UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
                          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = new.id;
  END IF;
  IF v_role = 'CADISTA' THEN INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id); END IF;
  RETURN new;
END $$;

-- 6) Re-executa hardening geral: GRANTs, EXECUTE em funções ------------
-- 6a) case_implant_teeth + RPCs register/remove ------------------------
CREATE TABLE IF NOT EXISTS public.case_implant_teeth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  tooth_fdi integer NOT NULL,
  implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE SET NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  qty numeric NOT NULL DEFAULT 1,
  reversed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cit_case ON public.case_implant_teeth(case_id) WHERE reversed_at IS NULL;
ALTER TABLE public.case_implant_teeth ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.case_implant_teeth'::regclass AND polname='cit_select') THEN
    CREATE POLICY cit_select ON public.case_implant_teeth FOR SELECT TO authenticated USING (public.can_access_case(case_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.case_implant_teeth'::regclass AND polname='cit_write') THEN
    CREATE POLICY cit_write ON public.case_implant_teeth FOR ALL TO authenticated
      USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_case_implant_tooth(_case_id uuid, _tooth_fdi integer, _stock_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_system uuid; v_id uuid; v_qty numeric;
BEGIN
  IF NOT public.can_access_case(_case_id) THEN RETURN jsonb_build_object('success', false, 'error', 'Sem permissão'); END IF;
  SELECT isc.implant_system_id INTO v_system FROM public.stock_items si
    LEFT JOIN public.implant_system_components isc ON isc.id = si.implant_system_component_id
   WHERE si.id = _stock_item_id;
  SELECT qty_on_hand INTO v_qty FROM public.stock_items WHERE id = _stock_item_id FOR UPDATE;
  IF v_qty IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Item de estoque não encontrado'); END IF;
  IF v_qty < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente'); END IF;
  UPDATE public.case_implant_teeth SET reversed_at = now()
   WHERE case_id = _case_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL;
  INSERT INTO public.case_implant_teeth (case_id, tooth_fdi, implant_system_id, stock_item_id, qty, created_by)
    VALUES (_case_id, _tooth_fdi, v_system, _stock_item_id, 1, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.stock_movements (stock_item_id, type, qty, case_id, user_id, notes)
    VALUES (_stock_item_id, 'auto_case'::stock_movement_type, -1, _case_id, auth.uid(),
            'Apontamento implante · dente ' || _tooth_fdi::text);
  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $fn$;

CREATE OR REPLACE FUNCTION public.remove_case_implant_tooth(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_row public.case_implant_teeth%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.case_implant_teeth WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado'); END IF;
  IF NOT public.can_access_case(v_row.case_id) THEN RETURN jsonb_build_object('success', false, 'error', 'Sem permissão'); END IF;
  IF v_row.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true); END IF;
  UPDATE public.case_implant_teeth SET reversed_at = now() WHERE id = _id;
  INSERT INTO public.stock_movements (stock_item_id, type, qty, case_id, user_id, notes)
    VALUES (v_row.stock_item_id, 'reverse_case'::stock_movement_type, v_row.qty, v_row.case_id, auth.uid(),
            'Reversão implante · dente ' || v_row.tooth_fdi::text);
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $fn$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- Financial and fiscal boundaries must be restored after the legacy blanket
-- grants above. Client roles may read/update only through explicitly validated
-- RPCs; provider identities and authoritative state changes remain backend-only.
REVOKE ALL ON TABLE public.company_billing_profiles
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_provider_customers
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_test_access
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_test_tokens
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.company_billing_profiles TO service_role;
GRANT ALL ON TABLE public.billing_provider_customers TO service_role;
GRANT ALL ON TABLE public.billing_test_access TO service_role;
GRANT ALL ON TABLE public.billing_test_tokens TO service_role;

REVOKE ALL ON FUNCTION public.billing_apply_checkout_paid(
  uuid,text,text,text,text,timestamptz,timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_apply_subscription_state(
  uuid,text,timestamptz,timestamptz,timestamptz,text,text,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_bind_asaas_customer(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_user_can_manage_company(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_valid_br_tax_id(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_clinic_storage_entitlement(
  uuid,text,text,bigint,text,text,text,text,boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.billing_apply_checkout_paid(
  uuid,text,text,text,text,timestamptz,timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_apply_subscription_state(
  uuid,text,timestamptz,timestamptz,timestamptz,text,text,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_bind_asaas_customer(uuid,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_user_can_manage_company(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_valid_br_tax_id(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_clinic_storage_entitlement(
  uuid,text,text,bigint,text,text,text,text,boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.billing_get_company_profile(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_upsert_company_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_get_company_profile(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_upsert_company_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) TO authenticated, service_role;

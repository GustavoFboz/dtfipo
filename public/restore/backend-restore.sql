
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;


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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clinics_invite_code_key') THEN
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
DECLARE b text; op text;
BEGIN
  FOREACH b IN ARRAY ARRAY['case-files','patient-files'] LOOP
    FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      BEGIN
        EXECUTE format(
          'CREATE POLICY %I ON storage.objects FOR %s TO authenticated USING (bucket_id = %L) %s',
          b||'_auth_'||lower(op), op, b,
          CASE WHEN op IN ('INSERT','UPDATE') THEN format('WITH CHECK (bucket_id = %L)', b) ELSE '' END
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

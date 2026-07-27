-- BATCH 1/6

CREATE TABLE public.doctors (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.patients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, photo_url TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.case_types (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, abbreviation TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.tooth_colors (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.stages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3b82f6', position INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  case_type_id UUID REFERENCES public.case_types(id) ON DELETE SET NULL,
  tooth_color_id UUID REFERENCES public.tooth_colors(id) ON DELETE SET NULL,
  case_label TEXT, entry_date DATE NOT NULL DEFAULT CURRENT_DATE, delivery_date DATE NOT NULL,
  finished_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'active',
  model_done BOOLEAN NOT NULL DEFAULT false, scan_done BOOLEAN NOT NULL DEFAULT false,
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cases_status_idx ON public.cases(status);
CREATE INDEX cases_delivery_idx ON public.cases(delivery_date);
CREATE TABLE public.case_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  pending_count INT NOT NULL DEFAULT 0, position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(case_id, stage_id)
);
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER cases_set_updated BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctors, public.patients, public.case_types, public.tooth_colors, public.stages, public.cases, public.case_stages TO authenticated;
GRANT ALL ON public.doctors, public.patients, public.case_types, public.tooth_colors, public.stages, public.cases, public.case_stages TO service_role;

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooth_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_stages ENABLE ROW LEVEL SECURITY;

INSERT INTO public.stages (name, color, position) VALUES ('CADISTA','#0a4dbd',1),('FORNO','#f59e0b',2),('PROVISORIO','#fef3c7',3),('MAQUIAGEM','#ec4899',4);
INSERT INTO public.tooth_colors (code) VALUES ('A1'),('A2'),('A3'),('A3.5'),('B1'),('B2'),('C1'),('D2');
INSERT INTO public.case_types (name, abbreviation) VALUES ('Coroa','Coroa'),('Prótese Superior','Pr. Sup.'),('Prótese Inferior','Pr. Inf.'),('Faceta','Faceta'),('Implante','Implante');
INSERT INTO public.doctors (name) VALUES ('Dr. Leandro');
INSERT INTO public.patients (name) VALUES ('Ieda Queiroz'),('Abidon');

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS folder_url text, ADD COLUMN IF NOT EXISTS folder_done boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_stages ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(), ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE public.phases (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, color text NOT NULL DEFAULT '#3b82f6', position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phases TO authenticated;
GRANT ALL ON public.phases TO service_role;
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ADD COLUMN phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;

CREATE TABLE public.cadistas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadistas TO authenticated;
GRANT ALL ON public.cadistas TO service_role;
ALTER TABLE public.cadistas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.components (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, category text, manufacturer text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.components TO authenticated;
GRANT ALL ON public.components TO service_role;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.case_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  qty int NOT NULL DEFAULT 1, notes text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id, component_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_components TO authenticated;
GRANT ALL ON public.case_components TO service_role;
ALTER TABLE public.case_components ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cases
  ADD COLUMN cadista_id uuid REFERENCES public.cadistas(id) ON DELETE SET NULL,
  ADD COLUMN current_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  ADD COLUMN sibling_case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN arch text;

INSERT INTO public.phases (name, color, position) VALUES ('Entrada','#22c55e',1),('Escaneamento','#06b6d4',2),('Modelo','#a855f7',3),('CAD','#3b82f6',4),('Aprovação','#f59e0b',5),('Produção','#ef4444',6),('Forno','#f97316',7),('Caracterização','#ec4899',8),('Checkup','#14b8a6',9),('Entrega','#10b981',10);

CREATE INDEX idx_cases_status_delivery_date ON public.cases(status, delivery_date);
CREATE INDEX idx_cases_patient_id ON public.cases(patient_id);
CREATE INDEX idx_cases_current_stage_id ON public.cases(current_stage_id);
CREATE INDEX idx_case_stages_case_id ON public.case_stages(case_id);
CREATE INDEX idx_case_components_case_id ON public.case_components(case_id);

ALTER TABLE public.cases ADD COLUMN current_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;
CREATE INDEX idx_cases_current_phase_id ON public.cases(current_phase_id);

ALTER TABLE public.cases ADD COLUMN reopened_at timestamptz, ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE public.burrs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, material text NOT NULL CHECK (material IN ('zirconia','dissilicato')), installed_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.burrs TO authenticated;
GRANT ALL ON public.burrs TO service_role;
ALTER TABLE public.burrs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.burr_usages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), burr_id uuid NOT NULL REFERENCES public.burrs(id) ON DELETE CASCADE, case_id uuid, material text NOT NULL CHECK (material IN ('zirconia','dissilicato')), teeth_count int NOT NULL DEFAULT 0, teeth_numbers int[] NOT NULL DEFAULT '{}', milled_at timestamptz NOT NULL DEFAULT now(), notes text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.burr_usages TO authenticated;
GRANT ALL ON public.burr_usages TO service_role;
ALTER TABLE public.burr_usages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_burr_usages_burr ON public.burr_usages(burr_id);
CREATE INDEX idx_burr_usages_case ON public.burr_usages(case_id);

ALTER TABLE public.cases
  ADD COLUMN teeth_numbers int[] NOT NULL DEFAULT '{}',
  ADD COLUMN elements_count int NOT NULL DEFAULT 0,
  ADD COLUMN elements_zirconia int NOT NULL DEFAULT 0,
  ADD COLUMN elements_dissilicato int NOT NULL DEFAULT 0,
  ADD COLUMN teeth_zirconia int[] NOT NULL DEFAULT '{}',
  ADD COLUMN teeth_dissilicato int[] NOT NULL DEFAULT '{}';

CREATE TABLE public.case_types_link (
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_type_id uuid NOT NULL REFERENCES public.case_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, case_type_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_types_link TO authenticated;
GRANT ALL ON public.case_types_link TO service_role;
ALTER TABLE public.case_types_link ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_case_types_link_case ON public.case_types_link(case_id);

CREATE TABLE public.holders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holders TO authenticated;
GRANT ALL ON public.holders TO service_role;
ALTER TABLE public.holders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.burrs ADD COLUMN holder_id uuid REFERENCES public.holders(id) ON DELETE SET NULL, ADD COLUMN code text;
CREATE UNIQUE INDEX burrs_one_active_per_holder_material ON public.burrs(holder_id, material) WHERE removed_at IS NULL AND holder_id IS NOT NULL;

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','dentista','recepcionista','auxiliar','protetico','cadista'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.cadistas ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, full_name TEXT, email TEXT, phone TEXT, is_default_admin BOOLEAN NOT NULL DEFAULT false, role TEXT DEFAULT 'USER', account_subtype TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role public.app_role NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (user_id, role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;


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

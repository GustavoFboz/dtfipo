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

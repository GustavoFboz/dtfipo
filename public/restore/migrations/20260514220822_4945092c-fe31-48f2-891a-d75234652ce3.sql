
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

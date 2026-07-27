
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

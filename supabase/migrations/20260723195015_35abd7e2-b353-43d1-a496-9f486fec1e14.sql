
-- 1. Add missing `line` column
ALTER TABLE public.implant_systems ADD COLUMN IF NOT EXISTS line text;

-- 2. component_categories
CREATE TABLE IF NOT EXISTS public.component_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  position integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.component_categories TO authenticated;
GRANT ALL ON public.component_categories TO service_role;
ALTER TABLE public.component_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "component_categories auth read" ON public.component_categories;
CREATE POLICY "component_categories auth read" ON public.component_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "component_categories staff write" ON public.component_categories;
CREATE POLICY "component_categories staff write" ON public.component_categories FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- 3. implant_system_components
CREATE TABLE IF NOT EXISTS public.implant_system_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  component_type_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_isc_system ON public.implant_system_components(implant_system_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_system_components TO authenticated;
GRANT ALL ON public.implant_system_components TO service_role;
ALTER TABLE public.implant_system_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "isc auth read" ON public.implant_system_components;
CREATE POLICY "isc auth read" ON public.implant_system_components FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "isc staff write" ON public.implant_system_components;
CREATE POLICY "isc staff write" ON public.implant_system_components FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- 4. stock_items needs implant_system_component_id column (guard)
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS implant_system_component_id uuid REFERENCES public.implant_system_components(id) ON DELETE SET NULL;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.component_categories(id) ON DELETE SET NULL;

-- 5. RPC
CREATE OR REPLACE FUNCTION public.create_implant_system_with_stock(_name text, _line text, _components jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_id uuid;
  v_cat_id uuid;
  v_comp jsonb;
  v_comp_id uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;

  INSERT INTO public.implant_systems (name, line, sort_order)
    VALUES (_name, NULLIF(_line, ''), 50)
    RETURNING id INTO v_system_id;

  SELECT id INTO v_cat_id FROM public.component_categories WHERE lower(name) = 'implantes' LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.component_categories (name, position) VALUES ('Implantes', 1000) RETURNING id INTO v_cat_id;
  END IF;

  IF _components IS NOT NULL THEN
    FOR v_comp IN SELECT * FROM jsonb_array_elements(_components) LOOP
      INSERT INTO public.implant_system_components (implant_system_id, name, sku)
        VALUES (v_system_id, v_comp->>'name', NULLIF(v_comp->>'sku',''))
        RETURNING id INTO v_comp_id;

      INSERT INTO public.stock_items (name, brand, unit, qty_on_hand, min_qty, implant_system_component_id, category_id)
        VALUES (
          v_comp->>'name',
          _name,
          COALESCE(NULLIF(v_comp->>'unit',''), 'un'),
          COALESCE((v_comp->>'qty')::numeric, 0),
          COALESCE((v_comp->>'min_qty')::numeric, 0),
          v_comp_id,
          v_cat_id
        );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'implant_system_id', v_system_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

GRANT EXECUTE ON FUNCTION public.create_implant_system_with_stock(text, text, jsonb) TO authenticated;


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


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

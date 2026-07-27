
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

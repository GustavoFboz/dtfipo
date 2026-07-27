
CREATE TABLE IF NOT EXISTS public.case_implant_teeth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  tooth_fdi integer NOT NULL,
  implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE SET NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  qty numeric NOT NULL DEFAULT 1,
  reversed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cit_case ON public.case_implant_teeth(case_id) WHERE reversed_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_implant_teeth TO authenticated;
GRANT ALL ON public.case_implant_teeth TO service_role;
ALTER TABLE public.case_implant_teeth ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.case_implant_teeth'::regclass AND polname='cit_select') THEN
    CREATE POLICY cit_select ON public.case_implant_teeth FOR SELECT TO authenticated
      USING (public.can_access_case(case_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.case_implant_teeth'::regclass AND polname='cit_write') THEN
    CREATE POLICY cit_write ON public.case_implant_teeth FOR ALL TO authenticated
      USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_case_implant_tooth(_case_id uuid, _tooth_fdi integer, _stock_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_system uuid; v_id uuid; v_qty numeric;
BEGIN
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;

  SELECT isc.implant_system_id INTO v_system
    FROM public.stock_items si
    LEFT JOIN public.implant_system_components isc ON isc.id = si.implant_system_component_id
    WHERE si.id = _stock_item_id;

  SELECT qty_on_hand INTO v_qty FROM public.stock_items WHERE id = _stock_item_id FOR UPDATE;
  IF v_qty IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item de estoque não encontrado');
  END IF;
  IF v_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente');
  END IF;

  -- reverse any active entry for this tooth
  UPDATE public.case_implant_teeth
     SET reversed_at = now()
   WHERE case_id = _case_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL;

  INSERT INTO public.case_implant_teeth (case_id, tooth_fdi, implant_system_id, stock_item_id, qty, created_by)
    VALUES (_case_id, _tooth_fdi, v_system, _stock_item_id, 1, auth.uid())
    RETURNING id INTO v_id;

  -- decrement stock via stock_movements (uses apply_stock_movement trigger)
  INSERT INTO public.stock_movements (stock_item_id, qty, reason, case_id, created_by)
    VALUES (_stock_item_id, -1, 'case_implant_tooth', _case_id, auth.uid());

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.remove_case_implant_tooth(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.case_implant_teeth%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.case_implant_teeth WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado');
  END IF;
  IF NOT public.can_access_case(v_row.case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  IF v_row.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  UPDATE public.case_implant_teeth SET reversed_at = now() WHERE id = _id;

  -- return stock
  INSERT INTO public.stock_movements (stock_item_id, qty, reason, case_id, created_by)
    VALUES (v_row.stock_item_id, v_row.qty, 'case_implant_tooth_reverse', v_row.case_id, auth.uid());

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

GRANT EXECUTE ON FUNCTION public.register_case_implant_tooth(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_case_implant_tooth(uuid) TO authenticated;

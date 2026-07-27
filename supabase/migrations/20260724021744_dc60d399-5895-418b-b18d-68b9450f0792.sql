
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
  IF v_qty IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Item de estoque não encontrado'); END IF;
  IF v_qty < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente'); END IF;

  UPDATE public.case_implant_teeth SET reversed_at = now()
   WHERE case_id = _case_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL;

  INSERT INTO public.case_implant_teeth (case_id, tooth_fdi, implant_system_id, stock_item_id, qty, created_by)
    VALUES (_case_id, _tooth_fdi, v_system, _stock_item_id, 1, auth.uid())
    RETURNING id INTO v_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, case_id, user_id, notes)
    VALUES (_stock_item_id, 'auto_case'::stock_movement_type, -1, _case_id, auth.uid(),
            'Apontamento implante · dente ' || _tooth_fdi::text);

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.remove_case_implant_tooth(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.case_implant_teeth%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.case_implant_teeth WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado'); END IF;
  IF NOT public.can_access_case(v_row.case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  IF v_row.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true); END IF;

  UPDATE public.case_implant_teeth SET reversed_at = now() WHERE id = _id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, case_id, user_id, notes)
    VALUES (v_row.stock_item_id, 'reverse_case'::stock_movement_type, v_row.qty, v_row.case_id, auth.uid(),
            'Reversão implante · dente ' || v_row.tooth_fdi::text);

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

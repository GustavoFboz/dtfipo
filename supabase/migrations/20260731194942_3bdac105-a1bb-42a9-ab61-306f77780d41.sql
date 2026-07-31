CREATE OR REPLACE FUNCTION public.register_tooth_stock_usage(
  _case_id uuid, _rule_id uuid, _tooth_fdi integer, _stock_item_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qty numeric; v_id uuid; v_user uuid := auth.uid(); u RECORD;
BEGIN
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT GREATEST(COALESCE(qty_per_tooth, 1), 1) INTO v_qty
    FROM public.stock_consumption_rules WHERE id = _rule_id;
  v_qty := COALESCE(v_qty, 1);

  FOR u IN
    SELECT id FROM public.case_tooth_stock_usage
     WHERE case_id = _case_id AND rule_id = _rule_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL
  LOOP
    PERFORM public.remove_tooth_stock_usage(u.id);
  END LOOP;

  INSERT INTO public.case_tooth_stock_usage (case_id, rule_id, stock_item_id, tooth_fdi, qty, created_by)
  VALUES (_case_id, _rule_id, _stock_item_id, _tooth_fdi, v_qty, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'tooth_usage', -v_qty, 0, 0, _case_id, v_user, 'Uso no dente ' || _tooth_fdi);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $$;
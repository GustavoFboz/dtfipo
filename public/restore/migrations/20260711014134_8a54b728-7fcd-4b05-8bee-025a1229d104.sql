CREATE OR REPLACE FUNCTION public.reverse_all_case_stock(_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  k RECORD;
  m RECORD;
  v_mid uuid;
BEGIN
  -- 1. Reverse implant tooth usages
  FOR k IN
    SELECT * FROM public.case_implant_teeth
     WHERE case_id = _case_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'implant_usage_reverse', k.qty, 0, 0, _case_id, v_user, 'Reversão por exclusão/cancelamento do caso (implante FDI ' || k.tooth_fdi || ')')
    RETURNING id INTO v_mid;
    UPDATE public.case_implant_teeth SET reversed_at = now(), reversed_by = v_user WHERE id = k.id;
  END LOOP;

  -- 2. Reverse per-tooth stock usage
  FOR k IN
    SELECT * FROM public.case_tooth_stock_usage
     WHERE case_id = _case_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'tooth_usage_reverse', k.qty, 0, 0, _case_id, v_user, 'Reversão por exclusão/cancelamento do caso (dente ' || k.tooth_fdi || ')')
    RETURNING id INTO v_mid;
    UPDATE public.case_tooth_stock_usage SET reversed_at = now(), reversed_by = v_user WHERE id = k.id;
  END LOOP;

  -- 3. Reverse automatic rule consumptions
  FOR k IN
    SELECT * FROM public.case_stock_consumptions
     WHERE case_id = _case_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'reverse_rule', k.qty, 0, 0, _case_id, v_user, 'Reversão por exclusão/cancelamento do caso')
    RETURNING id INTO v_mid;
    UPDATE public.case_stock_consumptions SET reversed_at = now(), reversed_by = v_user WHERE id = k.id;
  END LOOP;

  -- 4. Reverse legacy auto_case movements (mirror of reverse_case_stock)
  FOR m IN
    SELECT * FROM public.stock_movements
     WHERE case_id = _case_id AND type = 'auto_case'
       AND NOT EXISTS (
         SELECT 1 FROM public.stock_movements m2
          WHERE m2.case_id = _case_id AND m2.type = 'reverse_case'
            AND m2.stock_item_id = stock_movements.stock_item_id
            AND m2.qty = -stock_movements.qty
       )
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (m.stock_item_id, 'reverse_case', -m.qty, 0, 0, _case_id, v_user, 'Reversão por exclusão/cancelamento do caso');
  END LOOP;

  UPDATE public.cases SET stock_consumed_at = NULL WHERE id = _case_id;

  RETURN jsonb_build_object('success', true);
END $$;
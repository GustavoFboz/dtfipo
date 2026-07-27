CREATE OR REPLACE FUNCTION public.apply_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c RECORD; r RECORD;
  v_qty numeric; v_teeth int; v_stock numeric; v_mid uuid;
  v_case_type uuid;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso não encontrado'); END IF;

  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;
  v_teeth := COALESCE(array_length(c.teeth_zirconia,1),0) + COALESCE(array_length(c.teeth_dissilicato,1),0);

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true AND stage_id = _stage_id
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
    -- Regras "por seleção de dente" são validadas em validate_tooth_rules_for_stage
    -- (na etapa atual, antes de sair). Aqui apenas pulamos.
    IF r.mode = 'per_tooth_selection' THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.case_stock_consumptions
               WHERE case_id = _case_id AND rule_id = r.id AND stage_id = _stage_id AND reversed_at IS NULL) THEN
      CONTINUE;
    END IF;

    v_qty := COALESCE(r.qty_per_case,0) + (COALESCE(r.qty_per_tooth,0) * v_teeth);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT qty_on_hand INTO v_stock FROM public.stock_items WHERE id = r.stock_item_id;
    IF r.required AND COALESCE(v_stock,0) < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Estoque insuficiente para avançar: falta ' || (v_qty - COALESCE(v_stock,0))::text || ' un.');
    END IF;

    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (r.stock_item_id, 'auto_rule', -v_qty, 0, 0, _case_id, _user, 'Consumo automático por regra')
    RETURNING id INTO v_mid;

    INSERT INTO public.case_stock_consumptions(case_id, stage_id, rule_id, stock_item_id, qty, movement_id, consumed_by)
    VALUES (_case_id, _stage_id, r.id, r.stock_item_id, v_qty, v_mid, _user);
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END $$;
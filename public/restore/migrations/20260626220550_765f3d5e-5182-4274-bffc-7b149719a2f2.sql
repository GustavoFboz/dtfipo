
-- N1+N2: Modos de regra e uso por dente

ALTER TABLE public.stock_consumption_rules
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'any';

ALTER TABLE public.stock_consumption_rules
  DROP CONSTRAINT IF EXISTS stock_consumption_rules_mode_chk;
ALTER TABLE public.stock_consumption_rules
  ADD CONSTRAINT stock_consumption_rules_mode_chk CHECK (mode IN ('auto','per_tooth_selection'));
ALTER TABLE public.stock_consumption_rules
  DROP CONSTRAINT IF EXISTS stock_consumption_rules_applies_chk;
ALTER TABLE public.stock_consumption_rules
  ADD CONSTRAINT stock_consumption_rules_applies_chk CHECK (applies_to IN ('any','implant_only'));

-- Tabela de uso por dente
CREATE TABLE IF NOT EXISTS public.case_tooth_stock_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.stock_consumption_rules(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
  tooth_fdi int NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  movement_id uuid,
  used_by uuid,
  used_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS case_tooth_stock_usage_uq
  ON public.case_tooth_stock_usage(case_id, rule_id, tooth_fdi)
  WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS case_tooth_stock_usage_case_idx
  ON public.case_tooth_stock_usage(case_id, stage_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_tooth_stock_usage TO authenticated;
GRANT ALL ON public.case_tooth_stock_usage TO service_role;

ALTER TABLE public.case_tooth_stock_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff view tooth usage" ON public.case_tooth_stock_usage;
CREATE POLICY "staff view tooth usage" ON public.case_tooth_stock_usage
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff insert tooth usage" ON public.case_tooth_stock_usage;
CREATE POLICY "staff insert tooth usage" ON public.case_tooth_stock_usage
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff update tooth usage" ON public.case_tooth_stock_usage;
CREATE POLICY "staff update tooth usage" ON public.case_tooth_stock_usage
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- Helper: dentes elegíveis
CREATE OR REPLACE FUNCTION public.eligible_teeth_for_rule(_case_id uuid, _applies_to text)
RETURNS int[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v int[];
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN ARRAY[]::int[]; END IF;
  IF _applies_to = 'implant_only' THEN
    v := COALESCE(c.implant_teeth, ARRAY[]::int[]);
  ELSE
    v := COALESCE(c.teeth_numbers, ARRAY[]::int[]);
    IF array_length(v,1) IS NULL THEN
      v := COALESCE(c.teeth_zirconia, ARRAY[]::int[]) || COALESCE(c.teeth_dissilicato, ARRAY[]::int[]) || COALESCE(c.implant_teeth, ARRAY[]::int[]);
    END IF;
  END IF;
  RETURN v;
END $$;

-- Registrar uso por dente
CREATE OR REPLACE FUNCTION public.register_tooth_stock_usage(_case_id uuid, _rule_id uuid, _tooth_fdi int, _stock_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; c RECORD; v_user uuid := auth.uid(); v_stock numeric; v_mid uuid;
  v_eligible int[]; v_id uuid; v_has_assignees boolean; v_is_assignee boolean;
BEGIN
  SELECT * INTO r FROM public.stock_consumption_rules WHERE id = _rule_id AND active = true;
  IF r IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Regra inválida'); END IF;
  IF r.mode <> 'per_tooth_selection' THEN RETURN jsonb_build_object('success', false, 'error', 'Regra não é por dente'); END IF;

  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;
  IF c.current_stage_id <> r.stage_id THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não está na etapa da regra'); END IF;

  SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = r.stage_id) INTO v_has_assignees;
  SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = r.stage_id AND user_id = v_user) INTO v_is_assignee;
  IF v_has_assignees AND NOT v_is_assignee AND NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas o responsável pode registrar');
  END IF;

  v_eligible := public.eligible_teeth_for_rule(_case_id, r.applies_to);
  IF NOT (_tooth_fdi = ANY(v_eligible)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dente não elegível para esta regra');
  END IF;

  IF EXISTS (SELECT 1 FROM public.case_tooth_stock_usage WHERE case_id=_case_id AND rule_id=_rule_id AND tooth_fdi=_tooth_fdi AND reversed_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dente já registrado');
  END IF;

  SELECT qty_on_hand INTO v_stock FROM public.stock_items WHERE id = _stock_item_id;
  IF COALESCE(v_stock,0) < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente'); END IF;

  INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'tooth_usage', -1, 0, 0, _case_id, v_user, 'Uso por dente FDI ' || _tooth_fdi)
  RETURNING id INTO v_mid;

  INSERT INTO public.case_tooth_stock_usage(case_id, stage_id, rule_id, stock_item_id, tooth_fdi, qty, movement_id, used_by)
  VALUES (_case_id, r.stage_id, _rule_id, _stock_item_id, _tooth_fdi, 1, v_mid, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.case_activity (case_id, user_id, kind, content, mentions, metadata)
  VALUES (_case_id, v_user, 'stock_tooth_usage',
    'Registrou uso de item no dente ' || _tooth_fdi, ARRAY[]::uuid[],
    jsonb_build_object('rule_id', _rule_id, 'stock_item_id', _stock_item_id, 'tooth_fdi', _tooth_fdi));

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $$;

-- Remover uso (reverte movimento)
CREATE OR REPLACE FUNCTION public.remove_tooth_stock_usage(_usage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u RECORD; v_user uuid := auth.uid(); v_mid uuid;
BEGIN
  SELECT * INTO u FROM public.case_tooth_stock_usage WHERE id = _usage_id;
  IF u IS NULL OR u.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Uso inexistente');
  END IF;

  INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (u.stock_item_id, 'tooth_usage_reverse', u.qty, 0, 0, u.case_id, v_user, 'Reversão de uso por dente FDI ' || u.tooth_fdi)
  RETURNING id INTO v_mid;

  UPDATE public.case_tooth_stock_usage
    SET reversed_at = now(), reversed_by = v_user
   WHERE id = _usage_id;

  RETURN jsonb_build_object('success', true);
END $$;

-- Atualizar apply_stock_rules_for_stage: ignorar regras de seleção (não debita auto)
CREATE OR REPLACE FUNCTION public.apply_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; r RECORD;
  v_qty numeric; v_teeth int; v_stock numeric; v_mid uuid;
  v_case_type uuid; v_eligible int[]; v_covered int;
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
    -- Regra por seleção: validar cobertura se obrigatória; nunca debita aqui
    IF r.mode = 'per_tooth_selection' THEN
      IF r.required THEN
        v_eligible := public.eligible_teeth_for_rule(_case_id, r.applies_to);
        IF COALESCE(array_length(v_eligible,1),0) > 0 THEN
          SELECT count(*) INTO v_covered FROM public.case_tooth_stock_usage
            WHERE case_id=_case_id AND rule_id=r.id AND reversed_at IS NULL AND tooth_fdi = ANY(v_eligible);
          IF v_covered < array_length(v_eligible,1) THEN
            RETURN jsonb_build_object('ok', false, 'error',
              'Registre o item para todos os dentes elegíveis antes de avançar (faltam ' ||
              (array_length(v_eligible,1) - v_covered)::text || ').');
          END IF;
        END IF;
      END IF;
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

-- Atualizar reverse_stock_rules_for_stage: também reverter usos por dente da etapa
CREATE OR REPLACE FUNCTION public.reverse_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k RECORD; v_mid uuid;
BEGIN
  FOR k IN
    SELECT * FROM public.case_stock_consumptions
     WHERE case_id = _case_id AND stage_id = _stage_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'reverse_rule', k.qty, 0, 0, _case_id, _user, 'Reversão de consumo automático')
    RETURNING id INTO v_mid;
    UPDATE public.case_stock_consumptions SET reversed_at = now(), reversed_by = _user WHERE id = k.id;
  END LOOP;

  FOR k IN
    SELECT * FROM public.case_tooth_stock_usage
     WHERE case_id = _case_id AND stage_id = _stage_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'tooth_usage_reverse', k.qty, 0, 0, _case_id, _user, 'Reversão de uso por dente (retorno de etapa)')
    RETURNING id INTO v_mid;
    UPDATE public.case_tooth_stock_usage SET reversed_at = now(), reversed_by = _user WHERE id = k.id;
  END LOOP;
END $$;

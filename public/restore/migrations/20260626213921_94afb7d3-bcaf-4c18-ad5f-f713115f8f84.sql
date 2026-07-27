
-- 1) Tabelas
CREATE TABLE IF NOT EXISTS public.stock_consumption_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type_id uuid REFERENCES public.case_types(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.stages(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty_per_case numeric NOT NULL DEFAULT 1,
  qty_per_tooth numeric NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_consumption_rules TO authenticated;
GRANT ALL ON public.stock_consumption_rules TO service_role;
ALTER TABLE public.stock_consumption_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view rules" ON public.stock_consumption_rules
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage rules" ON public.stock_consumption_rules
  FOR ALL TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE TRIGGER tg_stock_consumption_rules_updated
  BEFORE UPDATE ON public.stock_consumption_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.case_stock_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.stock_consumption_rules(id) ON DELETE SET NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL,
  movement_id uuid,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  consumed_by uuid,
  reversed_at timestamptz,
  reversed_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_stock_consumptions TO authenticated;
GRANT ALL ON public.case_stock_consumptions TO service_role;
ALTER TABLE public.case_stock_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view consumptions" ON public.case_stock_consumptions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage consumptions" ON public.case_stock_consumptions
  FOR ALL TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE INDEX IF NOT EXISTS idx_csc_case ON public.case_stock_consumptions(case_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_csc_active ON public.case_stock_consumptions(case_id, rule_id, stage_id) WHERE reversed_at IS NULL;

-- 2) Helper: aplicar regras ao entrar numa etapa
CREATE OR REPLACE FUNCTION public.apply_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; r RECORD;
  v_qty numeric; v_teeth int; v_stock numeric; v_mid uuid;
  v_case_type uuid;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Caso não encontrado'); END IF;

  -- Tipo do caso (via case_types_link, primeiro encontrado)
  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;

  v_teeth := COALESCE(array_length(c.teeth_zirconia,1),0) + COALESCE(array_length(c.teeth_dissilicato,1),0);

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true
       AND stage_id = _stage_id
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
    -- Idempotência
    IF EXISTS (SELECT 1 FROM public.case_stock_consumptions
               WHERE case_id = _case_id AND rule_id = r.id AND stage_id = _stage_id AND reversed_at IS NULL) THEN
      CONTINUE;
    END IF;

    v_qty := r.qty_per_case + (r.qty_per_tooth * v_teeth);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT qty_on_hand INTO v_stock FROM public.stock_items WHERE id = r.stock_item_id;
    IF r.required AND COALESCE(v_stock,0) < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Estoque insuficiente para avançar: falta ' || (v_qty - COALESCE(v_stock,0))::text || ' un. do item necessário.');
    END IF;

    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (r.stock_item_id, 'auto_rule', -v_qty, 0, 0, _case_id, _user, 'Consumo automático por regra')
    RETURNING id INTO v_mid;

    INSERT INTO public.case_stock_consumptions(case_id, stage_id, rule_id, stock_item_id, qty, movement_id, consumed_by)
    VALUES (_case_id, _stage_id, r.id, r.stock_item_id, v_qty, v_mid, _user);
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END $$;

-- 3) Helper: reverter consumos de uma etapa
CREATE OR REPLACE FUNCTION public.reverse_stock_rules_for_stage(_case_id uuid, _stage_id uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k RECORD; v_mid uuid;
BEGIN
  FOR k IN
    SELECT * FROM public.case_stock_consumptions
     WHERE case_id = _case_id AND stage_id = _stage_id AND reversed_at IS NULL
  LOOP
    INSERT INTO public.stock_movements(stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (k.stock_item_id, 'reverse_rule', k.qty, 0, 0, _case_id, _user, 'Reversão de consumo automático')
    RETURNING id INTO v_mid;

    UPDATE public.case_stock_consumptions
       SET reversed_at = now(), reversed_by = _user
     WHERE id = k.id;
  END LOOP;
END $$;

-- 4) Atualizar advance_case_workflow para aplicar regras
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur RECORD; next_stage RECORD;
  v_user uuid := auth.uid();
  v_case_label text; r record;
  v_has_assignees boolean; v_is_assignee boolean;
  v_rules jsonb;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF c.current_stage_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id) INTO v_has_assignees;
    SELECT EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id = c.current_stage_id AND user_id = v_user) INTO v_is_assignee;
    IF v_has_assignees AND NOT v_is_assignee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Apenas o responsável pela etapa pode avançar.');
    END IF;
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO next_stage FROM public.stages WHERE id = _stage_id;
  ELSIF c.current_stage_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;
    SELECT * INTO next_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position > cur.position
      ORDER BY position LIMIT 1;
  ELSE
    SELECT * INTO next_stage FROM public.stages ORDER BY position LIMIT 1;
  END IF;

  IF next_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa.');
  END IF;

  -- Aplicar regras antes de mover; se faltar estoque obrigatório, aborta
  v_rules := public.apply_stock_rules_for_stage(_case_id, next_stage.id, v_user);
  IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
  END IF;

  UPDATE public.cases
     SET current_stage_id = next_stage.id,
         current_phase_id = next_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN SELECT DISTINCT user_id AS u FROM public.stage_assignments
           WHERE stage_id = next_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (v_user, r.u, 'Nova tarefa: ' || next_stage.name,
            'O caso ' || v_case_label || ' agora está em ' || next_stage.name || '.',
            'task_assigned',
            jsonb_build_object('case_id', _case_id, 'stage_id', next_stage.id));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', next_stage.phase_id, 'stage_id', next_stage.id);
END $$;

-- 5) Atualizar return_case_workflow para reverter consumos da etapa abandonada
CREATE OR REPLACE FUNCTION public.return_case_workflow(_case_id uuid, _reason_id uuid, _notes text DEFAULT NULL::text, _to_stage_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur RECORD; prev_stage RECORD;
  v_user uuid := auth.uid();
  v_reason text; v_case_label text; r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem retroceder etapas.');
  END IF;

  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id = _reason_id;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Justificativa inválida.');
  END IF;

  IF c.current_stage_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caso sem etapa atual.');
  END IF;

  SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;

  IF _to_stage_id IS NOT NULL THEN
    SELECT * INTO prev_stage FROM public.stages WHERE id = _to_stage_id;
    IF prev_stage IS NULL OR prev_stage.position >= cur.position OR prev_stage.phase_id <> cur.phase_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Etapa de destino inválida.');
    END IF;
  ELSE
    IF v_reason ILIKE 'Ajuste%' THEN
      SELECT * INTO prev_stage FROM public.stages
        WHERE phase_id = cur.phase_id AND name ILIKE 'Desenho%'
        ORDER BY position LIMIT 1;
    END IF;
    IF prev_stage IS NULL OR prev_stage.id = cur.id OR prev_stage.position >= cur.position THEN
      SELECT * INTO prev_stage FROM public.stages
        WHERE phase_id = cur.phase_id AND position < cur.position
        ORDER BY position DESC LIMIT 1;
    END IF;
  END IF;

  IF prev_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há etapa anterior.');
  END IF;

  -- Reverter consumos da etapa que está sendo abandonada
  PERFORM public.reverse_stock_rules_for_stage(_case_id, cur.id, v_user);

  UPDATE public.cases
     SET current_stage_id = prev_stage.id,
         current_phase_id = prev_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  INSERT INTO public.case_activity (case_id, user_id, kind, content, mentions, metadata)
  VALUES (_case_id, v_user, 'workflow_return',
    'Retornou para ' || prev_stage.name || ' — ' || v_reason ||
      CASE WHEN _notes IS NOT NULL AND length(trim(_notes)) > 0 THEN ': ' || _notes ELSE '' END,
    ARRAY[]::uuid[],
    jsonb_build_object('from_stage_id', cur.id, 'to_stage_id', prev_stage.id, 'reason', v_reason, 'notes', _notes));

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN SELECT DISTINCT user_id AS u FROM public.stage_assignments
           WHERE stage_id = prev_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (v_user, r.u, 'Caso retornou: ' || prev_stage.name,
      'O caso ' || v_case_label || ' voltou para ' || prev_stage.name || ' (' || v_reason || ').',
      'workflow_back',
      jsonb_build_object('case_id', _case_id, 'stage_id', prev_stage.id, 'reason', v_reason));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', prev_stage.phase_id, 'stage_id', prev_stage.id, 'reason', v_reason);
END $$;


CREATE OR REPLACE FUNCTION public.validate_tooth_rules_for_stage(_case_id uuid, _stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD; v_case_type uuid; v_eligible int[]; v_covered int;
BEGIN
  IF _stage_id IS NULL THEN RETURN jsonb_build_object('ok', true); END IF;
  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true AND stage_id = _stage_id AND mode = 'per_tooth_selection' AND required = true
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
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
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Validar regras "por dente selecionado" da etapa ATUAL antes de sair dela
  IF c.current_stage_id IS NOT NULL THEN
    v_rules := public.validate_tooth_rules_for_stage(_case_id, c.current_stage_id);
    IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
    END IF;
  END IF;

  -- Aplicar regras automáticas da PRÓXIMA etapa (consumo na entrada)
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

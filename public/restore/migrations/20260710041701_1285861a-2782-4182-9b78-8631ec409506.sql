
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_implant_components_for_stage(_case_id uuid, _stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requires boolean;
  v_implant_teeth int[];
  v_pending int[];
BEGIN
  SELECT requires_implant_components INTO v_requires FROM public.stages WHERE id = _stage_id;
  IF v_requires IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT implant_teeth INTO v_implant_teeth FROM public.cases WHERE id = _case_id;
  IF v_implant_teeth IS NULL OR array_length(v_implant_teeth, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT ARRAY(
    SELECT t FROM unnest(v_implant_teeth) AS t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.case_implant_teeth cit
      WHERE cit.case_id = _case_id
        AND cit.tooth_fdi = t
        AND cit.reversed_at IS NULL
    )
    ORDER BY t
  ) INTO v_pending;

  IF array_length(v_pending, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'error', 'Aponte o componente de implante para o(s) dente(s): ' || array_to_string(v_pending, ', '),
    'pending', to_jsonb(v_pending)
  );
END $$;

CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF c.current_stage_id IS NOT NULL THEN
    v_rules := public.validate_tooth_rules_for_stage(_case_id, c.current_stage_id);
    IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
    END IF;

    v_rules := public.validate_implant_components_for_stage(_case_id, c.current_stage_id);
    IF (v_rules->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', v_rules->>'error');
    END IF;
  END IF;

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
END $function$;

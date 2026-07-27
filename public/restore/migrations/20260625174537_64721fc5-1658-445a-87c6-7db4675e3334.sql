
-- Restrict workflow advance to assignees only; allow specifying target stage on return; restrict returns to admins
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur RECORD; next_stage RECORD;
  v_user uuid := auth.uid();
  v_case_label text;
  r record;
  v_has_assignees boolean;
  v_is_assignee boolean;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  -- Apenas o responsável pela etapa atual pode avançar
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

  UPDATE public.cases
     SET current_stage_id = next_stage.id,
         current_phase_id = next_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  v_case_label := COALESCE(c.case_label, c.id::text);

  FOR r IN
    SELECT DISTINCT user_id AS u FROM public.stage_assignments
    WHERE stage_id = next_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Nova tarefa: ' || next_stage.name,
      'O caso ' || v_case_label || ' agora está em ' || next_stage.name || '.',
      'task_assigned',
      jsonb_build_object('case_id', _case_id, 'stage_id', next_stage.id)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', next_stage.phase_id, 'stage_id', next_stage.id);
END $function$;

CREATE OR REPLACE FUNCTION public.return_case_workflow(_case_id uuid, _reason_id uuid, _notes text DEFAULT NULL::text, _to_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur RECORD; prev_stage RECORD;
  v_user uuid := auth.uid();
  v_reason text;
  v_case_label text;
  r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  -- Apenas administradores (CEO/DR) podem retroceder
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

  UPDATE public.cases
     SET current_stage_id = prev_stage.id,
         current_phase_id = prev_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  INSERT INTO public.case_activity (case_id, user_id, kind, content, mentions, metadata)
  VALUES (
    _case_id, v_user, 'workflow_return',
    'Retornou para ' || prev_stage.name || ' — ' || v_reason ||
      CASE WHEN _notes IS NOT NULL AND length(trim(_notes)) > 0 THEN ': ' || _notes ELSE '' END,
    ARRAY[]::uuid[],
    jsonb_build_object('from_stage_id', cur.id, 'to_stage_id', prev_stage.id, 'reason', v_reason, 'notes', _notes)
  );

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN
    SELECT DISTINCT user_id AS u FROM public.stage_assignments
    WHERE stage_id = prev_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Caso retornou: ' || prev_stage.name,
      'O caso ' || v_case_label || ' voltou para ' || prev_stage.name || ' (' || v_reason || ').',
      'workflow_back',
      jsonb_build_object('case_id', _case_id, 'stage_id', prev_stage.id, 'reason', v_reason)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', prev_stage.phase_id, 'stage_id', prev_stage.id, 'reason', v_reason);
END $function$;

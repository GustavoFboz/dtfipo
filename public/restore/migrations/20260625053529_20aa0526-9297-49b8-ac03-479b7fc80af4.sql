
-- 1) Enable Realtime on cases, case_activity, notifications, stages, phases
ALTER TABLE public.cases REPLICA IDENTITY FULL;
ALTER TABLE public.case_activity REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.stages REPLICA IDENTITY FULL;
ALTER TABLE public.phases REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cases; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.stages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.phases; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2) Helper to check if a user is assigned to a stage/phase
CREATE OR REPLACE FUNCTION public.user_can_advance(_user uuid, _phase_id uuid, _stage_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH s AS (
    SELECT user_id FROM public.stage_assignments WHERE _stage_id IS NOT NULL AND stage_id = _stage_id
  ), p AS (
    SELECT user_id FROM public.phase_assignments WHERE _phase_id IS NOT NULL AND phase_id = _phase_id
  )
  SELECT
    CASE
      WHEN _stage_id IS NOT NULL AND EXISTS (SELECT 1 FROM s)
        THEN EXISTS (SELECT 1 FROM s WHERE user_id = _user)
      WHEN _phase_id IS NOT NULL AND EXISTS (SELECT 1 FROM p)
        THEN EXISTS (SELECT 1 FROM p WHERE user_id = _user)
      ELSE TRUE
    END;
$$;

-- 3) Updated advance_case_workflow with assignment guard + notifications to next assignees
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur_stage RECORD; chosen RECORD;
  next_phase_id uuid; next_stage_id uuid;
  v_user uuid := auth.uid();
  v_allowed boolean;
  v_next_phase_name text;
  v_next_stage_name text;
  v_case_label text;
  r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  -- Permission: only assignees of the CURRENT stage/phase may advance, if assignees exist
  v_allowed := public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id)
               OR public.current_user_is_admin();
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem avançar.');
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO chosen FROM public.stages WHERE id = _stage_id;
    IF chosen IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Etapa não encontrada'); END IF;
    IF chosen.on_complete_action = 'goto_phase' AND chosen.target_phase_id IS NOT NULL THEN
      next_phase_id := chosen.target_phase_id; next_stage_id := NULL;
    ELSIF chosen.on_complete_action = 'goto_stage' AND chosen.target_stage_id IS NOT NULL THEN
      SELECT phase_id INTO next_phase_id FROM public.stages WHERE id = chosen.target_stage_id;
      next_stage_id := chosen.target_stage_id;
    ELSE
      SELECT id INTO next_stage_id FROM public.stages
        WHERE phase_id = chosen.phase_id AND position > chosen.position
        ORDER BY position LIMIT 1;
      IF next_stage_id IS NULL THEN
        SELECT id INTO next_phase_id FROM public.phases
          WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=chosen.phase_id),0)
          ORDER BY position LIMIT 1;
      ELSE
        next_phase_id := chosen.phase_id;
      END IF;
    END IF;

    IF chosen.notify_cadista AND c.cadista_id IS NOT NULL THEN
      INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
      SELECT v_user, cd.user_id, 'Caso retornou para desenho',
             'O caso ' || COALESCE(c.case_label, c.id::text) || ' voltou para você.', 'workflow_back'
        FROM public.cadistas cd WHERE cd.id = c.cadista_id;
    END IF;
  ELSE
    IF c.current_stage_id IS NOT NULL THEN
      SELECT * INTO cur_stage FROM public.stages WHERE id = c.current_stage_id;
      SELECT id INTO next_stage_id FROM public.stages
        WHERE phase_id = cur_stage.phase_id AND position > cur_stage.position
        ORDER BY position LIMIT 1;
      IF next_stage_id IS NULL THEN
        SELECT id INTO next_phase_id FROM public.phases
          WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=cur_stage.phase_id),0)
          ORDER BY position LIMIT 1;
      ELSE
        next_phase_id := cur_stage.phase_id;
      END IF;
    ELSE
      SELECT id INTO next_phase_id FROM public.phases
        WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=c.current_phase_id),0)
        ORDER BY position LIMIT 1;
      next_stage_id := NULL;
    END IF;
  END IF;

  UPDATE public.cases
     SET current_phase_id = COALESCE(next_phase_id, current_phase_id),
         current_stage_id = next_stage_id,
         updated_at = now()
   WHERE id = _case_id;

  -- Notify all assignees of the destination
  v_case_label := COALESCE(c.case_label, c.id::text);
  SELECT name INTO v_next_phase_name FROM public.phases WHERE id = COALESCE(next_phase_id, c.current_phase_id);
  IF next_stage_id IS NOT NULL THEN
    SELECT name INTO v_next_stage_name FROM public.stages WHERE id = next_stage_id;
  END IF;

  FOR r IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u FROM public.stage_assignments WHERE next_stage_id IS NOT NULL AND stage_id = next_stage_id
      UNION
      SELECT user_id AS u FROM public.phase_assignments WHERE COALESCE(next_phase_id, c.current_phase_id) IS NOT NULL
        AND phase_id = COALESCE(next_phase_id, c.current_phase_id)
        AND NOT EXISTS (SELECT 1 FROM public.stage_assignments WHERE next_stage_id IS NOT NULL AND stage_id = next_stage_id)
    ) z WHERE u <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Nova tarefa: ' || COALESCE(v_next_stage_name, v_next_phase_name, 'caso'),
      'O caso ' || v_case_label || ' agora está em ' || COALESCE(v_next_stage_name, v_next_phase_name, '—') || '.',
      'task_assigned',
      jsonb_build_object('case_id', _case_id, 'phase_id', COALESCE(next_phase_id, c.current_phase_id), 'stage_id', next_stage_id)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'phase_id', COALESCE(next_phase_id, c.current_phase_id),
    'stage_id', next_stage_id
  );
END $function$;

-- 4) Helpers: set assignees (used by /fluxo UI)
GRANT EXECUTE ON FUNCTION public.user_can_advance(uuid, uuid, uuid) TO authenticated;

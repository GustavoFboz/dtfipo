-- Missing workflow RPCs used by the client
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stage uuid;
  v_current_pos int;
  v_next_stage uuid;
  v_next_phase uuid;
BEGIN
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;

  SELECT current_stage_id INTO v_current_stage FROM public.cases WHERE id = _case_id;

  IF _stage_id IS NOT NULL THEN
    v_next_stage := _stage_id;
  ELSE
    SELECT position INTO v_current_pos FROM public.stages WHERE id = v_current_stage;
    SELECT id INTO v_next_stage
      FROM public.stages
      WHERE position > COALESCE(v_current_pos, -1)
      ORDER BY position ASC
      LIMIT 1;
    IF v_next_stage IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa');
    END IF;
  END IF;

  SELECT phase_id INTO v_next_phase FROM public.stages WHERE id = v_next_stage;

  -- Close current stage history
  UPDATE public.case_stages
     SET completed_at = COALESCE(completed_at, now())
   WHERE case_id = _case_id AND stage_id = v_current_stage AND completed_at IS NULL;

  -- Open next stage history
  INSERT INTO public.case_stages (case_id, stage_id, started_at)
    VALUES (_case_id, v_next_stage, now())
    ON CONFLICT DO NOTHING;

  UPDATE public.cases
     SET current_stage_id = v_next_stage,
         current_phase_id = COALESCE(v_next_phase, current_phase_id),
         updated_at = now()
   WHERE id = _case_id;

  RETURN jsonb_build_object('success', true, 'stage_id', v_next_stage, 'phase_id', v_next_phase);
END $$;

REVOKE ALL ON FUNCTION public.advance_case_workflow(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_case_workflow(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.return_case_workflow(
  _case_id uuid,
  _reason_id uuid,
  _notes text DEFAULT NULL,
  _to_stage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stage uuid;
  v_current_pos int;
  v_target_stage uuid;
  v_target_phase uuid;
BEGIN
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;

  SELECT current_stage_id INTO v_current_stage FROM public.cases WHERE id = _case_id;

  IF _to_stage_id IS NOT NULL THEN
    v_target_stage := _to_stage_id;
  ELSE
    SELECT position INTO v_current_pos FROM public.stages WHERE id = v_current_stage;
    SELECT id INTO v_target_stage
      FROM public.stages
      WHERE position < COALESCE(v_current_pos, 999999)
      ORDER BY position DESC
      LIMIT 1;
    IF v_target_stage IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não há etapa anterior');
    END IF;
  END IF;

  SELECT phase_id INTO v_target_phase FROM public.stages WHERE id = v_target_stage;

  UPDATE public.case_stages
     SET completed_at = COALESCE(completed_at, now())
   WHERE case_id = _case_id AND stage_id = v_current_stage AND completed_at IS NULL;

  INSERT INTO public.case_stages (case_id, stage_id, started_at)
    VALUES (_case_id, v_target_stage, now())
    ON CONFLICT DO NOTHING;

  UPDATE public.cases
     SET current_stage_id = v_target_stage,
         current_phase_id = COALESCE(v_target_phase, current_phase_id),
         updated_at = now()
   WHERE id = _case_id;

  RETURN jsonb_build_object('success', true, 'stage_id', v_target_stage, 'phase_id', v_target_phase);
END $$;

REVOKE ALL ON FUNCTION public.return_case_workflow(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_case_workflow(uuid, uuid, text, uuid) TO authenticated;
-- Keep every case on the workflow selected by has_mockup / has_provisional.
--
-- Older rows can have workflow_key correctly set while current_stage_id still
-- points to a stage from another flow. This is especially visible after editing
-- Mockup/Provisional flags: the UI reads the current stage first and can appear
-- to stay on the previous workflow. The trigger below preserves semantic
-- progress by stage_key, but never allows a current stage from another flow.

CREATE OR REPLACE FUNCTION public.assign_case_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_version integer;
  v_stage_key text;
  v_requested RECORD;
  v_target RECORD;
  v_flow_changed boolean := false;
BEGIN
  v_key := public.case_flow_key(NEW.has_mockup, NEW.has_provisional);

  SELECT active_version
    INTO v_version
    FROM public.workflow_templates
   WHERE flow_key = v_key;
  v_version := COALESCE(v_version, 1);

  IF TG_OP = 'INSERT' THEN
    NEW.workflow_key := v_key;
    NEW.workflow_version := v_version;

    SELECT *
      INTO v_target
      FROM public.stages
     WHERE flow_key = v_key
       AND workflow_version = v_version
       AND stage_key = 'entry'
     ORDER BY position
     LIMIT 1;

    IF v_target IS NOT NULL THEN
      NEW.current_stage_id := v_target.id;
      NEW.current_phase_id := v_target.phase_id;
    END IF;
    RETURN NEW;
  END IF;

  v_flow_changed :=
    OLD.has_mockup IS DISTINCT FROM NEW.has_mockup
    OR OLD.has_provisional IS DISTINCT FROM NEW.has_provisional
    OR OLD.workflow_key IS DISTINCT FROM v_key
    OR OLD.workflow_version IS DISTINCT FROM v_version;

  -- workflow_key/version are derived fields. Never trust a stale/manual value.
  NEW.workflow_key := v_key;
  NEW.workflow_version := v_version;

  -- A deliberate stage clear is still allowed when the workflow itself did not
  -- change. When Mockup/Provisional changes, preserve progress from the old stage.
  IF NEW.current_stage_id IS NULL AND NOT v_flow_changed THEN
    NEW.current_phase_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.current_stage_id IS NOT NULL THEN
    SELECT id, stage_key, flow_key, workflow_version, phase_id
      INTO v_requested
      FROM public.stages
     WHERE id = NEW.current_stage_id;
  END IF;

  -- If the requested stage already belongs to the destination workflow/version,
  -- keep it exactly as selected and only normalize its phase.
  IF v_requested IS NOT NULL
     AND v_requested.flow_key = v_key
     AND COALESCE(v_requested.workflow_version, 1) = v_version THEN
    NEW.current_phase_id := v_requested.phase_id;
    RETURN NEW;
  END IF;

  v_stage_key := v_requested.stage_key;

  -- If the edit changed the workflow and did not carry a usable new stage,
  -- preserve the semantic position of the previous stage.
  IF v_stage_key IS NULL AND OLD.current_stage_id IS NOT NULL THEN
    SELECT stage_key
      INTO v_stage_key
      FROM public.stages
     WHERE id = OLD.current_stage_id;
  END IF;

  SELECT *
    INTO v_target
    FROM public.stages
   WHERE flow_key = v_key
     AND workflow_version = v_version
     AND stage_key = COALESCE(v_stage_key, 'entry')
   ORDER BY position
   LIMIT 1;

  IF v_target IS NULL THEN
    SELECT *
      INTO v_target
      FROM public.stages
     WHERE flow_key = v_key
       AND workflow_version = v_version
       AND stage_key = 'entry'
     ORDER BY position
     LIMIT 1;
  END IF;

  IF v_target IS NOT NULL THEN
    NEW.current_stage_id := v_target.id;
    NEW.current_phase_id := v_target.phase_id;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_assign_case_workflow ON public.cases;
CREATE TRIGGER trg_assign_case_workflow
BEFORE INSERT OR UPDATE OF has_mockup, has_provisional, current_stage_id, workflow_key, workflow_version
ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.assign_case_workflow();

-- Repair legacy mismatches already stored. Updating the derived workflow fields
-- intentionally invokes the trigger above, which maps the current semantic
-- stage_key to the correct flow/version (or to entry when no equivalent exists).
UPDATE public.cases AS c
   SET workflow_key = public.case_flow_key(c.has_mockup, c.has_provisional),
       workflow_version = COALESCE(
         (
           SELECT wt.active_version
             FROM public.workflow_templates wt
            WHERE wt.flow_key = public.case_flow_key(c.has_mockup, c.has_provisional)
         ),
         1
       )
 WHERE c.workflow_key IS DISTINCT FROM public.case_flow_key(c.has_mockup, c.has_provisional)
    OR c.workflow_version IS DISTINCT FROM COALESCE(
         (
           SELECT wt.active_version
             FROM public.workflow_templates wt
            WHERE wt.flow_key = public.case_flow_key(c.has_mockup, c.has_provisional)
         ),
         1
       )
    OR EXISTS (
         SELECT 1
           FROM public.stages s
          WHERE s.id = c.current_stage_id
            AND (
              s.flow_key IS DISTINCT FROM public.case_flow_key(c.has_mockup, c.has_provisional)
              OR COALESCE(s.workflow_version, 1) IS DISTINCT FROM COALESCE(
                (
                  SELECT wt.active_version
                    FROM public.workflow_templates wt
                   WHERE wt.flow_key = public.case_flow_key(c.has_mockup, c.has_provisional)
                ),
                1
              )
            )
       );

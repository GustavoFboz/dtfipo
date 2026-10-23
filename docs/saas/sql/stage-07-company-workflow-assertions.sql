-- READ ONLY: safe for clean restore and live backend.
BEGIN READ ONLY;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['phases','stages','phase_assignments','stage_assignments','stage_return_reasons','workflow_templates','workflow_settings'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='saas_workflow_company_boundary' AND permissive='RESTRICTIVE')
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='aaa_saas_workflow_company_guard' AND tgenabled='O') THEN
   RAISE EXCEPTION 'WORKFLOW_COMPANY_GUARD_MISSING: %',t;
  END IF;
 END LOOP;
 IF has_function_privilege('authenticated','public.saas_seed_company_workflow(uuid)','execute')
  OR has_function_privilege('anon','public.save_workflow_template(text,jsonb,boolean)','execute') THEN RAISE EXCEPTION 'WORKFLOW_INTERNAL_FUNCTION_EXPOSED'; END IF;
 IF position('clinic_id=v_company' IN pg_get_functiondef('public.save_workflow_template(text,jsonb,boolean)'::regprocedure))=0
  OR position('can_modify_case' IN pg_get_functiondef('public.advance_case_workflow(uuid,uuid)'::regprocedure))=0 THEN RAISE EXCEPTION 'WORKFLOW_SCOPED_RPC_OVERWRITTEN'; END IF;
 IF EXISTS(SELECT 1 FROM public.stages s JOIN public.phases p ON p.id=s.phase_id WHERE s.clinic_id IS DISTINCT FROM p.clinic_id) THEN RAISE EXCEPTION 'STAGE_PHASE_COMPANY_MISMATCH'; END IF;
END $$;
SELECT 'passed' AS company_workflow_schema;
ROLLBACK;

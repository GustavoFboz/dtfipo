BEGIN TRANSACTION READ ONLY;
DO $$ DECLARE kinds text; k text; BEGIN
 SELECT pg_get_constraintdef(oid) INTO kinds FROM pg_constraint
 WHERE conrelid='public.saas_fixture_acceptance_jobs'::regclass AND conname='saas_fixture_acceptance_jobs_kind_check';
 FOREACH k IN ARRAY ARRAY['identity','storage','billing','ownership','configuration','reconciliation','cancellation','plan_change'] LOOP
  IF kinds IS NULL OR position(quote_literal(k) in kinds)=0 THEN RAISE EXCEPTION 'Fixture kind missing: %',k; END IF;
 END LOOP;
 IF has_table_privilege('authenticated','public.saas_fixture_acceptance_jobs','SELECT')
 OR has_table_privilege('service_role','public.saas_fixture_acceptance_jobs','INSERT')
 OR has_function_privilege('authenticated','public.saas_claim_fixture_acceptance_job(uuid,text)','EXECUTE')
 OR has_function_privilege('service_role','public.platform_master_claim_plan_change(uuid,text,text,boolean)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.saas_claim_fixture_acceptance_job(uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Private fixture or financial authority boundary changed';
 END IF;
END $$;
ROLLBACK;
SELECT 'passed' AS plan_fixture_private_contract;

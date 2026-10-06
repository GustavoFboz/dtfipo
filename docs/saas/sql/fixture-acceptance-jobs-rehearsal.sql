-- Disposable restore only. This validates grants/claims, never a real Auth flow.
BEGIN;
DO $$ BEGIN
  IF has_table_privilege('anon','public.saas_fixture_acceptance_jobs','SELECT')
    OR has_table_privilege('authenticated','public.saas_fixture_acceptance_jobs','SELECT')
    OR has_table_privilege('service_role','public.saas_fixture_acceptance_jobs','SELECT')
    OR has_function_privilege('anon','public.saas_claim_fixture_acceptance_job(uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.saas_claim_fixture_acceptance_job(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.saas_claim_fixture_acceptance_job(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FIXTURE_CAPABILITY_GRANTS_UNSAFE';
  END IF;
END $$;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
VALUES ('ee083f63-1621-4b82-b7a4-fd13427c0b14','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'dentalflow-acceptance-20261004-e0537565-4015-4ffe-a249-5da489824e6e@example.invalid','',now(),now(),now(),'{"acceptance_fixture":true}'),
 ('24e7cdf9-457e-4af2-b1cb-cf366abbddb0','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'dentalflow-acceptance-20261004-237e6ef4-9893-43d2-b9a3-311f8708aa3d@example.invalid','',now(),now(),now(),'{"acceptance_fixture":true}');
INSERT INTO public.clinics(id,name,owner_id,billing_exempt) VALUES
 ('081d3db4-1606-40f7-a878-19b51556317d','Disposable fixture A','ee083f63-1621-4b82-b7a4-fd13427c0b14',false),
 ('3fc86c40-697e-4725-a9e9-633fc882aadc','Disposable fixture B','24e7cdf9-457e-4af2-b1cb-cf366abbddb0',false);
INSERT INTO public.profiles(id,clinic_id,role) VALUES
 ('ee083f63-1621-4b82-b7a4-fd13427c0b14','081d3db4-1606-40f7-a878-19b51556317d','USER'),
 ('24e7cdf9-457e-4af2-b1cb-cf366abbddb0','3fc86c40-697e-4725-a9e9-633fc882aadc','USER')
ON CONFLICT(id) DO UPDATE SET clinic_id=EXCLUDED.clinic_id;
INSERT INTO public.saas_fixture_acceptance_jobs(id,kind,token_hash,expires_at)
 VALUES('8a0cbd19-6b52-4db9-991b-66711337e61b','identity',repeat('a',64),now()+interval '10 minutes');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE j jsonb; denied boolean; BEGIN
  denied:=false;
  BEGIN PERFORM public.saas_claim_fixture_acceptance_job('8a0cbd19-6b52-4db9-991b-66711337e61b',repeat('b',64));
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'WRONG_TOKEN_ACCEPTED'; END IF;
  denied:=false;
  BEGIN PERFORM public.saas_claim_fixture_acceptance_job('8a0cbd19-6b52-4db9-991b-66711337e61b',NULL);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'NULL_TOKEN_ACCEPTED'; END IF;
  j:=public.saas_claim_fixture_acceptance_job('8a0cbd19-6b52-4db9-991b-66711337e61b',repeat('a',64));
  IF jsonb_array_length(j->'fixtures')<>2 THEN RAISE EXCEPTION 'FIXTURE_COUNT_MISMATCH'; END IF;
  denied:=false;
  BEGIN PERFORM public.saas_claim_fixture_acceptance_job('8a0cbd19-6b52-4db9-991b-66711337e61b',repeat('a',64));
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'CONSUMED_TOKEN_REUSED'; END IF;
  denied:=false;
  BEGIN PERFORM public.saas_finish_fixture_acceptance_job('8a0cbd19-6b52-4db9-991b-66711337e61b',
    '{"contract":"dentalflow-fixture-acceptance-v1","passed":true,"access_token":"must never persist"}');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'TOKEN_LEAK_PERSISTED'; END IF;
  IF NOT public.saas_finish_fixture_acceptance_job('8a0cbd19-6b52-4db9-991b-66711337e61b',
    '{"contract":"dentalflow-fixture-acceptance-v1","passed":true,"checks":[{"check":"isolated_sql_only","passed":true}]}') THEN
    RAISE EXCEPTION 'RECEIPT_NOT_STORED';
  END IF;
  IF public.saas_finish_fixture_acceptance_job('8a0cbd19-6b52-4db9-991b-66711337e61b',
    '{"contract":"dentalflow-fixture-acceptance-v1","passed":true}') THEN RAISE EXCEPTION 'RECEIPT_OVERWRITTEN'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.saas_fixture_acceptance_jobs WHERE status='completed' AND token_hash IS NULL)
    THEN RAISE EXCEPTION 'CAPABILITY_RETAINED'; END IF;
END $$;
ROLLBACK;

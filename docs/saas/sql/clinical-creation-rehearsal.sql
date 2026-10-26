-- DISPOSABLE CI DATABASE ONLY. Synthetic SQL identities; never real MFA proof.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) VALUES
 ('72600000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','creation-a@example.invalid','',now(),now()),
 ('72600000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','creation-b@example.invalid','',now(),now()),
 ('72600000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','creation-user@example.invalid','',now(),now());
INSERT INTO public.clinics(id,name,owner_id,billing_exempt) VALUES
 ('72600000-0000-4000-8000-000000000010','Creation A','72600000-0000-4000-8000-000000000001',false),
 ('72600000-0000-4000-8000-000000000020','Creation B','72600000-0000-4000-8000-000000000002',false);
INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES
 ('72600000-0000-4000-8000-000000000010','72600000-0000-4000-8000-000000000001','CEO','active'),
 ('72600000-0000-4000-8000-000000000020','72600000-0000-4000-8000-000000000002','CEO','active'),
 ('72600000-0000-4000-8000-000000000010','72600000-0000-4000-8000-000000000003','USER','active');
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privilege_escalation;
UPDATE public.profiles SET clinic_id=CASE WHEN id='72600000-0000-4000-8000-000000000002' THEN '72600000-0000-4000-8000-000000000020'::uuid ELSE '72600000-0000-4000-8000-000000000010'::uuid END,
 role=CASE WHEN id='72600000-0000-4000-8000-000000000003' THEN 'USER' ELSE 'CEO' END,
 account_subtype=CASE WHEN id='72600000-0000-4000-8000-000000000003' THEN 'USER' ELSE 'CEO' END,is_default_admin=false
 WHERE id IN ('72600000-0000-4000-8000-000000000001','72600000-0000-4000-8000-000000000002','72600000-0000-4000-8000-000000000003');
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privilege_escalation;
INSERT INTO public.user_roles(user_id,role) VALUES ('72600000-0000-4000-8000-000000000002','admin') ON CONFLICT DO NOTHING;
INSERT INTO public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,provider_environment)
VALUES ('company','72600000-0000-4000-8000-000000000010','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox'),
 ('company','72600000-0000-4000-8000-000000000020','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox');

-- All identities here are synthetic and rolled back; not live Auth/MFA evidence.
DO $$ BEGIN
 IF has_function_privilege('anon','public.create_case_idempotent_v1(uuid,jsonb)','EXECUTE')
  OR has_function_privilege('service_role','public.create_case_idempotent_v1(uuid,jsonb)','EXECUTE')
  OR has_table_privilege('authenticated','public.clinical_creation_requests','UPDATE')
  OR has_table_privilege('authenticated','public.clinical_creation_requests','DELETE')
  OR has_table_privilege('service_role','public.clinical_creation_requests','INSERT')
  OR EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.create_case_idempotent_v1(uuid,jsonb)'::regprocedure,
   'public.create_patient_idempotent_v1(uuid,uuid,jsonb)'::regprocedure) AND prosecdef)
 THEN RAISE EXCEPTION 'CREATION_RLS_OR_PRIVATE_GRANTS_REOPENED'; END IF;
END $$;
INSERT INTO public.components(id,name,clinic_id) VALUES
 ('72600000-0000-4000-8000-000000000031','Own component','72600000-0000-4000-8000-000000000010'),
 ('72600000-0000-4000-8000-000000000032','Other component','72600000-0000-4000-8000-000000000020');
INSERT INTO public.burrs(id,name,material,clinic_id) VALUES
 ('72600000-0000-4000-8000-000000000033','Own burr','zirconia','72600000-0000-4000-8000-000000000010');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72600000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72600000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE p jsonb; r jsonb; repeated jsonb; input jsonb; type_id uuid; BEGIN
 p:=public.create_patient_idempotent_v1('72600000-0000-4000-8000-000000000040','72600000-0000-4000-8000-000000000041',
  '{"name":"  Same   Name ","phone":"11111111"}');
 IF p->>'clinic_id'<>'72600000-0000-4000-8000-000000000010' THEN RAISE EXCEPTION 'PATIENT_COMPANY_LOST'; END IF;
 IF public.create_patient_idempotent_v1('72600000-0000-4000-8000-000000000040','72600000-0000-4000-8000-000000000041',
  '{"name":"  Same   Name ","phone":"11111111"}')->>'id'<>p->>'id' THEN RAISE EXCEPTION 'PATIENT_RETRY_DUPLICATED'; END IF;
 BEGIN
  PERFORM public.create_patient_idempotent_v1('72600000-0000-4000-8000-000000000042','72600000-0000-4000-8000-000000000043','{"name":"same name"}');
  RAISE EXCEPTION 'SAME_NAME_WITHOUT_ID_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PATIENT_NAME_MATCH' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.create_patient_idempotent_v1('72600000-0000-4000-8000-000000000042','72600000-0000-4000-8000-000000000043','{"name":"same name","phone":"1111-1111"}');
  RAISE EXCEPTION 'SAME_NAME_SAME_ID_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PATIENT_NAME_MATCH' THEN RAISE; END IF; END;
 PERFORM public.create_patient_idempotent_v1('72600000-0000-4000-8000-000000000042','72600000-0000-4000-8000-000000000043','{"name":"same name","phone":"22222222"}');
 BEGIN
  PERFORM public.create_patient_idempotent_v1('72600000-0000-4000-8000-000000000040','72600000-0000-4000-8000-000000000041','{"name":"Edited attempt"}');
  RAISE EXCEPTION 'CHANGED_PATIENT_ATTEMPT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CREATION_KEY_CONFLICT' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.create_patient_idempotent_v1('72600000-0000-4000-8000-000000000044','72600000-0000-4000-8000-000000000045',
   '{"name":"Company spoof","clinic_id":"72600000-0000-4000-8000-000000000020"}');
  RAISE EXCEPTION 'FOREIGN_PATIENT_CREATED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CREATION_INVALID' THEN RAISE; END IF; END;
 SELECT id INTO type_id FROM public.case_types ORDER BY id LIMIT 1;
 input:=jsonb_build_object('id','72600000-0000-4000-8000-000000000050','patient_id',p->>'id','delivery_date',current_date+7,
  'arch','both','component_ids',jsonb_build_array('72600000-0000-4000-8000-000000000031'),
  'case_type_ids',jsonb_build_array(type_id),'teeth_numbers',jsonb_build_array(11,21),
  'teeth_zirconia',jsonb_build_array(11),'has_mockup',true,'prosthesis_groups',jsonb_build_array(jsonb_build_object('teeth',jsonb_build_array(11,21))));
 r:=public.create_case_idempotent_v1('72600000-0000-4000-8000-000000000051',input);
 repeated:=public.create_case_idempotent_v1('72600000-0000-4000-8000-000000000051',input);
 IF r IS DISTINCT FROM repeated OR jsonb_array_length(r->'cases')<>1
  OR r->'case'->>'arch'<>'both' OR (r->'case'->>'elements_count')::int<>2
  OR r->'case'->>'current_stage_id' IS NULL OR r->'case'->>'workflow_key' IS NULL
  OR (SELECT count(*) FROM public.case_components WHERE case_id=(r->'case'->>'id')::uuid)<>1
  OR (SELECT count(*) FROM public.case_types_link WHERE case_id=(r->'case'->>'id')::uuid)<>1
  OR (SELECT count(*) FROM public.case_stages WHERE case_id=(r->'case'->>'id')::uuid)<>1
  OR (SELECT count(*) FROM public.burr_usages WHERE case_id=(r->'case'->>'id')::uuid)<>1
  OR (SELECT count(*) FROM public.case_activity WHERE case_id=(r->'case'->>'id')::uuid AND kind='create')<>1
 THEN RAISE EXCEPTION 'CASE_ATOMIC_CREATION_OR_RETRY_LOST'; END IF;
 BEGIN
  PERFORM public.create_case_idempotent_v1('72600000-0000-4000-8000-000000000052',
   (input-'id')||'{"component_ids":["72600000-0000-4000-8000-000000000032"]}');
  RAISE EXCEPTION 'FOREIGN_COMPONENT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CREATION_FOREIGN_COMPONENT' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.cases WHERE patient_id=(p->>'id')::uuid)<>1
  OR EXISTS(SELECT 1 FROM public.clinical_creation_requests WHERE request_key='72600000-0000-4000-8000-000000000052')
 THEN RAISE EXCEPTION 'FAILED_CASE_PARTIALLY_COMMITTED'; END IF;
 PERFORM set_config('test.creation_input',input::text,true);
 BEGIN
  PERFORM public.create_case_idempotent_v1('72600000-0000-4000-8000-000000000051',input||'{"notes":"changed"}');
  RAISE EXCEPTION 'CHANGED_CASE_ATTEMPT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CREATION_KEY_CONFLICT' THEN RAISE; END IF; END;
 UPDATE public.cases SET notes='Confirmed edit',has_mockup=false WHERE id=(r->'case'->>'id')::uuid;
 repeated:=public.create_case_idempotent_v1('72600000-0000-4000-8000-000000000051',input);
 IF repeated->'case'->>'notes'<>'Confirmed edit' OR (repeated->'case'->>'has_mockup')::boolean THEN RAISE EXCEPTION 'RETRY_OVERWROTE_EDIT'; END IF;
 r:=public.create_case_idempotent_v1('72600000-0000-4000-8000-000000000053',(input-'id')||'{"arch":"superior","also_arch":"inferior"}');
 IF jsonb_array_length(r->'cases')<>2 OR r->'cases'->0->>'sibling_case_id'<>r->'cases'->1->>'id'
  OR r->'cases'->1->>'sibling_case_id'<>r->'cases'->0->>'id' THEN RAISE EXCEPTION 'LEGACY_SIBLING_PAIR_LOST'; END IF;
END $$;
RESET ROLE;
-- Deletion does not erase the append-only attempt receipt.
DELETE FROM public.cases WHERE id='72600000-0000-4000-8000-000000000050';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.create_case_idempotent_v1('72600000-0000-4000-8000-000000000051',current_setting('test.creation_input')::jsonb);
  RAISE EXCEPTION 'DELETED_CASE_RECREATED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CREATION_RESULT_UNAVAILABLE' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72600000-0000-4000-8000-000000000002"}',true);
SELECT set_config('request.jwt.claim.sub','72600000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.clinical_creation_requests) THEN RAISE EXCEPTION 'FOREIGN_RETRY_RECEIPTS_EXPOSED'; END IF;
 BEGIN
  PERFORM public.create_case_idempotent_v1('72600000-0000-4000-8000-000000000061',current_setting('test.creation_input')::jsonb);
  RAISE EXCEPTION 'FOREIGN_PATIENT_CASE_CREATED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'passed' AS clinical_creation_rehearsal;
ROLLBACK;

-- DISPOSABLE CI DATABASE ONLY. Synthetic SQL identities; never real MFA proof.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) VALUES
 ('72400000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','configuration-a@example.invalid','',now(),now()),
 ('72400000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','configuration-b@example.invalid','',now(),now()),
 ('72400000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','configuration-user@example.invalid','',now(),now());
INSERT INTO public.clinics(id,name,owner_id,billing_exempt) VALUES
 ('72400000-0000-4000-8000-000000000010','Configuration A','72400000-0000-4000-8000-000000000001',false),
 ('72400000-0000-4000-8000-000000000020','Configuration B','72400000-0000-4000-8000-000000000002',false);
INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES
 ('72400000-0000-4000-8000-000000000010','72400000-0000-4000-8000-000000000001','CEO','active'),
 ('72400000-0000-4000-8000-000000000020','72400000-0000-4000-8000-000000000002','CEO','active'),
 ('72400000-0000-4000-8000-000000000010','72400000-0000-4000-8000-000000000003','USER','active');
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privilege_escalation;
UPDATE public.profiles SET clinic_id=CASE WHEN id='72400000-0000-4000-8000-000000000002' THEN '72400000-0000-4000-8000-000000000020'::uuid ELSE '72400000-0000-4000-8000-000000000010'::uuid END,
 role=CASE WHEN id='72400000-0000-4000-8000-000000000003' THEN 'USER' ELSE 'CEO' END,
 account_subtype=CASE WHEN id='72400000-0000-4000-8000-000000000003' THEN 'USER' ELSE 'CEO' END,is_default_admin=false
 WHERE id IN ('72400000-0000-4000-8000-000000000001','72400000-0000-4000-8000-000000000002','72400000-0000-4000-8000-000000000003');
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privilege_escalation;
INSERT INTO public.user_roles(user_id,role) VALUES ('72400000-0000-4000-8000-000000000002','admin') ON CONFLICT DO NOTHING;
INSERT INTO public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,provider_environment)
VALUES ('company','72400000-0000-4000-8000-000000000010','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox'),
 ('company','72400000-0000-4000-8000-000000000020','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox');

INSERT INTO public.patients(id,name,clinic_id) VALUES
 ('72400000-0000-4000-8000-000000000013','Disposable A','72400000-0000-4000-8000-000000000010'),
 ('72400000-0000-4000-8000-000000000023','Disposable B','72400000-0000-4000-8000-000000000020');
INSERT INTO public.cases(id,patient_id,requested_by,status,delivery_date,finished_at) VALUES
 ('72400000-0000-4000-8000-000000000014','72400000-0000-4000-8000-000000000013','72400000-0000-4000-8000-000000000001','pendente',current_date+7,NULL),
 ('72400000-0000-4000-8000-000000000015','72400000-0000-4000-8000-000000000013','72400000-0000-4000-8000-000000000001','finalizado',current_date+7,now()),
 ('72400000-0000-4000-8000-000000000024','72400000-0000-4000-8000-000000000023','72400000-0000-4000-8000-000000000002','pendente',current_date+7,NULL);
CREATE TEMP TABLE config_rehearsal_ids AS SELECT clinic_id,id AS entry_id,phase_id FROM public.stages WHERE stage_key='entry' AND flow_key='common' AND clinic_id IN ('72400000-0000-4000-8000-000000000010','72400000-0000-4000-8000-000000000020');
GRANT SELECT ON config_rehearsal_ids TO authenticated;
CREATE TEMP TABLE config_rehearsal_before AS SELECT id,to_jsonb(c) AS row FROM public.cases c WHERE id IN ('72400000-0000-4000-8000-000000000015','72400000-0000-4000-8000-000000000024');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72400000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72400000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; refused boolean; other uuid; own uuid; payload jsonb; n bigint; BEGIN
 IF NOT public.current_user_can_manage_workflow() OR (SELECT count(*) FROM public.workflow_templates)<>4 OR (SELECT count(*) FROM public.workflow_settings)<>1 THEN RAISE EXCEPTION 'COMPANY_CONFIG_BOOTSTRAP_OR_READ_FAILED'; END IF;
 IF EXISTS(SELECT 1 FROM public.phases WHERE clinic_id='72400000-0000-4000-8000-000000000020') OR EXISTS(SELECT 1 FROM public.workflow_templates WHERE clinic_id='72400000-0000-4000-8000-000000000020') THEN RAISE EXCEPTION 'FOREIGN_CONFIG_EXPOSED'; END IF;
 PERFORM public.update_company_workflow_settings('{"progress_bar_enabled":false}');
 IF (SELECT progress_bar_enabled FROM public.workflow_settings) THEN RAISE EXCEPTION 'OWN_SETTINGS_NOT_UPDATED'; END IF;
 SELECT entry_id INTO other FROM config_rehearsal_ids WHERE clinic_id='72400000-0000-4000-8000-000000000020';
 UPDATE public.stages SET name='not applied' WHERE id=other; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FOREIGN_STAGE_UPDATED'; END IF;
 refused:=false; BEGIN INSERT INTO public.phases(name,position,clinic_id) VALUES('Spoof',10,'72400000-0000-4000-8000-000000000020'); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END; IF NOT refused THEN RAISE EXCEPTION 'FOREIGN_PHASE_INSERTED'; END IF;
 payload:=public.workflow_default_stages('common');
 r:=public.save_workflow_template('common',payload,false); IF r->>'success'<>'true' OR r->>'version'<>'2' THEN RAISE EXCEPTION 'OWN_TEMPLATE_NOT_SAVED'; END IF;
 IF (SELECT workflow_version FROM public.cases WHERE id='72400000-0000-4000-8000-000000000014')<>1 THEN RAISE EXCEPTION 'HISTORICAL_CASE_MIGRATED_WITHOUT_CONSENT'; END IF;
 SELECT id INTO own FROM public.stages WHERE clinic_id='72400000-0000-4000-8000-000000000010' AND flow_key='common' AND workflow_version=1 AND stage_key='cad';
 r:=public.advance_case_workflow('72400000-0000-4000-8000-000000000014',own); IF r->>'success'<>'true' OR (SELECT workflow_version FROM public.cases WHERE id='72400000-0000-4000-8000-000000000014')<>1 THEN RAISE EXCEPTION 'HISTORICAL_CASE_ADVANCE_FAILED'; END IF;
 refused:=false; BEGIN PERFORM public.save_workflow_template('common',jsonb_set(payload,'{0,source_id}',to_jsonb(other::text)),false); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END; IF NOT refused THEN RAISE EXCEPTION 'FOREIGN_ASSIGNMENT_SOURCE_COPIED'; END IF;
 r:=public.save_workflow_template('common',payload,true); IF r->>'success'<>'true' OR (SELECT workflow_version FROM public.cases WHERE id='72400000-0000-4000-8000-000000000014')<>3 THEN RAISE EXCEPTION 'OWN_OPEN_CASE_NOT_MIGRATED'; END IF;
 refused:=false; BEGIN INSERT INTO public.stage_assignments(stage_id,user_id) VALUES(own,'72400000-0000-4000-8000-000000000002'); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END; IF NOT refused THEN RAISE EXCEPTION 'FOREIGN_PROFESSIONAL_ASSIGNED'; END IF;
 refused:=false; BEGIN INSERT INTO public.case_types(name) VALUES('Must not become a shared catalog'); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END; IF NOT refused THEN RAISE EXCEPTION 'SHARED_DICTIONARY_WRITABLE'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true); SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM config_rehearsal_before b JOIN public.cases c ON c.id=b.id WHERE b.row IS DISTINCT FROM to_jsonb(c)) THEN RAISE EXCEPTION 'OTHER_OR_FINISHED_CASE_CHANGED'; END IF;
 IF (SELECT progress_bar_enabled FROM public.workflow_settings WHERE clinic_id='72400000-0000-4000-8000-000000000020') IS NOT TRUE THEN RAISE EXCEPTION 'FOREIGN_SETTINGS_CHANGED'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72400000-0000-4000-8000-000000000002"}',true);
SELECT set_config('request.jwt.claim.sub','72400000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE refused boolean; BEGIN
 refused:=false; BEGIN PERFORM public.advance_case_workflow('72400000-0000-4000-8000-000000000014',NULL); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END; IF NOT refused THEN RAISE EXCEPTION 'GLOBAL_ADMIN_ADVANCED_FOREIGN_CASE'; END IF;
 IF EXISTS(SELECT 1 FROM public.workflow_templates WHERE clinic_id='72400000-0000-4000-8000-000000000010') THEN RAISE EXCEPTION 'GLOBAL_ADMIN_READ_FOREIGN_CONFIG'; END IF;
END $$;
RESET ROLE; SELECT set_config('request.jwt.claims','{}',true); SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.account_subscriptions SET status='suspended' WHERE clinic_id='72400000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72400000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72400000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE refused boolean; BEGIN
 IF EXISTS(SELECT 1 FROM public.workflow_templates) THEN RAISE EXCEPTION 'SUSPENDED_CONFIG_READ_ALLOWED'; END IF;
 refused:=false; BEGIN PERFORM public.update_company_workflow_settings('{"progress_bar_enabled":true}'); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END; IF NOT refused THEN RAISE EXCEPTION 'SUSPENDED_CONFIG_WRITE_ALLOWED'; END IF;
END $$;
ROLLBACK;
SELECT 'passed' AS company_workflow_rehearsal;

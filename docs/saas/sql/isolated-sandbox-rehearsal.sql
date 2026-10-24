-- DISPOSABLE CI DATABASE ONLY. No Asaas calls and no real Auth/MFA proof.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
VALUES ('ee083f63-1621-4b82-b7a4-fd13427c0b14','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'dentalflow-acceptance-20261004-e0537565-4015-4ffe-a249-5da489824e6e@example.invalid','',now(),now(),now(),'{"acceptance_fixture":true}'),
 ('24e7cdf9-457e-4af2-b1cb-cf366abbddb0','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'dentalflow-acceptance-20261004-237e6ef4-9893-43d2-b9a3-311f8708aa3d@example.invalid','',now(),now(),now(),'{"acceptance_fixture":true}');
INSERT INTO public.clinics(id,name,owner_id,billing_exempt) VALUES
 ('081d3db4-1606-40f7-a878-19b51556317d','Disposable fixture A','ee083f63-1621-4b82-b7a4-fd13427c0b14',false),
 ('3fc86c40-697e-4725-a9e9-633fc882aadc','Disposable fixture B','24e7cdf9-457e-4af2-b1cb-cf366abbddb0',false);
INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES
 ('081d3db4-1606-40f7-a878-19b51556317d','ee083f63-1621-4b82-b7a4-fd13427c0b14','USER','active'),
 ('3fc86c40-697e-4725-a9e9-633fc882aadc','24e7cdf9-457e-4af2-b1cb-cf366abbddb0','USER','active');
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privilege_escalation;
INSERT INTO public.profiles(id,clinic_id,role) VALUES
 ('ee083f63-1621-4b82-b7a4-fd13427c0b14','081d3db4-1606-40f7-a878-19b51556317d','USER'),
 ('24e7cdf9-457e-4af2-b1cb-cf366abbddb0','3fc86c40-697e-4725-a9e9-633fc882aadc','USER')
ON CONFLICT(id) DO UPDATE SET clinic_id=EXCLUDED.clinic_id;
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privilege_escalation;

INSERT INTO public.account_subscriptions(id,scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,provider_environment,external_customer_id,external_subscription_id)
VALUES('92400000-0000-4000-8000-000000000010','company','081d3db4-1606-40f7-a878-19b51556317d','company_growth','active',24,now(),now()+interval '1 month','asaas','sandbox','cus_scopeA','sub_scopeA'),
('92400000-0000-4000-8000-000000000020','company','3fc86c40-697e-4725-a9e9-633fc882aadc','company_growth','active',24,now(),now()+interval '1 month','asaas','sandbox','cus_scopeB','sub_scopeB');
INSERT INTO public.saas_fixture_acceptance_jobs(id,kind,expires_at,status,claimed_at)
VALUES('92400000-0000-4000-8000-000000000001','reconciliation',now()+interval '10 minutes','running',now());
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.saas_fixture_reconciliation_resources','select')
  OR has_table_privilege('service_role','public.saas_fixture_reconciliation_resources','select')
  OR has_function_privilege('authenticated','public.saas_register_fixture_reconciliation_resource(uuid,uuid,text)','execute')
  OR has_function_privilege('anon','public.saas_claim_fixture_asaas_events(uuid)','execute')
  OR has_function_privilege('service_role','public.saas_assert_fixture_reconciliation_job(uuid)','execute')
  OR NOT has_function_privilege('service_role','public.saas_claim_fixture_asaas_events(uuid)','execute') THEN
  RAISE EXCEPTION 'FIXTURE_RECONCILIATION_GRANTS_UNSAFE'; END IF;
END $$;
UPDATE public.account_subscriptions SET provider_environment='production' WHERE id='92400000-0000-4000-8000-000000000020';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean; n bigint; baseline text; BEGIN
 baseline:=public.saas_fixture_business_fingerprint('92400000-0000-4000-8000-000000000001');
 denied:=false; BEGIN PERFORM public.saas_register_fixture_reconciliation_resource('92400000-0000-4000-8000-000000000001','92400000-0000-4000-8000-000000000020','pay_scopeB'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'PRODUCTION_FIXTURE_RESOURCE_REGISTERED'; END IF;
 IF NOT public.saas_register_fixture_reconciliation_resource('92400000-0000-4000-8000-000000000001','92400000-0000-4000-8000-000000000010','pay_scopeA') THEN RAISE EXCEPTION 'OWN_RESOURCE_NOT_REGISTERED'; END IF;
 denied:=false; BEGIN PERFORM public.saas_register_fixture_reconciliation_resource('92400000-0000-4000-8000-000000000001','92400000-0000-4000-8000-000000000010','pay_other'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'FIXTURE_RESOURCE_REPLACED'; END IF;
 denied:=false; BEGIN PERFORM public.saas_register_fixture_reconciliation_resource('92400000-0000-4000-8000-000000000001','92400000-0000-4000-8000-000000000099','pay_foreign'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'FOREIGN_RESOURCE_REGISTERED'; END IF;
 denied:=false; BEGIN PERFORM public.saas_enqueue_fixture_asaas_recovery('92400000-0000-4000-8000-000000000001','pay_foreign','RECEIVED'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'UNREGISTERED_RECOVERY_ENQUEUED'; END IF;
 denied:=false; BEGIN PERFORM public.saas_enqueue_fixture_asaas_recovery('92400000-0000-4000-8000-000000000001','pay_scopeA','REFUNDED'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'UNSUPPORTED_RECOVERY_ENQUEUED'; END IF;
 IF NOT public.saas_enqueue_fixture_asaas_recovery('92400000-0000-4000-8000-000000000001','pay_scopeA','RECEIVED')
  OR public.saas_enqueue_fixture_asaas_recovery('92400000-0000-4000-8000-000000000001','pay_scopeA','RECEIVED') THEN RAISE EXCEPTION 'RECOVERY_NOT_IDEMPOTENT'; END IF;
 IF baseline IS DISTINCT FROM public.saas_fixture_business_fingerprint('92400000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'FINGERPRINT_CHANGED_WITHOUT_BUSINESS_WRITE'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.billing_events(provider,provider_environment,provider_event_id,event_type,payload,status)
VALUES('asaas','production','evt_production_fixture_scope','PAYMENT_RECEIVED','{"paymentId":"pay_scopeA"}','received'),
('asaas','sandbox','evt_other_fixture_scope','PAYMENT_RECEIVED','{"paymentId":"pay_unregistered"}','received'),
('asaas','sandbox','evt_external_manual_fixture_scope','PAYMENT_RECEIVED','{"paymentId":"pay_external"}','dead_letter');
SET LOCAL ROLE service_role;
DO $$ DECLARE n bigint; e record; BEGIN
 SELECT count(*) INTO n FROM public.saas_claim_fixture_asaas_events('92400000-0000-4000-8000-000000000001');
 IF n<>1 THEN RAISE EXCEPTION 'SCOPED_CLAIM_DID_NOT_ISOLATE'; END IF;
 SELECT count(*) INTO n FROM public.saas_claim_fixture_asaas_events('92400000-0000-4000-8000-000000000001');
 IF n<>0 THEN RAISE EXCEPTION 'LIVE_LEASE_CLAIMED_TWICE'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.billing_events WHERE provider_event_id IN('evt_production_fixture_scope','evt_other_fixture_scope') AND status<>'received')
  OR EXISTS(SELECT 1 FROM public.billing_events WHERE provider_event_id='evt_external_manual_fixture_scope' AND status<>'dead_letter') THEN RAISE EXCEPTION 'UNRELATED_EVENTS_CHANGED'; END IF;
END $$;
UPDATE public.saas_fixture_acceptance_jobs SET expires_at=now()-interval '1 second' WHERE id='92400000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM public.saas_claim_fixture_asaas_events('92400000-0000-4000-8000-000000000001'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'EXPIRED_FIXTURE_JOB_ACCEPTED'; END IF;
END $$;
ROLLBACK;
SELECT 'passed' AS isolated_sandbox_scope;

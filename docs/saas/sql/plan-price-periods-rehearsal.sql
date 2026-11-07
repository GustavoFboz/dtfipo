-- DISPOSABLE CLEAN CI DATABASE ONLY. Fake Auth/MFA/provider proofs here are
-- rolled back; this is not a real Auth, Asaas payment or acceptance receipt.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) VALUES
 ('92800000-0000-4000-8000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','period-owner@test.invalid','',now(),now()),
 ('92800000-0000-4000-8000-000000000020','00000000-0000-0000-0000-000000000000','authenticated','authenticated','period-master@test.invalid','',now(),now());
INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal,not_after) VALUES
 ('92800000-0000-4000-8000-000000000021','92800000-0000-4000-8000-000000000020',now(),now(),'aal2',now()+interval '1 hour');
INSERT INTO public.platform_operators(user_id,enabled,enrolled_by) VALUES('92800000-0000-4000-8000-000000000020',true,'isolated period rehearsal');
INSERT INTO public.clinics(id,name,slug,owner_id) VALUES
 ('92800000-0000-4000-8000-000000000030','Period rehearsal','period-rehearsal','92800000-0000-4000-8000-000000000010');
INSERT INTO public.account_subscriptions(id,scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,
 billing_provider,provider_environment,billing_cycle,external_customer_id,external_subscription_id) VALUES
 ('92800000-0000-4000-8000-000000000040','company','92800000-0000-4000-8000-000000000030','company_growth','active',18,
 current_date-10,current_date+20,'asaas','sandbox','MONTHLY','cus_PlanPeriods','sub_PlanPeriods');
INSERT INTO public.billing_payments(id,subscription_id,clinic_id,amount_cents,currency,status,provider,provider_environment,provider_payment_id,paid_at,period_start,period_end) VALUES
 ('92800000-0000-4000-8000-000000000041','92800000-0000-4000-8000-000000000040','92800000-0000-4000-8000-000000000030',44900,'BRL','paid','asaas','sandbox','pay_OldPeriod',now(),current_date-10,current_date+20);
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.billing_plan_periods','SELECT')
 OR has_table_privilege('service_role','public.billing_plan_periods','INSERT')
 OR has_table_privilege('authenticated','public.billing_plan_change_executions','SELECT')
 OR has_function_privilege('authenticated','public.billing_finish_plan_change(uuid,uuid,jsonb,text)','EXECUTE')
 OR has_function_privilege('service_role','public.platform_master_claim_plan_change(uuid,text,text,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public.billing_plan_request_ready(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.billing_subscription_price_context(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.billing_refresh_due_plan_periods(text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.billing_refresh_due_plan_periods(text)','EXECUTE') THEN
 RAISE EXCEPTION 'Plan periods private boundary reopened'; END IF;
END $$;

SELECT set_config('request.jwt.claims','{"sub":"92800000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE q jsonb;r jsonb; BEGIN
 q:=(public.billing_company_change_context('92800000-0000-4000-8000-000000000030')->'plan_quotes')->0;
 -- Select the initial plan explicitly, independent of display order.
 SELECT value INTO q FROM jsonb_array_elements(public.billing_company_change_context('92800000-0000-4000-8000-000000000030')->'plan_quotes') WHERE value->>'target_plan_code'='company_initial';
 IF q->>'block_reason' IS NOT NULL THEN RAISE EXCEPTION 'Clean downgrade unexpectedly blocked'; END IF;
 r:=public.billing_submit_change_request('92800000-0000-4000-8000-000000000030','92800000-0000-4000-8000-000000000040','change_plan','company_initial',q->>'quote_token');
 PERFORM set_config('test.period_request',r->>'id',true);
 BEGIN PERFORM public.platform_master_claim_plan_change((r->>'id')::uuid,'sandbox','Owner must not authorize provider writes',false);
 RAISE EXCEPTION 'Owner acquired Master authority'; EXCEPTION WHEN OTHERS THEN IF sqlerrm<>'BILLING_CANCEL_FORBIDDEN' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','92800000-0000-4000-8000-000000000020','role','authenticated','aal','aal1',
 'session_id','92800000-0000-4000-8000-000000000021','exp',floor(extract(epoch from now()))::bigint+3600)::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.platform_master_claim_plan_change(current_setting('test.period_request')::uuid,'sandbox','AAL1 cannot authorize plan price changes',false);
 RAISE EXCEPTION 'AAL1 acquired plan authority'; EXCEPTION WHEN OTHERS THEN IF sqlerrm<>'BILLING_CANCEL_MFA_REQUIRED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','92800000-0000-4000-8000-000000000020','role','authenticated','aal','aal2',
 'session_id','92800000-0000-4000-8000-000000000021','exp',floor(extract(epoch from now()))::bigint+3600)::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE c jsonb; BEGIN
 c:=public.platform_master_claim_plan_change(current_setting('test.period_request')::uuid,'sandbox','Master explicitly reviewed period and limits',false);
 PERFORM set_config('test.period_lease',c->>'lease_token',true);
 BEGIN PERFORM public.platform_master_claim_plan_change(current_setting('test.period_request')::uuid,'sandbox','Concurrent claim must remain blocked',false);
 RAISE EXCEPTION 'Concurrent plan lease accepted'; EXCEPTION WHEN OTHERS THEN IF sqlerrm<>'BILLING_PLAN_BUSY' THEN RAISE; END IF; END;
 IF NOT public.platform_master_begin_plan_change_write(current_setting('test.period_request')::uuid,(c->>'lease_token')::uuid) THEN RAISE EXCEPTION 'First write rejected'; END IF;
 BEGIN PERFORM public.platform_master_begin_plan_change_write(current_setting('test.period_request')::uuid,(c->>'lease_token')::uuid);
 RAISE EXCEPTION 'Repeated plan mutation accepted'; EXCEPTION WHEN OTHERS THEN IF sqlerrm<>'BILLING_PLAN_WRITE_NOT_AUTHORIZED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE r text;c jsonb; BEGIN
 r:=public.billing_finish_plan_change(current_setting('test.period_request')::uuid,current_setting('test.period_lease')::uuid,NULL,'PROVIDER_RESULT_UNCONFIRMED');
 IF r<>'review_required' THEN RAISE EXCEPTION 'Ambiguous write counted as completed'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','92800000-0000-4000-8000-000000000020','role','authenticated','aal','aal2',
 'session_id','92800000-0000-4000-8000-000000000021','exp',floor(extract(epoch from now()))::bigint+3600)::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE c jsonb; BEGIN
 c:=public.platform_master_claim_plan_change(current_setting('test.period_request')::uuid,'sandbox','Readback of an interrupted financial operation',false);
 IF NOT (c->>'reconcile_only')::boolean THEN RAISE EXCEPTION 'Interrupted operation can write again'; END IF;
 PERFORM set_config('test.period_lease',c->>'lease_token',true);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE r text;amount integer; BEGIN
 SELECT monthly_price_cents INTO amount FROM public.billing_plans WHERE code='company_initial';
 r:=public.billing_finish_plan_change(current_setting('test.period_request')::uuid,current_setting('test.period_lease')::uuid,
  jsonb_build_object('id','sub_PlanPeriods','customer','cus_PlanPeriods','externalReference','dentalflow:subscription:92800000-0000-4000-8000-000000000040',
   'value',amount/100.0,'cycle','MONTHLY','status','ACTIVE','deleted',false,'billingType','UNDEFINED','nextDueDate',(current_date+20)::text,
   'invoice_digest',repeat('a',64),'invoice_count',0),NULL);
 IF r<>'completed' THEN RAISE EXCEPTION 'Verified readback did not schedule period'; END IF;
 IF public.billing_subscription_period_amount('92800000-0000-4000-8000-000000000040',current_date)<>44900
 OR public.billing_subscription_period_amount('92800000-0000-4000-8000-000000000040',current_date+20)<>amount
 OR public.billing_subscription_contract_amount('92800000-0000-4000-8000-000000000040')<>44900
 OR public.billing_subscription_provider_amount('92800000-0000-4000-8000-000000000040')<>amount THEN RAISE EXCEPTION 'Period price boundaries are wrong'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT plan_code FROM public.account_subscriptions WHERE id='92800000-0000-4000-8000-000000000040')<>'company_growth'
 OR (SELECT count(*) FROM public.billing_payments WHERE subscription_id='92800000-0000-4000-8000-000000000040')<>1
 OR (SELECT count(*) FROM public.billing_plan_change_executions WHERE provider_write_started_at IS NOT NULL AND request_id=current_setting('test.period_request')::uuid)<>1 THEN
 RAISE EXCEPTION 'Scheduling changed current entitlement/history or duplicated a write'; END IF;
END $$;

-- A genuinely future paid period is recorded, but does not grant its plan early.
INSERT INTO public.billing_events(id,provider,provider_environment,provider_event_id,event_type,payload,status,lease_token,lease_until) VALUES
 ('92800000-0000-4000-8000-000000000050','asaas','sandbox','evt_PeriodFuture','PAYMENT_RECEIVED','{"paymentId":"pay_NewPeriod"}','processing','92800000-0000-4000-8000-000000000051',now()+interval '1 minute');
SET LOCAL ROLE service_role;
DO $$ DECLARE amount integer;BEGIN
 SELECT monthly_price_cents INTO amount FROM public.billing_plans WHERE code='company_initial';
 PERFORM public.billing_apply_asaas_payment_lifecycle('92800000-0000-4000-8000-000000000050','92800000-0000-4000-8000-000000000051',
  'pay_NewPeriod','cus_PlanPeriods','sub_PlanPeriods',amount,current_date+20,'RECEIVED');
 IF (SELECT plan_code FROM public.account_subscriptions WHERE id='92800000-0000-4000-8000-000000000040')<>'company_growth' THEN RAISE EXCEPTION 'Early payment granted plan before date'; END IF;
END $$;
RESET ROLE;

-- Seed the same disposable fixture at its effective date, without changing now().
UPDATE public.billing_plan_periods SET effective_date=current_date-1 WHERE subscription_id='92800000-0000-4000-8000-000000000040';
UPDATE public.billing_payments SET period_end=current_date-1 WHERE provider_payment_id='pay_OldPeriod';
UPDATE public.billing_payments SET period_start=current_date-1,period_end=current_date+29 WHERE provider_payment_id='pay_NewPeriod';
UPDATE public.account_subscriptions SET current_period_start=current_date-1,current_period_end=current_date+29 WHERE id='92800000-0000-4000-8000-000000000040';
-- Metadata-only storage fixture: both ready files and reservations count. No
-- actual object is uploaded and no such mutation is run against the live DB.
INSERT INTO public.storage_files(id,clinic_id,bucket,object_path,source_type,original_name,size_bytes,status,uploaded_by)
SELECT '92800000-0000-4000-8000-000000000060','92800000-0000-4000-8000-000000000030','case-files','period-rehearsal/quota',
 'other','quota-fixture',(quote_snapshot->>'target_storage_bytes')::bigint+1,'reserved','92800000-0000-4000-8000-000000000010'
 FROM public.billing_plan_periods WHERE subscription_id='92800000-0000-4000-8000-000000000040';
SET LOCAL ROLE service_role;
DO $$ DECLARE outcome text;stored_status text;preserved boolean; BEGIN
 outcome:=public.billing_refresh_subscription_plan('92800000-0000-4000-8000-000000000040');
 SELECT status INTO stored_status FROM public.account_subscriptions WHERE id='92800000-0000-4000-8000-000000000040';
 SELECT EXISTS(SELECT 1 FROM public.storage_files WHERE id='92800000-0000-4000-8000-000000000060') INTO preserved;
 IF outcome<>'review_required' OR stored_status<>'suspended' OR NOT preserved THEN
 RAISE EXCEPTION 'Over-limit activation expected review/suspended/preserved, got %/%/%',outcome,stored_status,preserved; END IF;
END $$;
RESET ROLE;
-- Resolve only the disposable excess and observe a local activation, not a new charge.
UPDATE public.storage_files SET size_bytes=1 WHERE id='92800000-0000-4000-8000-000000000060';
SET LOCAL ROLE service_role;
DO $$ DECLARE outcome text;diagnostic jsonb; BEGIN
 outcome:=public.billing_refresh_subscription_plan('92800000-0000-4000-8000-000000000040');
 IF outcome<>'activated'
 OR (SELECT plan_code FROM public.account_subscriptions WHERE id='92800000-0000-4000-8000-000000000040')<>'company_initial'
 OR (SELECT status FROM public.account_subscriptions WHERE id='92800000-0000-4000-8000-000000000040')<>'active' THEN
 SELECT jsonb_build_object('outcome',outcome,'status',s.status,'plan',s.plan_code,'metadata',s.metadata,
  'used',(SELECT sum(size_bytes) FROM public.storage_files WHERE clinic_id=s.clinic_id),
  'paid',(SELECT amount_cents FROM public.billing_payments WHERE provider_payment_id='pay_NewPeriod'),
  'target_amount',t.amount_cents,'target_members',t.quote_snapshot->'target_max_members','actual_members_limit',p.max_members,
  'target_sessions',t.quote_snapshot->'target_max_sessions','actual_sessions_limit',p.max_sessions,
  'target_features',t.quote_snapshot->'target_features','actual_features',p.features)
 INTO diagnostic FROM public.account_subscriptions s JOIN public.billing_plan_periods t ON t.subscription_id=s.id
 JOIN public.billing_plans p ON p.code=t.plan_code WHERE s.id='92800000-0000-4000-8000-000000000040';
 RAISE EXCEPTION 'Paid due plan did not activate: %',diagnostic; END IF;
 IF (SELECT amount_cents FROM public.billing_payments WHERE provider_payment_id='pay_OldPeriod')<>44900 THEN RAISE EXCEPTION 'Historical invoice was repriced'; END IF;
 IF public.billing_refresh_subscription_plan('92800000-0000-4000-8000-000000000040')<>'unchanged' THEN RAISE EXCEPTION 'Activation repeated'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'passed' AS plan_price_periods_disposable_rehearsal;

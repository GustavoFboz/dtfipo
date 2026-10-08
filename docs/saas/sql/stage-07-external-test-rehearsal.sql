-- Disposable clean restore only. No live auth claims are fabricated.
begin;
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('71500000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','external-review@test.invalid','',now(),now());
insert into public.clinics(id,name,slug,owner_id)
values ('71500000-0000-4000-8000-000000000002','External review rehearsal','external-review-rehearsal',
  '71500000-0000-4000-8000-000000000001');
insert into public.account_subscriptions(id,scope_type,clinic_id,plan_code,status,billing_day,
  current_period_start,current_period_end,billing_provider,provider_environment,external_customer_id,external_subscription_id)
values ('71500000-0000-4000-8000-000000000003','company','71500000-0000-4000-8000-000000000002',
  'company_initial','active',5,now(),now()+interval '1 month','asaas','sandbox','cus_ExternalReview','sub_ExternalReview');
insert into public.billing_payments(subscription_id,clinic_id,amount_cents,currency,status,provider,
  provider_environment,provider_payment_id,paid_at,period_start,period_end)
values ('71500000-0000-4000-8000-000000000003','71500000-0000-4000-8000-000000000002',100,'BRL','paid',
  'asaas','sandbox','pay_ExternalLedgerFixture',now(),now(),now()+interval '1 month');
insert into public.checkout_intents(user_id,clinic_id,subscription_id,plan_code,amount_cents,currency,
  status,billing_provider,provider_environment,provider_payment_id)
values ('71500000-0000-4000-8000-000000000001','71500000-0000-4000-8000-000000000002',
  '71500000-0000-4000-8000-000000000003','company_initial',100,'BRL','provider_created','asaas','sandbox','pay_ExternalCheckoutFixture');
insert into public.billing_events(provider,provider_environment,provider_event_id,event_type,payload,status,attempt_count)
values
 ('asaas','sandbox','evt_external_manual_test','PAYMENT_RECEIVED','{"paymentId":"pay_ExternalManualFixture"}','dead_letter',6),
 ('asaas','sandbox','evt_external_ledger_test','PAYMENT_RECEIVED','{"paymentId":"pay_ExternalLedgerFixture"}','dead_letter',6),
 ('asaas','sandbox','evt_external_checkout_test','PAYMENT_RECEIVED','{"paymentId":"pay_ExternalCheckoutFixture"}','dead_letter',6),
 ('asaas','sandbox','evt_external_snapshot_test','PAYMENT_RECEIVED','{"paymentId":"pay_ExternalManualFixture","subscriptionId":"sub_ExternalReview"}','dead_letter',6),
 ('asaas','sandbox','evt_external_reconcile_test','PAYMENT_RECEIVED','{"paymentId":"pay_ExternalManualFixture","source":"reconciliation"}','dead_letter',6),
 ('asaas','sandbox','evt_external_processing_test','PAYMENT_RECEIVED','{"paymentId":"pay_ExternalManualFixture"}','processing',1),
 ('asaas','production','evt_external_production_test','PAYMENT_RECEIVED','{"paymentId":"pay_ExternalProductionFixture"}','dead_letter',6);
create temporary table external_review_financial_baseline as
select jsonb_build_object(
 'contracts',(select jsonb_agg(to_jsonb(s) order by id) from public.account_subscriptions s),
 'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.billing_payments p),
 'intents',(select jsonb_agg(to_jsonb(c) order by id) from public.checkout_intents c)) as snapshot;

do $$ begin
 if has_function_privilege('anon','public.platform_master_close_external_sandbox_test(text,text,text,boolean)','execute')
   or has_function_privilege('service_role','public.platform_master_close_external_sandbox_test(text,text,text,boolean)','execute') then
   raise exception 'External-test review exposed to anonymous/service role';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"71500000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','71500000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 begin
  perform public.platform_master_close_external_sandbox_test('sandbox','evt_external_manual_test','External manual test reviewed',true);
  raise exception 'Unenrolled account closed a review';
 exception when others then if sqlerrm <> 'PLATFORM_MASTER_FORBIDDEN' then raise; end if; end;
end $$;
reset role;
insert into public.platform_operators(user_id,enrolled_by,enabled)
values ('71500000-0000-4000-8000-000000000001','disposable external review',false);
set local role authenticated;
do $$ begin
 begin
  perform public.platform_master_close_external_sandbox_test('sandbox','evt_external_manual_test','External manual test reviewed',true);
  raise exception 'Disabled operator closed a review';
 exception when others then if sqlerrm <> 'PLATFORM_MASTER_FORBIDDEN' then raise; end if; end;
end $$;
reset role;
update public.platform_operators set enabled=true where user_id='71500000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"71500000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
 begin
  perform public.platform_master_close_external_sandbox_test('sandbox','evt_external_manual_test','External manual test reviewed',true);
  raise exception 'AAL1 operator closed a review';
 exception when others then if sqlerrm <> 'PLATFORM_MASTER_REAUTH_REQUIRED' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"71500000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$ declare v_ref text; begin
 begin
  perform public.platform_master_close_external_sandbox_test('production','evt_external_production_test','External manual test reviewed',true);
  raise exception 'Production event was closed';
 exception when others then if sqlerrm <> 'PLATFORM_MASTER_EXTERNAL_TEST_CONFIRMATION_REQUIRED' then raise; end if; end;
 begin
  perform public.platform_master_close_external_sandbox_test('sandbox','evt_external_manual_test','External manual test reviewed',false);
  raise exception 'Unconfirmed manual test was closed';
 exception when others then if sqlerrm <> 'PLATFORM_MASTER_EXTERNAL_TEST_CONFIRMATION_REQUIRED' then raise; end if; end;
 begin
  perform public.platform_master_close_external_sandbox_test('sandbox','evt_external_manual_test','short',true);
  raise exception 'Short reason was accepted';
 exception when others then if sqlerrm <> 'PLATFORM_MASTER_REASON_REQUIRED' then raise; end if; end;
 foreach v_ref in array array['evt_external_ledger_test','evt_external_checkout_test'] loop
  begin
   perform public.platform_master_close_external_sandbox_test('sandbox',v_ref,'External manual test reviewed',true);
   raise exception 'Billing-associated event was closed';
  exception when others then if sqlerrm <> 'PLATFORM_MASTER_EXTERNAL_TEST_HAS_BILLING_LINK' then raise; end if; end;
 end loop;
 foreach v_ref in array array['evt_external_snapshot_test','evt_external_reconcile_test','evt_external_processing_test'] loop
  begin
   perform public.platform_master_close_external_sandbox_test('sandbox',v_ref,'External manual test reviewed',true);
   raise exception 'Referenced/processing event was closed';
  exception when others then if sqlerrm <> 'PLATFORM_MASTER_EXTERNAL_TEST_NOT_ELIGIBLE' then raise; end if; end;
 end loop;
 if not public.platform_master_close_external_sandbox_test('sandbox','evt_external_manual_test','External manual test reviewed',true)
   or not public.platform_master_close_external_sandbox_test('sandbox','evt_external_manual_test','Retry after ambiguous response',true) then
  raise exception 'AAL2 review or idempotent retry failed';
 end if;
end $$;
reset role;
do $$ declare current_snapshot jsonb; begin
 if (select count(*) from public.platform_operator_audit where target_ref='evt_external_manual_test'
      and action='close_external_sandbox_test' and target_environment='sandbox') <> 1
   or (select status from public.billing_events where provider_event_id='evt_external_manual_test') <> 'ignored'
   or (select error_message from public.billing_events where provider_event_id='evt_external_manual_test') <> 'EXTERNAL_MANUAL_SANDBOX_TEST'
   or (select attempt_count from public.billing_events where provider_event_id='evt_external_manual_test') <> 6
   or (select payload from public.billing_events where provider_event_id='evt_external_manual_test') <> '{"paymentId":"pay_ExternalManualFixture"}'::jsonb then
  raise exception 'Review did not preserve original event and single audit';
 end if;
 if (select count(*) from public.billing_events where provider_event_id like 'evt_external_%'
      and provider_event_id <> 'evt_external_manual_test' and status in ('dead_letter','processing')) <> 6 then
  raise exception 'Another event changed during review';
 end if;
 current_snapshot := jsonb_build_object(
  'contracts',(select jsonb_agg(to_jsonb(s) order by id) from public.account_subscriptions s),
  'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.billing_payments p),
  'intents',(select jsonb_agg(to_jsonb(c) order by id) from public.checkout_intents c));
 if current_snapshot is distinct from (select snapshot from external_review_financial_baseline) then
  raise exception 'External review changed financial records';
 end if;
end $$;
select 'passed' as stage_07_external_test_review;
rollback;

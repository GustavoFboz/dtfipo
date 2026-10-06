-- Isolated clean restore only; all fixtures/claims/proofs are rolled back.
-- This checks SQL authorization/concurrency fences, not real Asaas acceptance.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('80800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-owner@test.invalid','',now(),now()),
 ('80800000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancel-master@test.invalid','',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after) values
 ('80800000-0000-4000-8000-000000000003','80800000-0000-4000-8000-000000000002',now(),now(),'aal2',now()+interval '1 hour');
insert into public.platform_operators(user_id,enabled,enrolled_by)
 values('80800000-0000-4000-8000-000000000002',true,'isolated cancel rehearsal');
insert into public.clinics(id,name,slug,owner_id) values
 ('80800000-0000-4000-8000-000000000010','Cancel executor rehearsal','cancel-executor-rehearsal','80800000-0000-4000-8000-000000000001');
insert into public.account_subscriptions(id,scope_type,clinic_id,plan_code,status,billing_day,current_period_start,
 current_period_end,billing_provider,provider_environment,billing_cycle,external_customer_id,external_subscription_id) values
 ('80800000-0000-4000-8000-000000000011','company','80800000-0000-4000-8000-000000000010','company_initial','active',5,
 current_date,current_date+interval '1 month','asaas','sandbox','MONTHLY','cus_CancelRehearsal','sub_CancelRehearsal');
insert into public.billing_payments(subscription_id,clinic_id,amount_cents,currency,status,provider,provider_environment,
 provider_payment_id,paid_at,period_start,period_end) values
 ('80800000-0000-4000-8000-000000000011','80800000-0000-4000-8000-000000000010',24900,'BRL','paid','asaas','sandbox',
 'pay_CancelRehearsal',now(),current_date,current_date+interval '1 month');
create temporary table cancel_financial_baseline as select
 (select jsonb_agg(to_jsonb(b) order by id) from public.billing_payments b) as ledger,
 (select jsonb_agg(to_jsonb(c) order by id) from public.clinics c) as clinics,
 (select current_period_end from public.account_subscriptions where id='80800000-0000-4000-8000-000000000011') as paid_end;

do $$ begin
 if has_function_privilege('anon','public.platform_master_claim_cancel_request(uuid,text,text,boolean)','EXECUTE')
  or has_function_privilege('service_role','public.platform_master_claim_cancel_request(uuid,text,text,boolean)','EXECUTE')
  or has_function_privilege('authenticated','public.billing_finish_cancel_request(uuid,uuid,jsonb,text)','EXECUTE')
  or has_function_privilege('authenticated','public.billing_cancel_master_identity()','EXECUTE')
  or has_table_privilege('authenticated','public.billing_cancel_executions','SELECT')
  or has_table_privilege('service_role','public.billing_cancel_executions','UPDATE') then
   raise exception 'Cancellation private boundary reopened';
 end if;
end $$;

-- Customer submits a frozen historical price, irrespective of R$1 catalog.
select set_config('request.jwt.claims',jsonb_build_object('sub','80800000-0000-4000-8000-000000000001',
 'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare q jsonb; r jsonb; begin
 -- Quote is intentionally not directly granted: use the authorized context.
 q := public.billing_company_change_context('80800000-0000-4000-8000-000000000010')->'cancellation_quote';
 r := public.billing_submit_change_request('80800000-0000-4000-8000-000000000010',
 '80800000-0000-4000-8000-000000000011','cancel',null,q->>'quote_token');
 perform set_config('test.cancel_request',r->>'id',true);
 begin
  perform public.platform_master_claim_cancel_request((r->>'id')::uuid,'sandbox','Customer cannot execute this cancellation',false);
  raise exception 'Customer granted Master execution';
 exception when others then if sqlerrm <> 'BILLING_CANCEL_FORBIDDEN' then raise; end if; end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub','80800000-0000-4000-8000-000000000002',
 'session_id','80800000-0000-4000-8000-000000000003','role','authenticated','aal','aal1',
 'exp',floor(extract(epoch from now()))::bigint+3600)::text,true);
set local role authenticated;
do $$ begin
 begin
  perform public.platform_master_claim_cancel_request(current_setting('test.cancel_request')::uuid,'sandbox','Master without MFA cannot execute',false);
  raise exception 'AAL1 executed cancellation';
 exception when others then if sqlerrm <> 'BILLING_CANCEL_MFA_REQUIRED' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','80800000-0000-4000-8000-000000000002',
 'session_id','80800000-0000-4000-8000-000000000099','role','authenticated','aal','aal2',
 'exp',floor(extract(epoch from now()))::bigint+3600)::text,true);
set local role authenticated;
do $$ begin
 begin
  perform public.platform_master_claim_cancel_request(current_setting('test.cancel_request')::uuid,'sandbox','Revoked session cannot authorize financial write',false);
  raise exception 'Missing Auth session authorized execution';
 exception when others then if sqlerrm <> 'BILLING_CANCEL_SESSION_REQUIRED' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','80800000-0000-4000-8000-000000000002',
 'session_id','80800000-0000-4000-8000-000000000003','role','authenticated','aal','aal2',
 'exp',floor(extract(epoch from now()))::bigint+3600)::text,true);
set local role authenticated;
do $$ declare r jsonb; begin
 begin
  perform public.platform_master_claim_cancel_request(current_setting('test.cancel_request')::uuid,'production','Wrong environment must stay unchanged',false);
  raise exception 'Cross-environment execution accepted';
 exception when others then if sqlerrm <> 'BILLING_CANCEL_NOT_ELIGIBLE' then raise; end if; end;
 r := public.platform_master_claim_cancel_request(current_setting('test.cancel_request')::uuid,'sandbox','Master reviewed the customer cancellation',false);
 perform set_config('test.cancel_lease',r->>'lease_token',true);
 begin
  perform public.platform_master_claim_cancel_request(current_setting('test.cancel_request')::uuid,'sandbox','Concurrent operator must not get another lease',false);
  raise exception 'Concurrent lease accepted';
 exception when others then if sqlerrm <> 'BILLING_CANCEL_BUSY' then raise; end if; end;
 if not public.platform_master_begin_cancel_write(current_setting('test.cancel_request')::uuid,(r->>'lease_token')::uuid) then
  raise exception 'Authorized first write not allowed'; end if;
 begin
  perform public.platform_master_begin_cancel_write(current_setting('test.cancel_request')::uuid,(r->>'lease_token')::uuid);
  raise exception 'Repeated provider write authorized';
 exception when others then if sqlerrm <> 'BILLING_CANCEL_WRITE_NOT_AUTHORIZED' then raise; end if; end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"80800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
 begin
  perform public.billing_withdraw_change_request('80800000-0000-4000-8000-000000000010',current_setting('test.cancel_request')::uuid);
  raise exception 'Customer withdrew processing request';
 exception when others then if sqlerrm <> 'BILLING_CHANGE_REVIEW_REQUIRED' then raise; end if; end;
end $$;
reset role;

-- A lost response becomes review_required; a later lease is read-only.
set local role service_role;
select public.billing_finish_cancel_request(current_setting('test.cancel_request')::uuid,current_setting('test.cancel_lease')::uuid,
 null,'PROVIDER_RESULT_UNCONFIRMED');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','80800000-0000-4000-8000-000000000002',
 'session_id','80800000-0000-4000-8000-000000000003','role','authenticated','aal','aal2',
 'exp',floor(extract(epoch from now()))::bigint+3600)::text,true);
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.platform_master_claim_cancel_request(current_setting('test.cancel_request')::uuid,'sandbox','Reconcile after interrupted connection',false);
 if r->>'reconcile_only' is distinct from 'true' then raise exception 'Review allowed another write'; end if;
 perform set_config('test.cancel_review_lease',r->>'lease_token',true);
 begin
  perform public.platform_master_begin_cancel_write(current_setting('test.cancel_request')::uuid,(r->>'lease_token')::uuid);
  raise exception 'Reconciliation authorized mutation';
 exception when others then if sqlerrm <> 'BILLING_CANCEL_WRITE_NOT_AUTHORIZED' then raise; end if; end;
end $$;
reset role;
do $$ begin
 begin
  perform public.billing_finish_cancel_request(current_setting('test.cancel_request')::uuid,current_setting('test.cancel_lease')::uuid,
   null,'PROVIDER_REVIEW_REQUIRED');
  raise exception 'Stale lease completed newer execution';
 exception when others then if sqlerrm <> 'BILLING_CANCEL_LEASE_LOST' then raise; end if; end;
end $$;
set local role service_role;
select public.billing_finish_cancel_request(current_setting('test.cancel_request')::uuid,current_setting('test.cancel_review_lease')::uuid,
 jsonb_build_object('id','sub_CancelRehearsal','customer','cus_CancelRehearsal',
 'externalReference','dentalflow:subscription:80800000-0000-4000-8000-000000000011',
 'value',249,'cycle','MONTHLY','status','INACTIVE','deleted',false),null);
reset role;
do $$ begin
 if (select status from public.billing_change_requests where id=current_setting('test.cancel_request')::uuid) <> 'completed'
  or (select count(*) from public.billing_cancel_executions where request_id=current_setting('test.cancel_request')::uuid
    and provider_write_started_at is not null) <> 1
  or (select count(*) from public.billing_cancel_executions where request_id=current_setting('test.cancel_request')::uuid) <> 2
  or (select current_period_end from public.account_subscriptions where id='80800000-0000-4000-8000-000000000011')
     is distinct from (select paid_end from cancel_financial_baseline)
  or public.subscription_access_mode('canceled',(select paid_end from cancel_financial_baseline),null) <> 'full'
  or (select jsonb_agg(to_jsonb(b) order by id) from public.billing_payments b) is distinct from (select ledger from cancel_financial_baseline)
  or (select jsonb_agg(to_jsonb(c) order by id) from public.clinics c) is distinct from (select clinics from cancel_financial_baseline) then
   raise exception 'Cancellation changed ledger, data, paid end or execution count';
 end if;
end $$;
-- Completion retry has no second execution/audit.
set local role authenticated;
do $$ declare r jsonb; begin
 r := public.platform_master_claim_cancel_request(current_setting('test.cancel_request')::uuid,'sandbox','Retry after missing completion response',false);
 if r->>'done' is distinct from 'true' then raise exception 'Completed retry not idempotent'; end if;
end $$;
reset role;
select 'passed' as stage_08_cancel_executor;
rollback;

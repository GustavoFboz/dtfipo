-- DISPOSABLE clean Supabase restore only; no Asaas calls, fixtures roll back.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
select ('78000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,'',now(),now()
from (values (1,'change-owner@test.invalid'),(2,'change-member@test.invalid'),(3,'change-outsider@test.invalid')) u(n,email);
insert into public.clinics(id,name,slug,owner_id) values
  ('78000000-0000-4000-8000-000000000010','Change requests fixture','stage08-changes',
   '78000000-0000-4000-8000-000000000001');
insert into public.clinic_members(clinic_id,user_id,role,status) values
  ('78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000001','CEO','active'),
  ('78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000002','DR','active');
insert into public.account_subscriptions(id,scope_type,clinic_id,plan_code,status,billing_day,billing_provider,
  provider_environment,external_customer_id,external_subscription_id,current_period_start,current_period_end)
values ('78000000-0000-4000-8000-000000000011','company','78000000-0000-4000-8000-000000000010',
  'company_advanced','active',28,'asaas','sandbox','cus_ChangeFixture','sub_ChangeFixture',now()-interval '1 day',now()+interval '29 days');
insert into public.billing_payments(subscription_id,clinic_id,amount_cents,currency,status,provider,provider_environment,
  provider_payment_id,paid_at,period_start,period_end)
select s.id,s.clinic_id,74900,'BRL','paid','asaas','sandbox','pay_ChangeFixture',now(),s.current_period_start,s.current_period_end
from public.account_subscriptions s where s.id='78000000-0000-4000-8000-000000000011';
insert into public.company_sessions(clinic_id,session_type,status) values
  ('78000000-0000-4000-8000-000000000010','laboratory','active'),
  ('78000000-0000-4000-8000-000000000010','clinic','active');
insert into public.billing_plans(code,account_scope,name,monthly_price_cents,max_sessions,max_members,storage_bytes)
values ('stage08_small','company','Small fixture',200,1,1,536870912000);
create temp table stage08_domain_before as
select to_jsonb(s) as subscription, (select jsonb_agg(to_jsonb(b)) from public.billing_payments b where b.subscription_id=s.id) as ledger,
  (select storage_limit_bytes from public.clinics where id=s.clinic_id) as quota
from public.account_subscriptions s where s.id='78000000-0000-4000-8000-000000000011';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare v_error text; begin
  begin perform public.billing_company_change_context('78000000-0000-4000-8000-000000000010');
  exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'BILLING_CHANGE_FORBIDDEN' then raise exception 'Member read finance'; end if;
  v_error:=null;
  begin perform public.billing_submit_change_request('78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000011','cancel',null,'forged'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'BILLING_CHANGE_FORBIDDEN' then raise exception 'Member submitted cancellation'; end if;
  v_error:=null;
  begin perform public.platform_master_billing_change_requests(''); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'PLATFORM_MASTER_FORBIDDEN' then raise exception 'Member read Master queue'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000003',true);
do $$ declare v_error text; begin
  begin perform public.billing_company_change_context('78000000-0000-4000-8000-000000000010'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'BILLING_CHANGE_FORBIDDEN' then raise exception 'Outsider read company requests'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','78000000-0000-4000-8000-000000000001',true);
do $$ declare c jsonb; q jsonb; r jsonb; v_error text; begin
  c:=public.billing_company_change_context('78000000-0000-4000-8000-000000000010');
  q:=c->'cancellation_quote';
  if (q->>'current_amount_cents')::integer <> 74900 or q ? 'external_customer_id' then raise exception 'Invalid contract quote'; end if;
  select v into q from jsonb_array_elements(c->'plan_quotes') v where v->>'target_plan_code'='stage08_small';
  if q->>'block_reason' <> 'member_limit' then raise exception 'Team limit missed'; end if;
  v_error:=null;
  begin perform public.billing_submit_change_request('78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000011','change_plan','stage08_small',q->>'quote_token'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'BILLING_CHANGE_LIMIT_REVIEW' then raise exception 'Incompatible downgrade accepted'; end if;
  q:=c->'cancellation_quote';
  v_error:=null;
  begin perform public.billing_submit_change_request('78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000011','cancel',null,'forged'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'BILLING_CHANGE_QUOTE_STALE' then raise exception 'Forged quote accepted'; end if;
  r:=public.billing_submit_change_request('78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000011','cancel',null,q->>'quote_token');
  if r->>'status' <> 'awaiting_provider' or r->>'paid_period_end' is distinct from q->>'paid_period_end'
    or (r->>'effective_not_before')::timestamptz < (q->>'paid_period_end')::timestamptz then raise exception 'Paid period not preserved'; end if;
  if public.billing_submit_change_request('78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000011','cancel',null,q->>'quote_token')->>'id' <> r->>'id' then raise exception 'Retry duplicated request'; end if;
  v_error:=null;
  begin perform public.billing_submit_change_request('78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000011','change_plan','company_growth','forged'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'BILLING_CHANGE_PENDING' then raise exception 'Conflicting pending request accepted'; end if;
  perform public.billing_withdraw_change_request('78000000-0000-4000-8000-000000000010',(r->>'id')::uuid);
  perform public.billing_withdraw_change_request('78000000-0000-4000-8000-000000000010',(r->>'id')::uuid);
end $$;
reset role;
do $$ declare q jsonb; begin
  if (select count(*) from public.billing_change_requests where clinic_id='78000000-0000-4000-8000-000000000010') <> 1
    or (select count(*) from public.billing_change_request_events e join public.billing_change_requests r on r.id=e.request_id
      where r.clinic_id='78000000-0000-4000-8000-000000000010') <> 2 then raise exception 'Audit or idempotency incorrect'; end if;
  if not exists(select 1 from stage08_domain_before b join public.account_subscriptions s
    on s.id='78000000-0000-4000-8000-000000000011' where b.subscription=to_jsonb(s)
    and b.ledger=(select jsonb_agg(to_jsonb(p)) from public.billing_payments p where p.subscription_id=s.id)
    and b.quota=(select storage_limit_bytes from public.clinics where id=s.clinic_id)) then
    raise exception 'Request modified financial entitlement, ledger or quota';
  end if;
  update public.billing_plans set max_members=8 where code='stage08_small';
  q:=public.billing_change_request_quote('78000000-0000-4000-8000-000000000011','change_plan','stage08_small');
  if q->>'block_reason' <> 'session_limit' then raise exception 'Session limit missed'; end if;
  update public.billing_plans set max_sessions=3,storage_bytes=1073741824 where code='stage08_small';
  insert into public.storage_files(clinic_id,bucket,object_path,source_type,original_name,size_bytes,status,uploaded_by)
  values ('78000000-0000-4000-8000-000000000010','avatars','stage08/reserved','user_avatar','fixture.bin',2147483648,'reserved',
    '78000000-0000-4000-8000-000000000001');
  q:=public.billing_change_request_quote('78000000-0000-4000-8000-000000000011','change_plan','stage08_small');
  if q->>'block_reason' <> 'storage_limit' or (q->>'storage_used_bytes')::bigint <> 2147483648 then raise exception 'Reserved bytes not counted'; end if;
  delete from public.storage_files where object_path='stage08/reserved';
  update public.account_subscriptions set status='suspended' where id='78000000-0000-4000-8000-000000000011';
  q:=public.billing_change_request_quote('78000000-0000-4000-8000-000000000011','change_plan','company_growth');
  if q->>'block_reason' <> 'paid_period_required' then raise exception 'Suspended plan change allowed'; end if;
  update public.account_subscriptions set status='active' where id='78000000-0000-4000-8000-000000000011';
end $$;

-- Capture a selection and then change the catalog: the old agreement must fail.
create temp table stage08_old_quote as select public.billing_change_request_quote(
  '78000000-0000-4000-8000-000000000011','change_plan','company_growth') as quote;
grant select on stage08_old_quote to authenticated;
update public.billing_plans set monthly_price_cents=45000 where code='company_growth';
set local role authenticated;
do $$ declare q jsonb; v_error text; r jsonb; begin
  select quote into q from stage08_old_quote;
  begin perform public.billing_submit_change_request('78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000011','change_plan','company_growth',q->>'quote_token'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'BILLING_CHANGE_QUOTE_STALE' then raise exception 'Changed price silently accepted'; end if;
  select v into q from jsonb_array_elements(public.billing_company_change_context('78000000-0000-4000-8000-000000000010')->'plan_quotes') v
  where v->>'target_plan_code'='company_growth';
  r:=public.billing_submit_change_request('78000000-0000-4000-8000-000000000010',
    '78000000-0000-4000-8000-000000000011','change_plan','company_growth',q->>'quote_token');
  if (r->>'target_amount_cents')::integer <> 45000 then raise exception 'Target price not snapshotted'; end if;
end $$;
reset role;
insert into public.platform_operators(user_id,enrolled_by) values ('78000000-0000-4000-8000-000000000001','disposable Stage08 test');
set local role authenticated;
do $$ begin
  if jsonb_array_length(public.platform_master_billing_change_requests('Change requests fixture')) <> 1 then raise exception 'Master cannot see pending request'; end if;
end $$;
reset role;
update public.clinics set billing_exempt=true where id='78000000-0000-4000-8000-000000000010';
set local role authenticated;
do $$ begin
  if public.billing_company_change_context('78000000-0000-4000-8000-000000000010')->'cancellation_quote' <> 'null'::jsonb then
    raise exception 'Exempt company offered paid changes';
  end if;
end $$;
select 'passed' as stage_08_change_requests;
rollback;

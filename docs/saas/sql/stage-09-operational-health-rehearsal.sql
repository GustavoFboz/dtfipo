-- DISPOSABLE clean Supabase restore only. Fixtures roll back; no Asaas calls.
begin;
create temp table stage09_domain_before as select
  (select jsonb_agg(to_jsonb(s) order by id) from public.account_subscriptions s) as subscriptions,
  (select jsonb_agg(to_jsonb(p) order by id) from public.billing_payments p) as payments,
  (select jsonb_agg(to_jsonb(p) order by code) from public.billing_plans p) as plans;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
  ('79000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','health-operator@test.invalid','',now(),now()),
  ('79000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','health-outsider@test.invalid','',now(),now());
insert into public.platform_operators(user_id,enrolled_by) values ('79000000-0000-4000-8000-000000000001','stage09-fixture');
insert into public.billing_events(provider,provider_environment,provider_event_id,event_type,status,payload,next_attempt_at,received_at)
values ('asaas','sandbox','evt_HealthPrivate','PAYMENT_RECEIVED','dead_letter','{"paymentId":"pay_sensitive"}',now(),now()),
  ('asaas','sandbox','evt_HealthLate','PAYMENT_RECEIVED','failed','{}',now()-interval '20 minutes',now()-interval '30 minutes');
insert into public.billing_provider_operations(provider,provider_environment,operation_type,idempotency_key,external_reference,status)
values ('asaas','production','subscription_create','stage09:uncertain','stage09:sensitive','uncertain');
set local role service_role;
do $$ declare c jsonb:='{"processed":1,"ignored":0,"failed":0,"workerReview":0,"suspended":0,"recoveryQueued":0,"graceReview":0,"reconciliationScanned":0,"reconciliationQueued":0,"reconciliationReview":0}'; x text; begin
  if not public.billing_record_worker_health('sandbox','79000000-0000-4000-8000-000000000010','running','{}')
    or not public.billing_record_worker_health('sandbox','79000000-0000-4000-8000-000000000010','ok',c) then raise exception 'Run not recorded'; end if;
  if not public.billing_record_worker_health('sandbox','79000000-0000-4000-8000-000000000010','ok',c) then raise exception 'Finish not idempotent'; end if;
  perform public.billing_record_worker_health('sandbox','79000000-0000-4000-8000-000000000011','running','{}');
  if public.billing_record_worker_health('sandbox','79000000-0000-4000-8000-000000000010','ok',c) then raise exception 'Stale completion accepted'; end if;
  perform public.billing_record_worker_health('sandbox','79000000-0000-4000-8000-000000000011','review',jsonb_set(c,'{failed}','1'));
  if (select last_healthy_at is null or status<>'review' from public.billing_worker_health where provider_environment='sandbox') then raise exception 'Review overwrote success or was lost'; end if;
  begin perform public.billing_record_worker_health('sandbox','79000000-0000-4000-8000-000000000011','ok',jsonb_set(c,'{failed}','1'));
  exception when others then x:=sqlerrm; end;
  if x is distinct from 'BILLING_INVALID_HEALTH_RECORD' then raise exception 'False healthy result accepted'; end if;
  x:=null;
  begin perform public.billing_record_worker_health('sandbox','79000000-0000-4000-8000-000000000011','review',c||'{"secret":"sensitive"}'::jsonb);
  exception when others then x:=sqlerrm; end;
  if x is distinct from 'BILLING_INVALID_HEALTH_RECORD' then raise exception 'Private telemetry payload accepted'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$ declare x text; begin
  begin perform public.platform_master_operational_health(); exception when others then x:=sqlerrm; end;
  if x is distinct from 'PLATFORM_MASTER_FORBIDDEN' then raise exception 'Outsider read telemetry'; end if;
  x:=null;
  begin perform public.billing_record_worker_health('sandbox',gen_random_uuid(),'running','{}'); exception when insufficient_privilege then x:='denied'; end;
  if x is distinct from 'denied' then raise exception 'Browser forged heartbeat'; end if;
end $$;
select set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$ declare h jsonb; s jsonb; p jsonb; begin
  h:=public.platform_master_operational_health();
  select v into s from jsonb_array_elements(h->'environments') v where v->>'environment'='sandbox';
  select v into p from jsonb_array_elements(h->'environments') v where v->>'environment'='production';
  if s->'queue'->>'dead_letter' <> '1' or s->'queue'->>'late_due' <> '1'
    or p->'checkout'->>'uncertain' <> '1' or s->'checkout'->>'uncertain' <> '0'
    or s->'worker'->>'status' <> 'review' or p->'worker' <> 'null'::jsonb then raise exception 'Environment isolation or counters invalid'; end if;
  if h::text like '%sensitive%' or h::text like '%run_id%' or h::text like '%paymentId%' then raise exception 'Private resource exposed'; end if;
end $$;
reset role;
update public.platform_operators set enabled=false where user_id='79000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare x text; begin
  begin perform public.platform_master_operational_health(); exception when others then x:=sqlerrm; end;
  if x is distinct from 'PLATFORM_MASTER_FORBIDDEN' then raise exception 'Revoked operator read telemetry'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from stage09_domain_before b where b.subscriptions is distinct from (select jsonb_agg(to_jsonb(s) order by id) from public.account_subscriptions s)
    or b.payments is distinct from (select jsonb_agg(to_jsonb(p) order by id) from public.billing_payments p)
    or b.plans is distinct from (select jsonb_agg(to_jsonb(p) order by code) from public.billing_plans p)) then raise exception 'Monitoring modified financial domain'; end if;
end $$;
select 'passed' as stage_09_operational_rehearsal;
rollback;

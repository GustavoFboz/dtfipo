-- Clean restore only. Reversible operator, replay, and authorization rehearsal.
begin;
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('71000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'master-test@test.invalid', '', now(), now());
insert into public.billing_events
  (provider, provider_environment, provider_event_id, event_type, payload, status, attempt_count)
values ('asaas','sandbox','evt_master_test','PAYMENT_CONFIRMED','{}','dead_letter',6);

select set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
  begin
    perform public.platform_master_dashboard('');
    raise exception 'Unenrolled user gained platform-wide read';
  exception when others then
    if sqlerrm <> 'PLATFORM_MASTER_FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.platform_master_replay_asaas_event('sandbox','evt_master_test','Reviewed provider evidence');
    raise exception 'Unenrolled user queued replay';
  exception when others then
    if sqlerrm <> 'PLATFORM_MASTER_FORBIDDEN' then raise; end if;
  end;
end $$;
reset role;

insert into public.platform_operators(user_id, enrolled_by)
values ('71000000-0000-4000-8000-000000000001','disposable rehearsal');
select set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
do $$ begin
  if public.platform_master_dashboard('')->'queue' is null then
    raise exception 'Enrolled operator could not read sanitized dashboard';
  end if;
  begin
    perform public.platform_master_replay_asaas_event('sandbox','evt_master_test','Reviewed provider evidence');
    raise exception 'AAL1 session queued replay';
  exception when others then
    if sqlerrm <> 'PLATFORM_MASTER_REAUTH_REQUIRED' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$ begin
  if not public.platform_master_replay_asaas_event(
    'sandbox','evt_master_test','Reviewed provider evidence') then
    raise exception 'AAL2 operator could not queue dead letter';
  end if;
end $$;
reset role;
do $$ begin
  if (select status from public.billing_events where provider_event_id='evt_master_test') <> 'received'
    or (select count(*) from public.platform_operator_audit where target_ref='evt_master_test') <> 1
    or (select count(*) from public.billing_event_replays where provider_event_id='evt_master_test') <> 1 then
    raise exception 'Replay or audit was not persisted atomically';
  end if;
end $$;
select 'passed' as stage_07_master_rehearsal;
rollback;

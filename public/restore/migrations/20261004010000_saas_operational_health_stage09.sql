-- Stage 09: bounded operational telemetry. No provider/ledger/entitlement writes.
-- One latest run per environment; historical incidents remain in the inbox and CI logs.
create table if not exists public.billing_worker_health (
  provider_environment text primary key check (provider_environment in ('sandbox','production')),
  run_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  last_healthy_at timestamptz,
  status text not null check (status in ('running','ok','review','failed')),
  counters jsonb not null default '{}'::jsonb check (jsonb_typeof(counters) = 'object'),
  check ((status = 'running' and finished_at is null) or (status <> 'running' and finished_at is not null and finished_at >= started_at))
);
alter table public.billing_worker_health enable row level security;
revoke all on public.billing_worker_health from public, anon, authenticated, service_role;
grant select on public.billing_worker_health to service_role;

create or replace function public.billing_record_worker_health(
  p_environment text, p_run_id uuid, p_status text, p_counters jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare h public.billing_worker_health%rowtype; k text; v jsonb;
begin
  if p_environment is null or p_environment not in ('sandbox','production') or p_run_id is null
    or p_status is null or p_status not in ('running','ok','review','failed')
    or p_counters is null or jsonb_typeof(p_counters) <> 'object' or pg_column_size(p_counters) > 2048 then
    raise exception 'BILLING_INVALID_HEALTH_RECORD';
  end if;
  for k,v in select * from jsonb_each(p_counters) loop
    if k not in ('processed','ignored','failed','workerReview','suspended','recoveryQueued','graceReview',
      'reconciliationScanned','reconciliationQueued','reconciliationReview')
      or jsonb_typeof(v) <> 'number' or v::text !~ '^[0-9]{1,7}$' then
      raise exception 'BILLING_INVALID_HEALTH_RECORD';
    end if;
  end loop;
  if p_status = 'running' then
    if p_counters <> '{}'::jsonb then raise exception 'BILLING_INVALID_HEALTH_RECORD'; end if;
    insert into public.billing_worker_health(provider_environment,run_id,status)
    values (p_environment,p_run_id,'running')
    on conflict (provider_environment) do update set run_id=excluded.run_id, started_at=clock_timestamp(),
      finished_at=null,status='running',counters='{}'::jsonb
    where billing_worker_health.run_id <> excluded.run_id;
    return true;
  end if;
  if (select count(*) from jsonb_object_keys(p_counters)) <> 10
    or (p_status='ok' and (p_counters->>'failed')::integer + (p_counters->>'workerReview')::integer
      + (p_counters->>'graceReview')::integer + (p_counters->>'reconciliationReview')::integer <> 0) then
    raise exception 'BILLING_INVALID_HEALTH_RECORD';
  end if;
  select * into h from public.billing_worker_health where provider_environment=p_environment for update;
  if not found or h.run_id <> p_run_id then return false; end if;
  if h.status <> 'running' then return h.status=p_status and h.counters=p_counters; end if;
  update public.billing_worker_health set status=p_status,counters=p_counters,finished_at=clock_timestamp(),
    last_healthy_at=case when p_status='ok' then clock_timestamp() else last_healthy_at end
  where provider_environment=p_environment;
  return true;
end $$;

create or replace function public.platform_master_operational_health()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.role() <> 'authenticated' or not exists (
    select 1 from public.platform_operators where user_id=auth.uid() and enabled
  ) then raise exception 'PLATFORM_MASTER_FORBIDDEN'; end if;
  select jsonb_build_object('generated_at',now(), 'environments', (
    select jsonb_agg(jsonb_build_object('environment',env,
      'worker', (select jsonb_build_object('started_at',h.started_at,'finished_at',h.finished_at,
        'last_healthy_at',h.last_healthy_at,'status',h.status,'counters',h.counters)
        from public.billing_worker_health h where h.provider_environment=env),
      'queue', (select jsonb_build_object(
        'waiting',count(*) filter(where status in ('received','failed')),
        'processing',count(*) filter(where status='processing'),
        'failed',count(*) filter(where status='failed'),
        'dead_letter',count(*) filter(where status='dead_letter'),
        'expired_leases',count(*) filter(where status='processing' and lease_until <= now()),
        'late_due',count(*) filter(where status in ('received','failed') and next_attempt_at <= now()-interval '10 minutes'),
        'oldest_due_at',min(next_attempt_at) filter(where status in ('received','failed') and next_attempt_at <= now()))
        from public.billing_events where provider='asaas' and provider_environment=env),
      'checkout', (select jsonb_build_object(
        'failed_24h',count(*) filter(where status='failed' and updated_at >= now()-interval '24 hours'),
        'uncertain',count(*) filter(where status='uncertain'),
        'expired_leases',count(*) filter(where status='in_progress' and lease_expires_at <= now()))
        from public.billing_provider_operations where provider='asaas' and provider_environment=env),
      'subscriptions', (select jsonb_build_object(
        'linked',count(*),
        'reconciliation_late',count(*) filter(where created_at <= now()-interval '5 minutes'
          and (created_at >= now()-interval '120 days' or current_period_end >= now()-interval '120 days')
          and (reconciliation_checked_at is null or reconciliation_checked_at <= now()-interval '2 hours')),
        'expired_grace',count(*) filter(where status='past_due' and grace_until <= now()),
        'paid_period_without_ledger',count(*) filter(where status='active' and current_period_end > now()
          and not exists(select 1 from public.billing_payments b where b.subscription_id=s.id
            and b.provider='asaas' and b.provider_environment=env and b.status='paid' and b.period_end >= s.current_period_end)))
        from public.account_subscriptions s where scope_type='company' and clinic_id is not null
          and billing_provider='asaas' and provider_environment=env
          and external_subscription_id ~ '^sub_[A-Za-z0-9]+$' and external_customer_id ~ '^cus_[A-Za-z0-9]+$'
          and not public.is_internal_full_access_company(clinic_id))
    ) order by env) from (values ('sandbox'),('production')) e(env)),
    'storage', (select jsonb_build_object('reserved',count(*) filter(where status='reserved'),
      'reserved_bytes',coalesce(sum(size_bytes) filter(where status='reserved'),0),
      'reserved_over_24h',count(*) filter(where status='reserved' and created_at <= now()-interval '24 hours'))
      from public.storage_files)) into result;
  return result;
end $$;
revoke all on function public.billing_record_worker_health(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.billing_record_worker_health(text,uuid,text,jsonb) to service_role;
revoke all on function public.platform_master_operational_health() from public,anon,authenticated,service_role;
grant execute on function public.platform_master_operational_health() to authenticated;
notify pgrst, 'reload schema';

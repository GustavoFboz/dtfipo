-- Backend-owned dispatch cadence. Migration creates no active jobs or secrets.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- Worker headers must never be readable by application accounts.
revoke all on net.http_request_queue, net._http_response from public, anon, authenticated, service_role;

create table if not exists public.billing_database_scheduler (
  provider_environment text primary key check (provider_environment in ('sandbox','production')),
  enabled boolean not null default false,
  cron_job_id bigint not null,
  worker_secret_id uuid not null,
  configured_at timestamptz not null default clock_timestamp(),
  last_dispatched_at timestamptz,
  last_request_id bigint
);
alter table public.billing_database_scheduler enable row level security;
revoke all on public.billing_database_scheduler from public, anon, authenticated, service_role;

create or replace function public.billing_enqueue_database_worker(p_environment text)
returns bigint language plpgsql security definer set search_path = pg_catalog, public as $$
declare c public.billing_database_scheduler%rowtype; token text; request_id bigint;
begin
  select * into c from public.billing_database_scheduler
  where provider_environment=p_environment and enabled;
  if not found then return null; end if;
  select decrypted_secret into token from vault.decrypted_secrets where id=c.worker_secret_id;
  if token is null or length(token) < 32 or length(token) > 255 or token ~ '[[:space:]]' or token like '$aact_%' then
    raise exception 'BILLING_SCHEDULER_SECRET_INVALID';
  end if;
  select net.http_post(
    url := 'https://dtfipo.lovable.app/api/billing/asaas-worker',
    headers := jsonb_build_object('Authorization','Bearer '||token,
      'X-Billing-Environment',p_environment,'Content-Type','application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 35000
  ) into request_id;
  update public.billing_database_scheduler set last_dispatched_at=clock_timestamp(),last_request_id=request_id
  where provider_environment=p_environment;
  return request_id;
end $$;
revoke all on function public.billing_enqueue_database_worker(text) from public, anon, authenticated, service_role;

create or replace function public.billing_configure_database_scheduler(p_environment text,p_worker_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare secret_id uuid; job_id bigint; secret_name text;
begin
  if p_environment is null or p_environment not in ('sandbox','production')
    or p_worker_token is null or length(p_worker_token) < 32 or length(p_worker_token) > 255
    or p_worker_token ~ '[[:space:]]' or p_worker_token like '$aact_%' then
    raise exception 'BILLING_SCHEDULER_CONFIGURATION_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dentalflow_billing_database_scheduler',0));
  -- Only one runtime environment can be primary at a time.
  perform cron.alter_job(c.cron_job_id,active:=false)
    from public.billing_database_scheduler c join cron.job j on j.jobid=c.cron_job_id
    where c.provider_environment<>p_environment and j.jobname='dentalflow-billing-'||c.provider_environment;
  update public.billing_database_scheduler set enabled=false where provider_environment<>p_environment;
  secret_name := 'dentalflow_billing_worker_'||p_environment;
  select id into secret_id from vault.secrets where name=secret_name;
  if secret_id is null then
    select vault.create_secret(p_worker_token,secret_name,'DentalFlow private scheduler worker credential') into secret_id;
  else
    perform vault.update_secret(secret_id,p_worker_token,secret_name,'DentalFlow private scheduler worker credential');
  end if;
  select cron.schedule('dentalflow-billing-'||p_environment,'1-59/5 * * * *',
    format('select public.billing_enqueue_database_worker(%L);',p_environment)) into job_id;
  perform cron.alter_job(job_id,active:=true);
  insert into public.billing_database_scheduler(provider_environment,enabled,cron_job_id,worker_secret_id)
  values(p_environment,true,job_id,secret_id)
  on conflict(provider_environment) do update set enabled=true,cron_job_id=excluded.cron_job_id,
    worker_secret_id=excluded.worker_secret_id,configured_at=clock_timestamp();
  return jsonb_build_object('provider_environment',p_environment,'scheduled',true,
    'cron_job_id',job_id,'schedule','1-59/5 * * * *');
end $$;
revoke all on function public.billing_configure_database_scheduler(text,text) from public, anon, authenticated;
grant execute on function public.billing_configure_database_scheduler(text,text) to service_role;

create or replace function public.billing_disable_database_scheduler(p_environment text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_environment is null or p_environment not in ('sandbox','production') then
    raise exception 'BILLING_SCHEDULER_CONFIGURATION_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dentalflow_billing_database_scheduler',0));
  perform cron.alter_job(c.cron_job_id,active:=false)
    from public.billing_database_scheduler c join cron.job j on j.jobid=c.cron_job_id
    where c.provider_environment=p_environment and j.jobname='dentalflow-billing-'||c.provider_environment;
  update public.billing_database_scheduler set enabled=false where provider_environment=p_environment;
  return true;
end $$;
revoke all on function public.billing_disable_database_scheduler(text) from public, anon, authenticated;
grant execute on function public.billing_disable_database_scheduler(text) to service_role;

create or replace function public.billing_database_scheduler_status(p_environment text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('provider_environment',c.provider_environment,'enabled',c.enabled,
    'cron_job_id',c.cron_job_id,'cron_active',coalesce(j.active,false),
    'schedule',j.schedule,'configured_at',c.configured_at,'last_dispatched_at',c.last_dispatched_at,
    'last_response_http_status',r.status_code,'last_response_timed_out',r.timed_out)
  from public.billing_database_scheduler c left join cron.job j on j.jobid=c.cron_job_id
  left join net._http_response r on r.id=c.last_request_id
  where c.provider_environment=p_environment
$$;
revoke all on function public.billing_database_scheduler_status(text) from public, anon, authenticated;
grant execute on function public.billing_database_scheduler_status(text) to service_role;
notify pgrst, 'reload schema';

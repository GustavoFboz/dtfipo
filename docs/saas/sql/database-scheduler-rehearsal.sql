-- Isolated database only. Every Vault/job/request mutation rolls back.
-- pg_net starts HTTP only after commit; this script never commits.
begin;
select has_function_privilege('anon','public.billing_configure_database_scheduler(text,text)','EXECUTE') as anon_can_configure,
  has_function_privilege('authenticated','public.billing_configure_database_scheduler(text,text)','EXECUTE') as user_can_configure,
  has_function_privilege('service_role','public.billing_enqueue_database_worker(text)','EXECUTE') as service_can_enqueue,
  has_table_privilege('authenticated','net.http_request_queue','SELECT') as user_can_read_headers,
  has_table_privilege('anon','net._http_response','SELECT') as anon_can_read_response,
  has_table_privilege('authenticated','public.billing_database_scheduler','SELECT') as user_can_read_config;
do $$
declare first_job bigint; second_job bigint; first_secret uuid; response jsonb; job_command text; request_id bigint;
begin
  if has_function_privilege('anon','public.billing_configure_database_scheduler(text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.billing_configure_database_scheduler(text,text)','EXECUTE')
    or has_function_privilege('service_role','public.billing_enqueue_database_worker(text)','EXECUTE')
    or has_table_privilege('authenticated','net.http_request_queue','SELECT')
    or has_table_privilege('anon','net._http_response','SELECT')
    or has_table_privilege('authenticated','public.billing_database_scheduler','SELECT') then
    raise exception 'SCHEDULER_PRIVATE_BOUNDARY_FAILED';
  end if;
  if not has_function_privilege('service_role','public.billing_configure_database_scheduler(text,text)','EXECUTE') then
    raise exception 'SCHEDULER_SERVICE_ROLE_MISSING';
  end if;
  begin
    perform public.billing_configure_database_scheduler('sandbox','short');
    raise exception 'INVALID_SECRET_ACCEPTED';
  exception when others then
    if sqlerrm <> 'BILLING_SCHEDULER_CONFIGURATION_INVALID' then raise; end if;
  end;
  response := public.billing_configure_database_scheduler('sandbox','fixture-sandbox-worker-not-a-real-secret-0123456789');
  first_job := (response->>'cron_job_id')::bigint;
  select worker_secret_id into first_secret from public.billing_database_scheduler where provider_environment='sandbox';
  response := public.billing_configure_database_scheduler('sandbox','fixture-sandbox-rotated-not-a-real-secret-0123456789');
  second_job := (response->>'cron_job_id')::bigint;
  if first_job<>second_job or (select worker_secret_id from public.billing_database_scheduler where provider_environment='sandbox')<>first_secret then
    raise exception 'SCHEDULER_CONFIGURATION_NOT_IDEMPOTENT';
  end if;
  select command into job_command from cron.job where jobid=first_job;
  if job_command <> 'select public.billing_enqueue_database_worker(''sandbox'');' or job_command like '%fixture%' then
    raise exception 'SCHEDULER_JOB_LEAKS_CREDENTIAL';
  end if;
  if (select decrypted_secret from vault.decrypted_secrets where id=first_secret)<>'fixture-sandbox-rotated-not-a-real-secret-0123456789' then
    raise exception 'SCHEDULER_ROTATION_FAILED';
  end if;
  request_id := public.billing_enqueue_database_worker('sandbox');
  if request_id is null or not exists(select 1 from net.http_request_queue where id=request_id
    and url='https://dtfipo.lovable.app/api/billing/asaas-worker'
    and headers->>'X-Billing-Environment'='sandbox') then raise exception 'SCHEDULER_FIXED_DISPATCH_FAILED'; end if;
  response := public.billing_database_scheduler_status('sandbox');
  if response::text like '%fixture%' or response::text like '%Bearer%' then raise exception 'SCHEDULER_STATUS_LEAKS_CREDENTIAL'; end if;
  perform public.billing_configure_database_scheduler('production','fixture-production-worker-not-a-real-secret-0123456789');
  if (select enabled from public.billing_database_scheduler where provider_environment='sandbox')
    or (select active from cron.job where jobid=first_job) then raise exception 'SCHEDULER_MULTIPLE_ENVIRONMENTS_ACTIVE'; end if;
  perform public.billing_disable_database_scheduler('production');
  if public.billing_enqueue_database_worker('production') is not null then raise exception 'DISABLED_SCHEDULER_DISPATCHED'; end if;
end $$;
rollback;

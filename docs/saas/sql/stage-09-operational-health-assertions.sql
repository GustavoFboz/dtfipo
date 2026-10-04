-- Safe READ-ONLY assertions: live database and clean restore.
begin;
set transaction read only;
do $$ declare r text; f text; begin
  if not exists(select 1 from pg_class where oid='public.billing_worker_health'::regclass and relrowsecurity)
    or exists(select 1 from pg_policies where schemaname='public' and tablename='billing_worker_health') then
    raise exception 'Private telemetry boundary missing';
  end if;
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r,'public.billing_worker_health','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_function_privilege(r,'public.billing_record_worker_health(text,uuid,text,jsonb)','EXECUTE') then
      raise exception 'Private telemetry exposed: %',r;
    end if;
  end loop;
  if not has_table_privilege('service_role','public.billing_worker_health','SELECT')
    or has_table_privilege('service_role','public.billing_worker_health','INSERT,UPDATE,DELETE,TRUNCATE')
    or not has_function_privilege('service_role','public.billing_record_worker_health(text,uuid,text,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.platform_master_operational_health()','EXECUTE')
    or not has_function_privilege('authenticated','public.platform_master_operational_health()','EXECUTE') then
    raise exception 'Telemetry RPC grants invalid';
  end if;
  foreach f in array array['billing_record_worker_health(text,uuid,text,jsonb)','platform_master_operational_health()'] loop
    if not exists(select 1 from pg_proc where oid=('public.'||f)::regprocedure and prosecdef
      and proconfig @> array['search_path=pg_catalog, public']) then raise exception 'Unsafe telemetry function: %',f; end if;
  end loop;
end $$;
select 'passed' as stage_09_operational_boundary;
rollback;

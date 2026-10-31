-- Safe READ-ONLY assertion for the live database and clean restore.
begin;
set transaction read only;
do $$ declare r record; f text; begin
  for r in select * from (values ('billing_change_requests'),('billing_change_request_events')) t(name) loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=r.name and c.relrowsecurity) then
      raise exception 'Missing RLS: %',r.name;
    end if;
    if has_table_privilege('authenticated','public.'||r.name,'select')
      or has_table_privilege('authenticated','public.'||r.name,'insert')
      or has_table_privilege('anon','public.'||r.name,'select')
      or has_table_privilege('service_role','public.'||r.name,'update') then
      raise exception 'Unvalidated table access: %',r.name;
    end if;
  end loop;
  foreach f in array array['billing_change_request_quote(uuid,text,text)','billing_change_request_summary(uuid)'] loop
    if has_function_privilege('authenticated','public.'||f,'execute')
      or has_function_privilege('anon','public.'||f,'execute') then
      raise exception 'Private helper exposed: %',f;
    end if;
  end loop;
  foreach f in array array['billing_company_change_context(uuid)','billing_submit_change_request(uuid,uuid,text,text,text)',
    'billing_withdraw_change_request(uuid,uuid)','platform_master_billing_change_requests(text)'] loop
    if has_function_privilege('anon','public.'||f,'execute')
      or not has_function_privilege('authenticated','public.'||f,'execute') then
      raise exception 'Invalid validated RPC grants: %',f;
    end if;
  end loop;
  if not exists(select 1 from pg_indexes where schemaname='public'
    and indexname='billing_change_requests_one_pending_company' and indexdef like '%UNIQUE%'
    and indexdef like '%awaiting_provider%') then raise exception 'Missing single-pending guard'; end if;
end $$;
select 'passed' as stage_08_change_request_boundary;
rollback;

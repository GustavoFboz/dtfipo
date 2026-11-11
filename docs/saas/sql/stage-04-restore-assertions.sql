-- Run after clean restore or against the live database. Read only.
begin transaction read only;
do $$
declare v_name text; v_oid oid;
begin
  foreach v_name in array array[
    'billing_receive_asaas_event(text,text,text,jsonb)',
    'billing_claim_asaas_events(text,integer)',
    'billing_finish_asaas_event(uuid,uuid,text,text)',
    'billing_apply_asaas_initial_payment(uuid,uuid,text,text,text,integer,date,text)'
  ] loop
    v_oid := to_regprocedure('public.' || v_name);
    if v_oid is null then raise exception 'Missing function: %', v_name; end if;
    if has_function_privilege('anon', v_oid, 'execute')
      or has_function_privilege('authenticated', v_oid, 'execute')
      or not has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'Unsafe grants: %', v_name;
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.billing_events'::regclass) then
    raise exception 'Webhook inbox must have RLS enabled';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and tablename = 'billing_events' and indexname = 'billing_events_provider_event_uidx') then
    raise exception 'Missing unique event identity';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'billing_events' and column_name = 'lease_token') then
    raise exception 'Missing worker lease';
  end if;
end $$;
select 'passed' as stage_04_restore_contract;
rollback;

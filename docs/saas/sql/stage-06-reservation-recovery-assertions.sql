-- Read-only; run on clean restore and the live database after the migration.
begin transaction read only;
do $$
declare v_name text;
begin
  foreach v_name in array array[
    'public.storage_upload_has_reservation_for_insert(text,text,jsonb)',
    'public.release_storage_upload_reservation(uuid,uuid)'
  ] loop
    if to_regprocedure(v_name) is null
      or has_function_privilege('anon', v_name, 'EXECUTE')
      or not has_function_privilege('authenticated', v_name, 'EXECUTE') then
      raise exception 'Recovery function missing or grant unsafe: %', v_name;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = to_regprocedure(v_name)
      and p.prosecdef and p.provolatile = 'v' and 'search_path=public' = any(p.proconfig)) then
      raise exception 'Recovery lock/snapshot contract unsafe: %', v_name;
    end if;
  end loop;
  if not exists (select 1 from pg_proc p
    where p.oid = 'public.storage_upload_has_reservation(text,text,jsonb)'::regprocedure
      and p.provolatile = 's') then
    raise exception 'The read-only upload helper changed volatility';
  end if;
  if not exists (select 1 from pg_policies p where p.schemaname = 'storage'
    and p.tablename = 'objects' and p.policyname = 'managed_storage_reserved_insert'
    and p.permissive = 'RESTRICTIVE' and p.cmd = 'INSERT'
    and p.with_check like '%storage_upload_has_reservation_for_insert%') then
    raise exception 'Storage INSERT does not serialize with reservation recovery';
  end if;
end $$;
select 'passed' as stage_06_reservation_recovery_contract;
rollback;

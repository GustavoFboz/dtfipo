-- Read-only checks suitable for the restore and the live database.
begin transaction read only;
do $$
declare v_fn oid := to_regprocedure('public.recalculate_clinic_storage_limit(uuid)');
begin
  if v_fn is null then raise exception 'Stage 06 quota function missing'; end if;
  if has_function_privilege('anon', v_fn, 'execute')
    or has_function_privilege('authenticated', v_fn, 'execute')
    or not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'Stage 06 quota function has unsafe grants';
  end if;
end $$;
select 'passed' as stage_06_quota_contract;
rollback;

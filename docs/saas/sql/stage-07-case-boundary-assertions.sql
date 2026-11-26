-- Read-only: valid for the restored schema and for the live backend.
begin read only;
do $$
begin
  if (select count(*) from pg_policies where permissive='RESTRICTIVE' and policyname in
    ('cases_company_read_boundary','cases_company_update_boundary','cases_company_delete_boundary',
     'cases_company_insert_boundary','case_attachments_company_boundary','case_storage_read_boundary','case_storage_delete_boundary')) <> 7 then
    raise exception 'Missing restrictive case company policies';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.cases'::regclass and tgname='trg_case_company_write' and not tgisinternal and tgenabled='O') then
    raise exception 'Case ownership write guard is not enabled';
  end if;
  if has_function_privilege('anon','public.guard_case_company_write()','execute')
    or has_function_privilege('authenticated','public.guard_case_company_write()','execute')
    or has_function_privilege('anon','public.can_access_case(uuid)','execute')
    or has_function_privilege('anon','public.resolve_case_clinic_id(uuid)','execute') then
    raise exception 'Case privileged helper exposed to an unauthorized role';
  end if;
end $$;
select 'passed' as stage_07_case_boundary;
rollback;

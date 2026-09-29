-- Read-only; safe to run after the migration on restore and on the live DB.
begin transaction read only;
do $$
declare v_name text;
begin
  if has_table_privilege('authenticated', 'public.storage_files', 'INSERT')
    or has_table_privilege('authenticated', 'public.storage_files', 'UPDATE')
    or has_table_privilege('authenticated', 'public.storage_files', 'DELETE') then
    raise exception 'Authenticated users can manipulate the storage ledger';
  end if;
  foreach v_name in array array[
    'managed_storage_reserved_insert', 'managed_storage_no_update'
  ] loop
    if not exists (select 1 from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.policyname = v_name and p.permissive = 'RESTRICTIVE') then
      raise exception 'Missing restrictive Storage policy: %', v_name;
    end if;
  end loop;
  if not exists (select 1 from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.policyname = 'managed_storage_reserved_insert' and p.cmd = 'INSERT'
        and p.with_check like '%storage_upload_has_reservation%') then
    raise exception 'Storage INSERT does not require a reservation';
  end if;
  if not exists (select 1 from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.policyname = 'dicom_objects_insert'
        and p.with_check like '%patient_id_from_storage_path%'
        and p.with_check not like '%c.name%') then
    raise exception 'DICOM path refers to another table';
  end if;
  foreach v_name in array array[
    'trg_guard_saas_storage_clinic_fields',
    'trg_guard_saas_storage_profile_fields',
    'trg_guard_saas_patient_company'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = v_name and not tgisinternal) then
      raise exception 'Storage authority guard missing: %', v_name;
    end if;
  end loop;
  if to_regprocedure('public.storage_upload_has_reservation(text,text,jsonb)') is null
    or has_function_privilege('anon', 'public.storage_upload_has_reservation(text,text,jsonb)', 'EXECUTE') then
    raise exception 'Reservation authorization function missing or open to anon';
  end if;
end $$;
select 'passed' as stage_06_upload_contract;
rollback;

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
        and p.policyname = 'case_files_reserved_uploader_read' and p.cmd = 'SELECT'
        and p.qual like '%storage_upload_has_reservation%') then
    raise exception 'Case uploads cannot return their reserved object';
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
do $$
declare v_record record;
begin
  for v_record in select * from (values
    ('storage','objects','patient_storage_read_boundary','SELECT'),
    ('storage','objects','patient_storage_delete_boundary','DELETE'),
    ('public','patients','patients_company_read_boundary','SELECT'),
    ('public','patients','patients_company_update_boundary','UPDATE'),
    ('public','patients','patients_company_delete_boundary','DELETE'),
    ('public','patient_attachments','patient_attachments_company_boundary','ALL')
  ) as required(schema_name,table_name,policy_name,command) loop
    if not exists(select 1 from pg_policies p
      where p.schemaname=v_record.schema_name and p.tablename=v_record.table_name
        and p.policyname=v_record.policy_name and p.cmd=v_record.command
        and p.permissive='RESTRICTIVE' and p.qual like '%can_access_patient%') then
      raise exception 'Patient company boundary missing: %',v_record.policy_name;
    end if;
  end loop;
  if has_function_privilege('anon','public.can_access_patient(uuid)','EXECUTE') then
    raise exception 'Patient access helper is open to anonymous callers';
  end if;
end $$;
select 'passed' as stage_06_upload_contract;
rollback;

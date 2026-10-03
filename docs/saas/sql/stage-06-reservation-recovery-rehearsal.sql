-- DISPOSABLE clean restore only. Synthetic rows, no files, rollback at the end.
begin;
insert into storage.buckets (id, name, public) values ('avatars','avatars',false) on conflict (id) do nothing;
insert into public.clinics (id, name, slug, storage_limit_bytes) values
  ('60000000-0000-4000-8000-000000000090','Recovery company A','stage06-recovery-a',1000),
  ('60000000-0000-4000-8000-000000000093','Recovery company B','stage06-recovery-b',1000);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated','authenticated',email,'',now(),now() from (values
  ('60000000-0000-4000-8000-000000000091','recovery-admin@test.invalid'),
  ('60000000-0000-4000-8000-000000000092','recovery-staff@test.invalid'),
  ('60000000-0000-4000-8000-000000000094','recovery-other@test.invalid')) u(id,email);
-- Reproduce approved membership before changing the auto-created profiles.
-- Keep privilege-escalation triggers enabled throughout this rehearsal.
insert into public.clinic_members (clinic_id,user_id,role,status) values
  ('60000000-0000-4000-8000-000000000090','60000000-0000-4000-8000-000000000091','CEO','active'),
  ('60000000-0000-4000-8000-000000000090','60000000-0000-4000-8000-000000000092','DR','active'),
  ('60000000-0000-4000-8000-000000000093','60000000-0000-4000-8000-000000000094','CEO','active');
insert into public.profiles (id,clinic_id,role,account_subtype,is_default_admin) values
  ('60000000-0000-4000-8000-000000000091','60000000-0000-4000-8000-000000000090','CEO','CEO',true),
  ('60000000-0000-4000-8000-000000000094','60000000-0000-4000-8000-000000000093','CEO','CEO',true)
on conflict (id) do update set clinic_id=excluded.clinic_id,role=excluded.role,
  account_subtype=excluded.account_subtype,is_default_admin=excluded.is_default_admin;
insert into public.profiles (id,clinic_id,role) values
  ('60000000-0000-4000-8000-000000000092','60000000-0000-4000-8000-000000000090','DR')
on conflict (id) do update set clinic_id=excluded.clinic_id,role=excluded.role;
insert into public.storage_files (id,clinic_id,bucket,object_path,source_type,source_id,
  original_name,size_bytes,status,uploaded_by,created_at)
select ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '60000000-0000-4000-8000-000000000090'::uuid,'avatars',
  '60000000-0000-4000-8000-000000000091/'||label||'.jpg','user_avatar',
  case when n=103 then 'linked-source' end,label||'.jpg',size,
  case when n=102 then 'ready' else 'reserved' end,
  '60000000-0000-4000-8000-000000000091'::uuid,
  now()-case when n=101 then interval '1 hour' else interval '2 days' end
from (values (100,'abandoned',100),(101,'recent',10),(102,'ready',20),
  (103,'linked',30),(104,'object',40),(106,'avatar',60)) f(n,label,size);
insert into public.storage_files (id,clinic_id,bucket,object_path,source_type,original_name,size_bytes,status,uploaded_by,created_at)
values ('60000000-0000-4000-8000-000000000105','60000000-0000-4000-8000-000000000093','avatars',
  '60000000-0000-4000-8000-000000000094/foreign.jpg','user_avatar','foreign.jpg',50,'reserved',
  '60000000-0000-4000-8000-000000000094',now()-interval '2 days');
insert into storage.objects (bucket_id,name,metadata,owner_id) values
  ('avatars','60000000-0000-4000-8000-000000000091/object.jpg','{"size":40}',
   '60000000-0000-4000-8000-000000000091');
update public.profiles set avatar_url='https://test.invalid/storage/v1/object/avatars/60000000-0000-4000-8000-000000000091/avatar.jpg'
where id='60000000-0000-4000-8000-000000000091';

select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000091","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000091',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare v_result jsonb; v_row record; v_error text; v_before bigint;
begin
  select used_bytes into v_before from public.get_storage_usage();
  for v_row in select * from (values
    (101,'STORAGE_RESERVATION_TOO_RECENT'),(102,'STORAGE_RESERVATION_NOT_PENDING'),
    (103,'STORAGE_RESERVATION_HAS_SOURCE'),(104,'STORAGE_OBJECT_STILL_EXISTS'),
    (106,'STORAGE_RESERVATION_HAS_SOURCE')) t(n,expected) loop
    v_error := null;
    begin
      perform public.release_storage_upload_reservation(
        ('60000000-0000-4000-8000-'||lpad(v_row.n::text,12,'0'))::uuid,
        '60000000-0000-4000-8000-000000000090');
    exception when others then v_error := sqlerrm; end;
    if v_error is distinct from v_row.expected then
      raise exception 'Recovery guard % expected %, got %',v_row.n,v_row.expected,v_error;
    end if;
  end loop;
  -- A foreign file ID is invisible even when paired with an authorized company.
  v_result := public.release_storage_upload_reservation('60000000-0000-4000-8000-000000000105',
    '60000000-0000-4000-8000-000000000090');
  if (v_result->>'released')::boolean or (select used_bytes from public.get_storage_usage())<>v_before then
    raise exception 'Rejected recovery changed quota';
  end if;
  -- Omitted INSERT metadata remains supported; malformed and wrong sizes do not.
  if not public.storage_upload_has_reservation_for_insert('avatars',
    '60000000-0000-4000-8000-000000000091/abandoned.jpg',null)
    or public.storage_upload_has_reservation_for_insert('avatars',
      '60000000-0000-4000-8000-000000000091/abandoned.jpg','{"size":99}')
    or public.storage_upload_has_reservation_for_insert('avatars',
      '60000000-0000-4000-8000-000000000091/abandoned.jpg','{"size":"invalid"}') then
    raise exception 'INSERT helper broke the metadata contract';
  end if;
end $$;

-- Membership in the same company does not grant administrative recovery rights.
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000092","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000092',true);
do $$ declare v_error text; begin
  begin perform public.release_storage_upload_reservation('60000000-0000-4000-8000-000000000100',
    '60000000-0000-4000-8000-000000000090'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'STORAGE_MANAGEMENT_NOT_ALLOWED' then raise exception 'Staff recovery was allowed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000094","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000094',true);
do $$ declare v_error text; begin
  begin perform public.release_storage_upload_reservation('60000000-0000-4000-8000-000000000100',
    '60000000-0000-4000-8000-000000000090'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'STORAGE_MANAGEMENT_NOT_ALLOWED' then raise exception 'Foreign admin recovery was allowed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000091","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000091',true);
select set_config('request.jwt.claim.role','anon',true);
do $$ declare v_error text; begin
  begin perform public.release_storage_upload_reservation('60000000-0000-4000-8000-000000000100',
    '60000000-0000-4000-8000-000000000090'); exception when others then v_error:=sqlerrm; end;
  if v_error is distinct from 'NOT_AUTHENTICATED' then raise exception 'A non-authenticated JWT role was accepted'; end if;
end $$;
select set_config('request.jwt.claim.role','authenticated',true);
do $$ declare v_result jsonb; v_before bigint; begin
  select used_bytes into v_before from public.get_storage_usage();
  v_result:=public.release_storage_upload_reservation('60000000-0000-4000-8000-000000000100',
    '60000000-0000-4000-8000-000000000090');
  if not (v_result->>'released')::boolean or (v_result->>'released_bytes')::bigint<>100
    or (select used_bytes from public.get_storage_usage())<>v_before-100 then
    raise exception 'Approved recovery did not release exactly the reserved bytes';
  end if;
  v_result:=public.release_storage_upload_reservation('60000000-0000-4000-8000-000000000100',
    '60000000-0000-4000-8000-000000000090');
  if (v_result->>'released')::boolean or (v_result->>'released_bytes')::bigint<>0
    or (select used_bytes from public.get_storage_usage())<>v_before-100 then
    raise exception 'Repeated recovery changed quota twice';
  end if;
  if public.storage_upload_has_reservation_for_insert('avatars',
    '60000000-0000-4000-8000-000000000091/abandoned.jpg',null) then
    raise exception 'Released reservation still authorized an upload';
  end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.storage_files where clinic_id in (
    '60000000-0000-4000-8000-000000000090','60000000-0000-4000-8000-000000000093'))<>6
    or not exists (select 1 from storage.objects where bucket_id='avatars'
      and name='60000000-0000-4000-8000-000000000091/object.jpg') then
    raise exception 'Recovery changed a protected row or object';
  end if;
end $$;
select 'passed' as stage_06_reservation_recovery_rehearsal;
rollback;

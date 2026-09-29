-- Disposable clean restore only: test RLS using the authenticated database role.
-- SQL metadata below is synthetic and is rolled back; live objects use Storage API.
begin;
-- A clean schema restore does not create the dashboard-managed file buckets.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false), ('case-files', 'case-files', false)
on conflict (id) do nothing;
insert into public.clinics (id, name, slug, storage_limit_bytes)
values ('60000000-0000-4000-8000-000000000060', 'Storage rehearsal', 'stage06-upload-rehearsal', 100);
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('60000000-0000-4000-8000-000000000061', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stage06-upload@test.invalid', '', now(), now());
update public.clinics set owner_id = '60000000-0000-4000-8000-000000000061'
where id = '60000000-0000-4000-8000-000000000060';
insert into public.clinic_members (clinic_id, user_id, role, status)
values ('60000000-0000-4000-8000-000000000060',
        '60000000-0000-4000-8000-000000000061', 'CEO', 'active');
insert into public.profiles (id, clinic_id, role, account_subtype, is_default_admin)
values ('60000000-0000-4000-8000-000000000061',
        '60000000-0000-4000-8000-000000000060', 'CEO', 'CEO', true)
on conflict (id) do update set clinic_id = excluded.clinic_id,
  role = excluded.role, account_subtype = excluded.account_subtype,
  is_default_admin = excluded.is_default_admin;
insert into public.account_subscriptions
  (scope_type, clinic_id, plan_code, status, billing_day,
   current_period_start, current_period_end, billing_provider,
   provider_environment, external_customer_id, external_subscription_id)
values ('company', '60000000-0000-4000-8000-000000000060', 'company_initial',
        'active', 29, now(), now() + interval '1 month', 'asaas', 'sandbox',
        'cus_Stage06Upload', 'sub_Stage06Upload');
insert into public.patients (id, name, clinic_id)
values ('60000000-0000-4000-8000-000000000062', 'Rehearsal patient',
        '60000000-0000-4000-8000-000000000060');
insert into public.cases (id, patient_id, requested_by, delivery_date)
values ('60000000-0000-4000-8000-000000000063',
        '60000000-0000-4000-8000-000000000062',
        '60000000-0000-4000-8000-000000000061', current_date + 7);
update public.clinics set storage_limit_bytes = 100
where id = '60000000-0000-4000-8000-000000000060';

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000061', true);
set local role authenticated;
do $$
declare
  v_user uuid := '60000000-0000-4000-8000-000000000061';
  v_path text := '60000000-0000-4000-8000-000000000061/accepted.jpg';
  v_file uuid;
  v_case_file uuid;
  v_case_id uuid := '60000000-0000-4000-8000-000000000063';
  v_case_path text := '60000000-0000-4000-8000-000000000063/test.stl';
  v_rejected boolean;
begin
  -- A direct upload cannot use a permissive bucket policy as a bypass.
  v_rejected := false;
  begin
    insert into storage.objects (bucket_id, name, metadata, owner_id)
    values ('avatars', v_user::text || '/unreserved.jpg', '{"size":10}', v_user::text);
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'Direct Storage upload bypassed reservation'; end if;

  select file_id into v_file from public.reserve_storage_upload(
    70, 'avatars', v_path, 'user_avatar', null, null, 'accepted.jpg', 'image/jpeg');
  if v_file is null then raise exception 'Reservation was not created'; end if;

  v_rejected := false;
  begin
    perform * from public.reserve_storage_upload(
      31, 'avatars', v_user::text || '/over.jpg', 'user_avatar');
  exception when others then
    v_rejected := sqlerrm = 'STORAGE_QUOTA_EXCEEDED';
  end;
  if not v_rejected then raise exception 'Quota allowed an over-limit reservation'; end if;

  v_rejected := false;
  begin
    perform * from public.reserve_storage_upload(
      1, 'avatars', v_user::text || '/wrong.jpg', 'other');
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'Reservation allowed an unknown source'; end if;

  v_rejected := false;
  begin
    insert into storage.objects (bucket_id, name, metadata, owner_id)
    values ('avatars', v_path, '{"size":69}', v_user::text);
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'Wrong actual size passed Storage RLS'; end if;

  v_rejected := false;
  begin perform public.complete_storage_upload(v_file, v_user::text);
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'Missing object completed the reservation'; end if;

  insert into storage.objects (bucket_id, name, metadata, owner_id)
  values ('avatars', v_path, '{"size":70,"mimetype":"image/jpeg"}', v_user::text);

  v_rejected := false;
  begin perform public.cancel_storage_upload(v_file);
  exception when others then v_rejected := sqlerrm = 'STORAGE_OBJECT_STILL_EXISTS'; end;
  if not v_rejected then raise exception 'Existing object was removed from the ledger'; end if;

  perform public.complete_storage_upload(v_file, v_user::text);
  if (select size_bytes from public.storage_files where id = v_file) <> 70 then
    raise exception 'The actual object size was not preserved';
  end if;

  -- Storage must return a case object before its attachment row is written.
  select file_id into v_case_file from public.reserve_storage_upload(
    5, 'case-files', v_case_path, 'case_attachment', v_case_id);
  if v_case_file is null then raise exception 'Case upload reservation failed'; end if;
  insert into storage.objects (bucket_id, name, metadata, owner_id)
  values ('case-files', v_case_path, '{"size":5}', v_user::text);
  if not exists (select 1 from storage.objects
                 where bucket_id = 'case-files' and name = v_case_path) then
    raise exception 'Uploader could not read the reserved case object';
  end if;

  v_rejected := false;
  begin delete from public.storage_files where id = v_file;
  exception when others then v_rejected := true; end;
  if not v_rejected then raise exception 'Direct ledger delete was allowed'; end if;

  begin update public.clinics set storage_limit_bytes = 1000000
    where id = '60000000-0000-4000-8000-000000000060';
  exception when others then null; end;
  if (select limit_bytes from public.get_storage_usage()) is distinct from 100 then
    raise exception 'Company directly inflated its storage limit';
  end if;

  begin update public.profiles set role = 'admin' where id = v_user;
  exception when others then null; end;
  if (select role from public.profiles where id = v_user) is distinct from 'CEO' then
    raise exception 'User directly promoted their profile';
  end if;
end $$;
rollback;

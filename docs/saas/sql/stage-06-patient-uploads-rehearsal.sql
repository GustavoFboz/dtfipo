-- Disposable restored database ONLY. SQL metadata simulates Storage; this is
-- not a real HTTP upload or device acceptance. All fixture writes roll back.
begin;
insert into storage.buckets (id,name,public)
values ('patient-photos','patient-photos',false),('patient-files','patient-files',false)
on conflict (id) do nothing;
insert into public.clinics (id,name,slug,storage_limit_bytes)
values ('65000000-0000-4000-8000-000000000060','Patient upload rehearsal','stage06-patients',100),
       ('65000000-0000-4000-8000-000000000070','Other rehearsal company','stage06-patients-other',100);
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('65000000-0000-4000-8000-000000000061','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','stage06-patients@test.invalid','',now(),now()),
       ('65000000-0000-4000-8000-000000000074','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','stage06-other-company@test.invalid','',now(),now());
update public.clinics set owner_id='65000000-0000-4000-8000-000000000061'
where id='65000000-0000-4000-8000-000000000060';
insert into public.clinic_members (clinic_id,user_id,role,status)
values ('65000000-0000-4000-8000-000000000060','65000000-0000-4000-8000-000000000061','CEO','active');
insert into public.profiles (id,clinic_id,role,account_subtype,is_default_admin)
values ('65000000-0000-4000-8000-000000000061','65000000-0000-4000-8000-000000000060','CEO','CEO',true)
on conflict (id) do update set clinic_id=excluded.clinic_id,role=excluded.role,
  account_subtype=excluded.account_subtype,is_default_admin=excluded.is_default_admin;
insert into public.profiles (id,clinic_id,role,account_subtype,is_default_admin)
values ('65000000-0000-4000-8000-000000000074','65000000-0000-4000-8000-000000000070','CEO','CEO',true)
on conflict (id) do update set clinic_id=excluded.clinic_id,role=excluded.role,
  account_subtype=excluded.account_subtype,is_default_admin=excluded.is_default_admin;
insert into public.user_roles (user_id,role)
values ('65000000-0000-4000-8000-000000000061','admin');
insert into public.account_subscriptions
  (scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,
   billing_provider,provider_environment,external_customer_id,external_subscription_id)
values ('company','65000000-0000-4000-8000-000000000060','company_initial','active',28,now(),now()+interval '1 month',
        'asaas','sandbox','cus_Stage06Patients','sub_Stage06Patients'),
       ('company','65000000-0000-4000-8000-000000000070','company_initial','active',28,now(),now()+interval '1 month',
        'asaas','sandbox','cus_Stage06OtherPatients','sub_Stage06OtherPatients');
insert into public.patients (id,name,clinic_id)
values ('65000000-0000-4000-8000-000000000062','Patient fixture','65000000-0000-4000-8000-000000000060'),
       ('65000000-0000-4000-8000-000000000072','Other patient fixture','65000000-0000-4000-8000-000000000070');
update public.clinics set storage_limit_bytes=100 where id='65000000-0000-4000-8000-000000000060';
-- Other-company fixtures are created as the trusted restore role, never by
-- the actor whose RLS boundary is under test.
select set_config('request.jwt.claim.sub','65000000-0000-4000-8000-000000000074',true);
select * from public.reserve_storage_upload(1,'patient-photos',
  '65000000-0000-4000-8000-000000000072/foreign.jpg','patient_photo',null,
  '65000000-0000-4000-8000-000000000072');
select * from public.reserve_storage_upload(1,'patient-files',
  '65000000-0000-4000-8000-000000000072/foreign.pdf','patient_attachment',null,
  '65000000-0000-4000-8000-000000000072');
insert into storage.objects (bucket_id,name,metadata)
values ('patient-photos','65000000-0000-4000-8000-000000000072/foreign.jpg','{"size":1}'),
       ('patient-files','65000000-0000-4000-8000-000000000072/foreign.pdf','{"size":1}');
insert into public.patient_attachments (id,patient_id,title,kind,file_url,file_path,size_bytes)
values ('65000000-0000-4000-8000-000000000076','65000000-0000-4000-8000-000000000072',
        'Other company fixture','other','https://example.invalid/foreign',
        '65000000-0000-4000-8000-000000000072/foreign.pdf',1);
select set_config('request.jwt.claim.sub','65000000-0000-4000-8000-000000000061',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare
  v_patient uuid := '65000000-0000-4000-8000-000000000062';
  v_other uuid := '65000000-0000-4000-8000-000000000072';
  v_photo_path text := v_patient::text || '/photo.jpg';
  v_file_path text := v_patient::text || '/file.pdf';
  v_photo uuid; v_file uuid; v_rejected boolean; v_bucket text; v_source text;
  v_attachment uuid := '65000000-0000-4000-8000-000000000066';
  v_count bigint;
begin
  if public.can_access_patient(v_other) or exists(select 1 from public.patients where id=v_other)
    or exists(select 1 from public.patient_attachments where patient_id=v_other)
    or exists(select 1 from storage.objects where name like v_other::text || '/%') then
    raise exception 'Staff role exposed an unrelated company patient or private object';
  end if;
  update public.patients set name='Unauthorized update' where id=v_other;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'Staff updated an unrelated company patient'; end if;
  delete from public.patient_attachments where patient_id=v_other;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'Staff deleted another company attachment'; end if;
  delete from storage.objects where name like v_other::text || '/%';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'Staff deleted another company object'; end if;
  delete from public.patients where id=v_other;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'Staff deleted another company patient'; end if;
  foreach v_bucket in array array['patient-photos','patient-files'] loop
    v_source := case when v_bucket='patient-photos' then 'patient_photo' else 'patient_attachment' end;
    v_rejected := false;
    begin
      insert into storage.objects (bucket_id,name,metadata,owner_id)
      values (v_bucket,v_patient::text || '/unreserved','{"size":1}',auth.uid()::text);
    exception when insufficient_privilege then v_rejected := true; end;
    if not v_rejected then raise exception 'Unreserved patient upload was accepted'; end if;
    v_rejected := false;
    begin
      perform * from public.reserve_storage_upload(1,v_bucket,v_other::text || '/foreign',v_source,null,v_other);
    exception when others then v_rejected := sqlerrm='STORAGE_RESERVATION_NOT_ALLOWED'; end;
    if not v_rejected then raise exception 'Patient upload charged another company'; end if;
  end loop;
  select file_id into v_photo from public.reserve_storage_upload(40,'patient-photos',v_photo_path,'patient_photo',null,v_patient);
  select file_id into v_file from public.reserve_storage_upload(60,'patient-files',v_file_path,'patient_attachment',null,v_patient);
  if (select used_bytes from public.get_storage_usage()) <> 100 then raise exception 'Reservations did not reach the exact limit'; end if;
  v_rejected := false;
  begin
    perform * from public.reserve_storage_upload(1,'patient-files',v_patient::text || '/over','patient_attachment',null,v_patient);
  exception when others then v_rejected := sqlerrm='STORAGE_QUOTA_EXCEEDED'; end;
  if not v_rejected then raise exception 'Patient quota allowed one byte above the limit'; end if;
  v_rejected := false;
  begin
    insert into storage.objects (bucket_id,name,metadata,owner_id)
    values ('patient-photos',v_photo_path,'{"size":41}',auth.uid()::text);
  exception when insufficient_privilege then v_rejected := true; end;
  if not v_rejected then raise exception 'Patient photo passed with an understated reservation'; end if;
  insert into storage.objects (bucket_id,name,metadata,owner_id)
  values ('patient-photos',v_photo_path,'{"size":40}',auth.uid()::text),
         ('patient-files',v_file_path,'{"size":60}',auth.uid()::text);
  if (select count(*) from storage.objects where name in(v_photo_path,v_file_path)) <> 2 then
    raise exception 'Own patient upload could not be read at the exact quota limit';
  end if;
  perform public.complete_storage_upload(v_photo,v_patient::text);
  insert into public.patient_attachments (id,patient_id,title,kind,file_url,file_path,size_bytes,mime_type)
  values (v_attachment,v_patient,'Fixture','other','https://example.invalid/file',v_file_path,60,'application/pdf');
  perform public.complete_storage_upload(v_file,v_attachment::text);
  v_rejected := false;
  begin perform public.cancel_storage_upload(v_file);
  exception when others then v_rejected := sqlerrm='STORAGE_OBJECT_STILL_EXISTS'; end;
  if not v_rejected then raise exception 'Existing patient object stopped counting toward quota'; end if;
  -- A disappearing source alone cannot erase bytes still present in Storage.
  delete from public.patient_attachments where id=v_attachment;
  if not exists(select 1 from public.storage_files where id=v_file)
    or (select used_bytes from public.get_storage_usage()) <> 100 then
    raise exception 'Source deletion incorrectly freed occupied bytes';
  end if;
  delete from storage.objects where bucket_id='patient-files' and name=v_file_path;
  perform public.cancel_storage_upload(v_file);
  if (select used_bytes from public.get_storage_usage()) <> 40 then raise exception 'Patient file cleanup did not free exactly 60 bytes'; end if;
  delete from storage.objects where bucket_id='patient-photos' and name=v_photo_path;
  perform public.cancel_storage_upload(v_photo);
  if (select used_bytes from public.get_storage_usage()) <> 0 then raise exception 'Patient cleanup left charged bytes'; end if;
end $$;
reset role;
-- Cross-company case participation stays explicit and follows approval.
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('65000000-0000-4000-8000-000000000063','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','stage06-specialist@test.invalid','',now(),now());
insert into public.profiles (id,clinic_id,role,account_subtype,is_default_admin)
values ('65000000-0000-4000-8000-000000000063','65000000-0000-4000-8000-000000000060','CADISTA','CADISTA',false)
on conflict (id) do update set clinic_id=excluded.clinic_id,role=excluded.role,
  account_subtype=excluded.account_subtype,is_default_admin=false;
insert into public.user_roles (user_id,role)
values ('65000000-0000-4000-8000-000000000063','cadista');
insert into public.cadistas (id,name,user_id)
values ('65000000-0000-4000-8000-000000000064','Assigned specialist fixture','65000000-0000-4000-8000-000000000063');
insert into public.cases (id,patient_id,requested_by,cadista_id,delivery_date,status)
values ('65000000-0000-4000-8000-000000000065','65000000-0000-4000-8000-000000000072',
        '65000000-0000-4000-8000-000000000061','65000000-0000-4000-8000-000000000064',current_date+7,'pendente');
set local role authenticated;
do $$ begin
  if not public.can_access_patient('65000000-0000-4000-8000-000000000072') then
    raise exception 'Requester lost their own cross-company pending request';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','65000000-0000-4000-8000-000000000063',true);
set local role authenticated;
do $$ begin
  if public.can_access_patient('65000000-0000-4000-8000-000000000072')
    or exists(select 1 from storage.objects where name like '65000000-0000-4000-8000-000000000072/%') then
    raise exception 'Assigned specialist received a foreign patient before approval';
  end if;
end $$;
reset role;
update public.cases set status='em_andamento' where id='65000000-0000-4000-8000-000000000065';
set local role authenticated;
do $$ begin
  if not public.can_access_patient('65000000-0000-4000-8000-000000000072')
    or not exists(select 1 from public.patients where id='65000000-0000-4000-8000-000000000072')
    or (select count(*) from storage.objects where name like '65000000-0000-4000-8000-000000000072/%') <> 2 then
    raise exception 'Approved specialist lost patient identity or private files';
  end if;
end $$;
reset role;
update public.cases set cadista_id=null where id='65000000-0000-4000-8000-000000000065';
set local role authenticated;
do $$ begin
  if public.can_access_patient('65000000-0000-4000-8000-000000000072')
    or exists(select 1 from storage.objects where name like '65000000-0000-4000-8000-000000000072/%') then
    raise exception 'Removed specialist retained foreign patient access';
  end if;
end $$;
select 'passed' as stage_06_patient_uploads;
rollback;

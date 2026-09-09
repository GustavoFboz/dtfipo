-- DentalFlow 0.3.2 — private DICOM storage and subscription-aware access

create or replace function public.company_has_operational_access(_clinic_id uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((
    select public.subscription_access_mode(s.status,s.current_period_end,s.grace_until)='full'
    from public.account_subscriptions s
    where s.clinic_id=_clinic_id
    order by (s.status<>'canceled') desc, s.created_at desc
    limit 1
  ), false)
$$;

create or replace function public.user_can_use_company_session(_clinic_id uuid, _session_type text)
returns boolean
language sql stable security definer set search_path=public as $$
  select
    public.company_has_operational_access(_clinic_id)
    and exists(select 1 from public.company_sessions s where s.clinic_id=_clinic_id and s.session_type=_session_type and s.status='active')
    and (
      exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=_clinic_id and m.user_id=auth.uid() and m.status='accepted')
      or exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=_clinic_id)
    )
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'dicom-files',
  'dicom-files',
  false,
  1073741824,
  array['application/dicom','application/octet-stream']::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types,
  updated_at=now();

-- Object names are always: <clinic_uuid>/<study_uuid>/<series_uuid>/<filename>
drop policy if exists dicom_objects_read on storage.objects;
create policy dicom_objects_read on storage.objects
for select to authenticated
using (
  bucket_id='dicom-files'
  and exists(
    select 1 from public.clinics c
    where c.id::text=split_part(name,'/',1)
      and (
        c.owner_id=auth.uid()
        or exists(select 1 from public.clinic_members m where m.clinic_id=c.id and m.user_id=auth.uid() and m.status='accepted')
        or exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=c.id)
      )
  )
);

drop policy if exists dicom_objects_insert on storage.objects;
create policy dicom_objects_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='dicom-files'
  and exists(
    select 1 from public.clinics c
    where c.id::text=split_part(name,'/',1)
      and public.user_can_use_company_session(c.id,'radiology')
  )
);

drop policy if exists dicom_objects_update on storage.objects;
create policy dicom_objects_update on storage.objects
for update to authenticated
using (
  bucket_id='dicom-files'
  and exists(select 1 from public.clinics c where c.id::text=split_part(name,'/',1) and public.user_can_use_company_session(c.id,'radiology'))
)
with check (
  bucket_id='dicom-files'
  and exists(select 1 from public.clinics c where c.id::text=split_part(name,'/',1) and public.user_can_use_company_session(c.id,'radiology'))
);

drop policy if exists dicom_objects_delete on storage.objects;
create policy dicom_objects_delete on storage.objects
for delete to authenticated
using (
  bucket_id='dicom-files'
  and exists(select 1 from public.clinics c where c.id::text=split_part(name,'/',1) and public.user_can_use_company_session(c.id,'radiology'))
);

-- Replace broad study write policy with subscription/session-aware policies.
drop policy if exists radiology_studies_member_write on public.radiology_studies;
drop policy if exists radiology_studies_write on public.radiology_studies;
create policy radiology_studies_write on public.radiology_studies
for all to authenticated
using (public.user_can_use_company_session(clinic_id,'radiology'))
with check (public.user_can_use_company_session(clinic_id,'radiology'));

drop policy if exists radiology_series_write on public.radiology_series;
create policy radiology_series_write on public.radiology_series
for all to authenticated
using (
  exists(select 1 from public.radiology_studies st where st.id=study_id and public.user_can_use_company_session(st.clinic_id,'radiology'))
)
with check (
  exists(select 1 from public.radiology_studies st where st.id=study_id and public.user_can_use_company_session(st.clinic_id,'radiology'))
);

drop policy if exists radiology_instances_write on public.radiology_instances;
create policy radiology_instances_write on public.radiology_instances
for all to authenticated
using (
  exists(
    select 1 from public.radiology_series se
    join public.radiology_studies st on st.id=se.study_id
    where se.id=series_id and public.user_can_use_company_session(st.clinic_id,'radiology')
  )
)
with check (
  exists(
    select 1 from public.radiology_series se
    join public.radiology_studies st on st.id=se.study_id
    where se.id=series_id and public.user_can_use_company_session(st.clinic_id,'radiology')
  )
);

grant insert,update,delete on public.radiology_studies,public.radiology_series,public.radiology_instances to authenticated;
grant execute on function public.company_has_operational_access(uuid),public.user_can_use_company_session(uuid,text) to authenticated;

-- Audited, resumable rotation of already-issued legacy photo/avatar URLs.
-- Administrative preparation is owner-only SQL; this migration moves no bytes.
create table public.private_file_rotation_jobs (
 id uuid primary key,
 token_hash text check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 authorized_at timestamptz not null default now(),
 claimed_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 status text not null default 'prepared' check(status in ('prepared','running','completed','review_required')),
 authorization_note text not null check(length(authorization_note) between 16 and 300),
 completed_at timestamptz,
 receipt jsonb,
 check(expires_at<=authorized_at+interval '15 minutes'),
 check((status='prepared')=(token_hash is not null))
);
create table public.private_file_rotation_targets (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.private_file_rotation_jobs(id),
 bucket text not null check(bucket in ('patient-photos','avatars')),
 subject_id uuid not null,
 old_path text not null,
 new_path text not null,
 old_reference text not null,
 old_signed_url text not null,
 storage_file_id uuid not null,
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=2097152),
 status text not null default 'prepared' check(status in ('prepared','activated','verified')),
 content_hash text check(content_hash ~ '^[a-f0-9]{64}$'),
 activated_at timestamptz,
 verified_at timestamptz,
 old_http_status integer,
 unique(bucket,old_path),unique(bucket,new_path),unique(storage_file_id),
 check(old_path<>new_path and split_part(old_path,'/',1)=subject_id::text
  and split_part(new_path,'/',1)=subject_id::text and length(old_path)<1024 and length(new_path)<1024
  and old_path!~ '(^|/)\.\.(/|$)' and new_path!~ '(^|/)\.\.(/|$)')
);
alter table public.private_file_rotation_jobs enable row level security;
alter table public.private_file_rotation_targets enable row level security;
revoke all on public.private_file_rotation_jobs,public.private_file_rotation_targets from public,anon,authenticated,service_role;
grant select on public.private_file_rotation_jobs,public.private_file_rotation_targets to service_role;

create function public.claim_private_file_rotation(_job uuid,_token_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.private_file_rotation_jobs%rowtype; targets jsonb;
begin
 if auth.role() is distinct from 'service_role' or _token_hash is null or _token_hash!~'^[a-f0-9]{64}$'
  then raise exception 'PRIVATE_ROTATION_FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('dentalflow-private-file-rotation',0));
 select * into j from public.private_file_rotation_jobs where id=_job for update;
 if j.id is null or j.status<>'prepared' or j.token_hash is distinct from _token_hash or j.expires_at<=now()
  or exists(select 1 from public.private_file_rotation_jobs where status='running' and lease_until>now())
  then raise exception 'PRIVATE_ROTATION_FORBIDDEN' using errcode='42501'; end if;
 if (select count(*) from public.private_file_rotation_targets where job_id=j.id) not between 1 and 40
  then raise exception 'PRIVATE_ROTATION_SCOPE_INVALID'; end if;
 update public.private_file_rotation_jobs set status='running',token_hash=null,claimed_at=now(),
  lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes' where id=j.id returning * into j;
 select jsonb_agg(to_jsonb(t) order by t.id) into targets from public.private_file_rotation_targets t where job_id=j.id;
 return jsonb_build_object('id',j.id,'lease_token',j.lease_token,'targets',targets);
end $$;

create function public.activate_private_file_rotation(_job uuid,_lease uuid,_target uuid,_hash text,_bytes bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.private_file_rotation_jobs%rowtype; t public.private_file_rotation_targets%rowtype;
 f public.storage_files%rowtype; current_reference text; stable_reference text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'PRIVATE_ROTATION_FORBIDDEN' using errcode='42501'; end if;
 select * into j from public.private_file_rotation_jobs where id=_job and status='running'
  and lease_token=_lease and lease_until>now() for update;
 if j.id is null then raise exception 'PRIVATE_ROTATION_LEASE_LOST'; end if;
 select * into t from public.private_file_rotation_targets where id=_target and job_id=j.id for update;
 if t.id is null or _hash is null or _hash!~'^[a-f0-9]{64}$' or _bytes is distinct from t.size_bytes
  then raise exception 'PRIVATE_ROTATION_PROOF_INVALID'; end if;
 stable_reference:='storage://'||t.bucket||'/'||t.new_path;
 if t.bucket='patient-photos' then
  select photo_url into current_reference from public.patients where id=t.subject_id for update;
 else select avatar_url into current_reference from public.profiles where id=t.subject_id for update; end if;
 if t.status in ('activated','verified') then
  if current_reference is distinct from stable_reference or t.content_hash is distinct from _hash
   then raise exception 'PRIVATE_ROTATION_REFERENCE_CHANGED'; end if;
  return true;
 end if;
 select * into f from public.storage_files where id=t.storage_file_id for update;
 if current_reference is distinct from t.old_reference or f.id is null or f.bucket is distinct from t.bucket
  or f.object_path is distinct from t.old_path or f.status is distinct from 'ready' or f.size_bytes is distinct from t.size_bytes
  or not exists(select 1 from storage.objects o where o.bucket_id=t.bucket and o.name=t.old_path
   and (o.metadata->>'size')::bigint=t.size_bytes)
  or not exists(select 1 from storage.objects o where o.bucket_id=t.bucket and o.name=t.new_path
   and (o.metadata->>'size')::bigint=t.size_bytes)
  then raise exception 'PRIVATE_ROTATION_REFERENCE_CHANGED'; end if;
 -- Only location/reference changes. Preserve the reservation ID, ownership,
 -- source linkage, size, totals, clinical fields and historical notification text.
 update public.storage_files set object_path=t.new_path where id=f.id;
 if t.bucket='patient-photos' then update public.patients set photo_url=stable_reference where id=t.subject_id;
 else update public.profiles set avatar_url=stable_reference where id=t.subject_id; end if;
 update public.private_file_rotation_targets set status='activated',content_hash=_hash,activated_at=now() where id=t.id;
 return true;
end $$;

create function public.verify_private_file_rotation(_job uuid,_lease uuid,_target uuid,_hash text,_old_http_status integer)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.private_file_rotation_jobs%rowtype; t public.private_file_rotation_targets%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'PRIVATE_ROTATION_FORBIDDEN' using errcode='42501'; end if;
 select * into j from public.private_file_rotation_jobs where id=_job and status='running'
  and lease_token=_lease and lease_until>now() for update;
 if j.id is null then raise exception 'PRIVATE_ROTATION_LEASE_LOST'; end if;
 select * into t from public.private_file_rotation_targets where id=_target and job_id=j.id for update;
 if t.id is null or t.status not in ('activated','verified') or t.content_hash is distinct from _hash
  or _old_http_status is null or _old_http_status not in (400,401,403,404,410)
  or exists(select 1 from storage.objects o where o.bucket_id=t.bucket and o.name=t.old_path)
  or not exists(select 1 from storage.objects o where o.bucket_id=t.bucket and o.name=t.new_path
   and (o.metadata->>'size')::bigint=t.size_bytes)
  then raise exception 'PRIVATE_ROTATION_REVOCATION_UNCONFIRMED'; end if;
 update public.private_file_rotation_targets set status='verified',verified_at=now(),old_http_status=_old_http_status where id=t.id;
 return true;
end $$;

create function public.finish_private_file_rotation(_job uuid,_lease uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare total integer; verified integer; v_receipt jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'PRIVATE_ROTATION_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.private_file_rotation_jobs where id=_job and status='running'
  and lease_token=_lease and lease_until>now() for update;
 if not found then raise exception 'PRIVATE_ROTATION_LEASE_LOST'; end if;
 select count(*),count(*) filter(where status='verified') into total,verified from public.private_file_rotation_targets where job_id=_job;
 v_receipt:=jsonb_build_object('contract','dentalflow-private-file-rotation-v1','passed',total>0 and verified=total,
  'total',total,'verified',verified,'checked_at',now());
 update public.private_file_rotation_jobs set status=case when total>0 and verified=total then 'completed' else 'review_required' end,
  completed_at=now(),receipt=v_receipt where id=_job;
 return v_receipt;
end $$;

-- Existing history can retain its original reference. Resolve the new location
-- only for a currently authorized reader; signing still uses normal Storage RLS.
create function public.resolve_rotated_private_file(_bucket text,_path text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare t public.private_file_rotation_targets%rowtype;
begin
 if auth.uid() is null or auth.role() is distinct from 'authenticated' then return null; end if;
 select * into t from public.private_file_rotation_targets where bucket=_bucket and old_path=_path and status in ('activated','verified');
 if t.id is null then return null; end if;
 if (t.bucket='patient-photos' and public.can_access_patient(t.subject_id)
    and exists(select 1 from public.patients where id=t.subject_id and photo_url='storage://'||t.bucket||'/'||t.new_path))
  or (t.bucket='avatars' and public.can_access_user_avatar(t.subject_id)
    and exists(select 1 from public.profiles where id=t.subject_id and avatar_url='storage://'||t.bucket||'/'||t.new_path))
  then return jsonb_build_object('bucket',t.bucket,'path',t.new_path); end if;
 return null;
end $$;
create function public.private_file_path_is_retired(_bucket text,_path text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.private_file_rotation_targets where bucket=_bucket and old_path=_path and status in ('activated','verified'));
$$;
-- Never allow a new object at a path for which a ten-year bearer was issued.
create policy private_file_retired_path_no_reuse on storage.objects as restrictive for insert to authenticated
 with check(not public.private_file_path_is_retired(bucket_id,name));
revoke all on function public.claim_private_file_rotation(uuid,text),public.activate_private_file_rotation(uuid,uuid,uuid,text,bigint),
 public.verify_private_file_rotation(uuid,uuid,uuid,text,integer),public.finish_private_file_rotation(uuid,uuid),
 public.resolve_rotated_private_file(text,text),public.private_file_path_is_retired(text,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_private_file_rotation(uuid,text),public.activate_private_file_rotation(uuid,uuid,uuid,text,bigint),
 public.verify_private_file_rotation(uuid,uuid,uuid,text,integer),public.finish_private_file_rotation(uuid,uuid) to service_role;
grant execute on function public.resolve_rotated_private_file(text,text) to authenticated;
grant execute on function public.private_file_path_is_retired(text,text) to authenticated,service_role;

-- A running, fixed-identity Storage QA job may rotate only its own disposable
-- avatar. This is setup for a real USER session test, never a role promotion.
create function public.prepare_fixture_private_file_rotation(_fixture_job uuid,_subject uuid,_signed_url text,_token_hash text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare f public.storage_files%rowtype; p public.profiles%rowtype;
 job uuid:=gen_random_uuid(); target uuid:=gen_random_uuid(); old_path text;
begin
 if auth.role() is distinct from 'service_role' or _token_hash is null or _token_hash!~'^[a-f0-9]{64}$'
  or not exists(select 1 from public.saas_fixture_acceptance_jobs where id=_fixture_job and kind='storage'
   and status='running' and claimed_at>now()-interval '20 minutes')
  or _subject not in ('ee083f63-1621-4b82-b7a4-fd13427c0b14'::uuid,'24e7cdf9-457e-4af2-b1cb-cf366abbddb0'::uuid)
  then raise exception 'PRIVATE_ROTATION_FIXTURE_FORBIDDEN' using errcode='42501'; end if;
 select * into p from public.profiles where id=_subject for update;
 old_path:=_subject::text||'/qa-'||_fixture_job::text||'.png';
 select * into f from public.storage_files where bucket='avatars' and object_path=old_path and status='ready'
  and uploaded_by=_subject and source_id=_subject::text and clinic_id=p.clinic_id for update;
 if f.id is null or p.avatar_url is distinct from 'storage://avatars/'||old_path
  or p.clinic_id not in ('081d3db4-1606-40f7-a878-19b51556317d'::uuid,'3fc86c40-697e-4725-a9e9-633fc882aadc'::uuid)
  or exists(select 1 from public.platform_operators where user_id=_subject)
  then raise exception 'PRIVATE_ROTATION_FIXTURE_FORBIDDEN' using errcode='42501'; end if;
 insert into public.private_file_rotation_jobs(id,token_hash,expires_at,authorization_note)
  values(job,_token_hash,now()+interval '15 minutes','Authorized fixed Storage QA avatar rotation');
 insert into public.private_file_rotation_targets(id,job_id,bucket,subject_id,old_path,new_path,old_reference,old_signed_url,storage_file_id,size_bytes)
  values(target,job,'avatars',_subject,old_path,_subject::text||'/private-'||target::text||'.png',p.avatar_url,_signed_url,f.id,f.size_bytes);
 return job;
end $$;
revoke all on function public.prepare_fixture_private_file_rotation(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_fixture_private_file_rotation(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';

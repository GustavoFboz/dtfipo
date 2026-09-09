-- DentalFlow 0.3.5 — team realtime consistency, server-side notifications and per-member session grants.
-- Additive / backwards-compatible. Existing members keep every currently active company session until an admin restricts them.

create table if not exists public.company_member_sessions (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null check (session_type in ('laboratory','clinic','radiology')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id,user_id,session_type)
);
create index if not exists company_member_sessions_user_idx on public.company_member_sessions(user_id,clinic_id);
alter table public.company_member_sessions enable row level security;
grant select on public.company_member_sessions to authenticated;
grant all on public.company_member_sessions to service_role;

create or replace function public.company_user_is_manager_v035(_clinic_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path=public as $$
  select _user_id is not null and (
    exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=_user_id)
    or exists(
      select 1 from public.clinic_members m
      where m.clinic_id=_clinic_id and m.user_id=_user_id
        and m.status in ('active','accepted') and upper(coalesce(m.role,'')) in ('CEO','ADMIN')
    )
    or exists(
      select 1 from public.profiles p
      where p.id=_user_id and p.clinic_id=_clinic_id and coalesce(p.is_default_admin,false)
    )
  )
$$;
revoke all on function public.company_user_is_manager_v035(uuid,uuid) from public,anon;
grant execute on function public.company_user_is_manager_v035(uuid,uuid) to authenticated,service_role;

-- Current production users must not lose access during the migration.
insert into public.company_member_sessions(clinic_id,user_id,session_type,granted_by)
select m.clinic_id,m.user_id,s.session_type,c.owner_id
from public.clinic_members m
join public.company_sessions s on s.clinic_id=m.clinic_id and s.status='active'
join public.clinics c on c.id=m.clinic_id
where m.status in ('active','accepted')
on conflict (clinic_id,user_id,session_type) do nothing;

-- A new team member starts with the company's active sessions (legacy-compatible);
-- an administrator can then narrow those grants from Team settings.
create or replace function public.df_default_member_sessions_v035()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('active','accepted') then
    insert into public.company_member_sessions(clinic_id,user_id,session_type,granted_by)
    select new.clinic_id,new.user_id,s.session_type,coalesce(new.invited_by,(select owner_id from public.clinics where id=new.clinic_id))
    from public.company_sessions s
    where s.clinic_id=new.clinic_id and s.status='active'
    on conflict (clinic_id,user_id,session_type) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_default_member_sessions_v035 on public.clinic_members;
create trigger trg_default_member_sessions_v035
after insert or update of status on public.clinic_members
for each row execute function public.df_default_member_sessions_v035();

create or replace function public.df_default_grants_for_company_session_v035()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='active' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.company_member_sessions(clinic_id,user_id,session_type,granted_by)
    select new.clinic_id,m.user_id,new.session_type,(select owner_id from public.clinics where id=new.clinic_id)
    from public.clinic_members m
    where m.clinic_id=new.clinic_id and m.status in ('active','accepted')
    on conflict (clinic_id,user_id,session_type) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_default_grants_for_company_session_v035 on public.company_sessions;
create trigger trg_default_grants_for_company_session_v035
after insert or update of status on public.company_sessions
for each row execute function public.df_default_grants_for_company_session_v035();

-- Founder/owner is immutable as primary administrator at the membership layer.
create or replace function public.df_protect_company_founder_v035()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.clinics where id=coalesce(new.clinic_id,old.clinic_id);
  if old.user_id=v_owner then
    if tg_op='DELETE' then raise exception 'O administrador fundador não pode ser removido.'; end if;
    if new.user_id is distinct from old.user_id or new.clinic_id is distinct from old.clinic_id
       or new.status not in ('active','accepted') or upper(coalesce(new.role,'')) not in ('CEO','ADMIN') then
      raise exception 'O administrador fundador deve permanecer ativo e com acesso administrativo.';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists trg_protect_company_founder_v035 on public.clinic_members;
create trigger trg_protect_company_founder_v035
before update or delete on public.clinic_members
for each row execute function public.df_protect_company_founder_v035();

-- Own grants can be read; managers can audit the entire company. Writes stay behind RPCs.
drop policy if exists company_member_sessions_read_v035 on public.company_member_sessions;
create policy company_member_sessions_read_v035 on public.company_member_sessions
for select to authenticated using (
  user_id=auth.uid() or public.company_user_is_manager_v035(clinic_id,auth.uid())
);

create or replace function public.user_can_use_company_session(_clinic_id uuid, _session_type text)
returns boolean
language sql stable security definer set search_path=public as $$
  select public.company_has_operational_access(_clinic_id)
    and exists(
      select 1 from public.company_sessions s
      where s.clinic_id=_clinic_id and s.session_type=lower(_session_type) and s.status='active'
    )
    and (
      exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or exists(
        select 1 from public.company_member_sessions g
        join public.clinic_members m on m.clinic_id=g.clinic_id and m.user_id=g.user_id
        where g.clinic_id=_clinic_id and g.user_id=auth.uid() and g.session_type=lower(_session_type)
          and m.status in ('active','accepted')
      )
    )
$$;
revoke all on function public.user_can_use_company_session(uuid,text) from public,anon;
grant execute on function public.user_can_use_company_session(uuid,text) to authenticated,service_role;

create or replace function public.company_team_access_v035()
returns table(
  user_id uuid, full_name text, email text, member_role text, profession_type text,
  status text, is_founder boolean, is_admin boolean, sessions text[]
)
language plpgsql stable security definer set search_path=public as $$
declare cid uuid;
begin
  select p.clinic_id into cid from public.profiles p where p.id=auth.uid();
  if cid is null or not public.company_user_is_manager_v035(cid,auth.uid()) then
    raise exception 'Sem permissão para gerenciar a equipe.';
  end if;
  return query
  select p.id,p.full_name,p.email,m.role,coalesce(p.profession_type,p.account_subtype,p.role),m.status,
    (c.owner_id=p.id), public.company_user_is_manager_v035(cid,p.id),
    case when c.owner_id=p.id then
      coalesce((select array_agg(s.session_type order by s.session_type) from public.company_sessions s where s.clinic_id=cid and s.status='active'),'{}'::text[])
    else coalesce((select array_agg(g.session_type order by g.session_type) from public.company_member_sessions g where g.clinic_id=cid and g.user_id=p.id),'{}'::text[]) end
  from public.clinic_members m
  join public.profiles p on p.id=m.user_id
  join public.clinics c on c.id=m.clinic_id
  where m.clinic_id=cid and m.status in ('active','accepted')
  order by (c.owner_id=p.id) desc,p.full_name nulls last,p.email;
end $$;
revoke all on function public.company_team_access_v035() from public,anon;
grant execute on function public.company_team_access_v035() to authenticated;

create or replace function public.company_set_member_sessions_v035(_member_user_id uuid, _sessions text[])
returns text[]
language plpgsql security definer set search_path=public as $$
declare cid uuid; owner_uid uuid; cleaned text[];
begin
  select p.clinic_id into cid from public.profiles p where p.id=auth.uid();
  if cid is null or not public.company_user_is_manager_v035(cid,auth.uid()) then raise exception 'Sem permissão para alterar acessos.'; end if;
  select c.owner_id into owner_uid from public.clinics c where c.id=cid;
  if _member_user_id=owner_uid then raise exception 'O administrador fundador sempre possui acesso a todas as sessões.'; end if;
  if not exists(select 1 from public.clinic_members m where m.clinic_id=cid and m.user_id=_member_user_id and m.status in ('active','accepted')) then
    raise exception 'Membro ativo não encontrado.';
  end if;
  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into cleaned
  from unnest(coalesce(_sessions,'{}'::text[])) x
  where lower(x) in ('laboratory','clinic','radiology')
    and exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type=lower(x) and s.status='active');
  delete from public.company_member_sessions where clinic_id=cid and user_id=_member_user_id;
  insert into public.company_member_sessions(clinic_id,user_id,session_type,granted_by)
  select cid,_member_user_id,x,auth.uid() from unnest(cleaned) x
  on conflict do nothing;
  return cleaned;
end $$;
revoke all on function public.company_set_member_sessions_v035(uuid,text[]) from public,anon;
grant execute on function public.company_set_member_sessions_v035(uuid,text[]) to authenticated;

create or replace function public.company_set_member_admin_v035(_member_user_id uuid, _is_admin boolean)
returns boolean
language plpgsql security definer set search_path=public as $$
declare cid uuid; owner_uid uuid;
begin
  select p.clinic_id into cid from public.profiles p where p.id=auth.uid();
  if cid is null or not public.company_user_is_manager_v035(cid,auth.uid()) then raise exception 'Sem permissão para alterar administradores.'; end if;
  select c.owner_id into owner_uid from public.clinics c where c.id=cid;
  if _member_user_id=owner_uid then
    if not _is_admin then raise exception 'O administrador fundador não pode ser rebaixado.'; end if;
    return true;
  end if;
  update public.clinic_members
    set role=case when _is_admin then 'ADMIN' else coalesce(nullif((select p.account_subtype from public.profiles p where p.id=_member_user_id),''),nullif((select p.profession_type from public.profiles p where p.id=_member_user_id),''),nullif(role,'ADMIN'),'USER') end,
        updated_at=now()
  where clinic_id=cid and user_id=_member_user_id and status in ('active','accepted');
  if not found then raise exception 'Membro ativo não encontrado.'; end if;
  return _is_admin;
end $$;
revoke all on function public.company_set_member_admin_v035(uuid,boolean) from public,anon;
grant execute on function public.company_set_member_admin_v035(uuid,boolean) to authenticated;

-- ---------- Authoritative recipient resolver / notification creation ----------
create or replace function public.case_notification_recipients_v035(_case_id uuid, _actor uuid default auth.uid())
returns table(user_id uuid)
language sql stable security definer set search_path=public as $$
  with actor_ctx as (
    select p.clinic_id from public.profiles p where p.id=_actor
  ), base as (
    select c.requested_by as uid from public.cases c where c.id=_case_id
    union select c.accepted_by from public.cases c where c.id=_case_id
    union select cd.user_id from public.cases c join public.cadistas cd on cd.id=c.cadista_id where c.id=_case_id
    union select d.user_id from public.cases c join public.doctors d on d.id=c.doctor_id where c.id=_case_id
    union select cp.user_id from public.case_participants cp where cp.case_id=_case_id and cp.left_at is null
    union select cl.owner_id from actor_ctx a join public.clinics cl on cl.id=a.clinic_id
    union select m.user_id from actor_ctx a join public.clinic_members m on m.clinic_id=a.clinic_id
      where m.status in ('active','accepted') and upper(coalesce(m.role,'')) in ('CEO','ADMIN')
    union select p.id from actor_ctx a join public.profiles p on p.clinic_id=a.clinic_id
      where coalesce(p.is_default_admin,false) or upper(coalesce(p.account_subtype,p.role,'')) in ('CEO','ADMIN')
  )
  select distinct b.uid from base b
  where b.uid is not null and b.uid is distinct from _actor
$$;
revoke all on function public.case_notification_recipients_v035(uuid,uuid) from public,anon;
grant execute on function public.case_notification_recipients_v035(uuid,uuid) to authenticated,service_role;

create unique index if not exists notifications_event_key_recipient_v035
on public.notifications(recipient_id,type,(metadata->>'event_key'))
where metadata ? 'event_key' and nullif(metadata->>'event_key','') is not null;

create or replace function public.notify_case_stakeholders_v035(
  _case_id uuid,
  _title text,
  _content text,
  _type text default 'case',
  _activity_id uuid default null,
  _event_key text default null,
  _extra_recipient_ids uuid[] default null
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid(); cid uuid; sender_name text; sender_avatar text; case_label text;
  key text:=coalesce(nullif(trim(_event_key),''),case when _activity_id is not null then 'activity:'||_activity_id::text else null end);
  inserted_count integer:=0;
begin
  if actor is null then raise exception 'Sessão inválida.'; end if;
  if not public.can_access_case(_case_id) then raise exception 'Sem acesso ao caso.'; end if;
  select p.clinic_id,p.full_name,p.avatar_url into cid,sender_name,sender_avatar from public.profiles p where p.id=actor;
  if cid is null then raise exception 'Empresa não encontrada.'; end if;
  select coalesce(c.case_label,pt.name) into case_label from public.cases c left join public.patients pt on pt.id=c.patient_id where c.id=_case_id;

  with recipients as (
    select r.user_id from public.case_notification_recipients_v035(_case_id,actor) r
    union
    select p.id from unnest(coalesce(_extra_recipient_ids,'{}'::uuid[])) x(id)
      join public.profiles p on p.id=x.id and p.clinic_id=cid
      where exists(select 1 from public.clinic_members m where m.clinic_id=cid and m.user_id=p.id and m.status in ('active','accepted'))
  ), ins as (
    insert into public.notifications(id,sender_id,recipient_id,title,content,type,metadata,read_at,created_at)
    select gen_random_uuid(),actor,r.user_id,coalesce(nullif(_title,''),'DentalFlow'),coalesce(_content,''),coalesce(nullif(_type,''),'case'),
      jsonb_build_object('case_id',_case_id,'activity_id',_activity_id,'event_key',key,'sender_name',sender_name,'sender_avatar',sender_avatar,'case_label',case_label),null,now()
    from recipients r
    where r.user_id is distinct from actor
      and not exists(
        select 1 from public.notifications n
        where n.recipient_id=r.user_id and n.sender_id=actor and n.type=coalesce(nullif(_type,''),'case')
          and n.metadata->>'case_id'=_case_id::text
          and n.content=coalesce(_content,'') and n.created_at>now()-interval '5 seconds'
      )
    on conflict do nothing
    returning 1
  ) select count(*) into inserted_count from ins;
  return inserted_count;
end $$;
revoke all on function public.notify_case_stakeholders_v035(uuid,text,text,text,uuid,text,uuid[]) from public,anon;
grant execute on function public.notify_case_stakeholders_v035(uuid,text,text,text,uuid,text,uuid[]) to authenticated;

-- Trigger fallback: a saved comment must create notifications even if the browser/client dies immediately after INSERT.
create or replace function public.df_notify_case_activity_v035()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid:=coalesce(new.user_id,new.actor_id); r record; key text:='activity:'||new.id::text; label text; sender_name text; sender_avatar text;
begin
  if lower(coalesce(new.kind,'')) not in ('comment','message') then return new; end if;
  select coalesce(c.case_label,p.name) into label from public.cases c left join public.patients p on p.id=c.patient_id where c.id=new.case_id;
  select p.full_name,p.avatar_url into sender_name,sender_avatar from public.profiles p where p.id=actor;
  for r in select user_id from public.case_notification_recipients_v035(new.case_id,actor) loop
    insert into public.notifications(id,sender_id,recipient_id,title,content,type,metadata,created_at)
    values(gen_random_uuid(),actor,r.user_id,'Novo comentário no caso',coalesce(new.content,new.message,''),'comment',
      jsonb_build_object('case_id',new.case_id,'activity_id',new.id,'event_key',key,'sender_name',sender_name,'sender_avatar',sender_avatar,'case_label',label),now())
    on conflict do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists trg_notify_case_activity_v035 on public.case_activity;
create trigger trg_notify_case_activity_v035 after insert on public.case_activity
for each row execute function public.df_notify_case_activity_v035();

create or replace function public.df_notify_case_attachment_v035()
returns trigger language plpgsql security definer set search_path=public as $$
declare a public.case_attachments%rowtype; actor uuid; r record; evt text; title text; body text; label text; sender_name text; sender_avatar text;
begin
  a:=case when tg_op='DELETE' then old else new end;
  actor:=coalesce(auth.uid(),a.uploaded_by);
  if actor is null then return case when tg_op='DELETE' then old else new end; end if;
  evt:='attachment:'||a.id::text||':'||lower(tg_op);
  title:=case when tg_op='DELETE' then 'Arquivo removido' else 'Novo arquivo no caso' end;
  body:=case when tg_op='DELETE' then 'O arquivo "'||coalesce(a.file_name,'arquivo')||'" foi removido do caso.' else 'O arquivo "'||coalesce(a.file_name,'arquivo')||'" foi adicionado ao caso.' end;
  select coalesce(c.case_label,p.name) into label from public.cases c left join public.patients p on p.id=c.patient_id where c.id=a.case_id;
  select p.full_name,p.avatar_url into sender_name,sender_avatar from public.profiles p where p.id=actor;
  for r in select user_id from public.case_notification_recipients_v035(a.case_id,actor) loop
    insert into public.notifications(id,sender_id,recipient_id,title,content,type,metadata,created_at)
    values(gen_random_uuid(),actor,r.user_id,title,body,'attachment',jsonb_build_object('case_id',a.case_id,'attachment_id',a.id,'event_key',evt,'sender_name',sender_name,'sender_avatar',sender_avatar,'case_label',label),now())
    on conflict do nothing;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists trg_notify_case_attachment_v035 on public.case_attachments;
create trigger trg_notify_case_attachment_v035 after insert or delete on public.case_attachments
for each row execute function public.df_notify_case_attachment_v035();

create or replace function public.df_notify_case_progress_v035()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); r record; evt text; body text; label text; sender_name text; sender_avatar text;
begin
  if actor is null then return new; end if;
  if new.status is not distinct from old.status and new.current_stage_id is not distinct from old.current_stage_id then return new; end if;
  evt:='case-progress:'||new.id::text||':'||coalesce(new.updated_at::text,clock_timestamp()::text);
  body:=case when new.status is distinct from old.status then 'Status atualizado para '||coalesce(new.status,'—')||'.' else 'Etapa do caso atualizada.' end;
  select coalesce(new.case_label,p.name) into label from public.patients p where p.id=new.patient_id;
  select p.full_name,p.avatar_url into sender_name,sender_avatar from public.profiles p where p.id=actor;
  for r in select user_id from public.case_notification_recipients_v035(new.id,actor) loop
    insert into public.notifications(id,sender_id,recipient_id,title,content,type,metadata,created_at)
    values(gen_random_uuid(),actor,r.user_id,'Caso atualizado',body,'case_update',jsonb_build_object('case_id',new.id,'event_key',evt,'sender_name',sender_name,'sender_avatar',sender_avatar,'case_label',label),now())
    on conflict do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists trg_notify_case_progress_v035 on public.cases;
create trigger trg_notify_case_progress_v035 after update of status,current_stage_id on public.cases
for each row execute function public.df_notify_case_progress_v035();

-- DELETE/UPDATE payloads need complete old rows for deterministic cache reconciliation.
alter table public.case_activity replica identity full;
alter table public.case_attachments replica identity full;
alter table public.cases replica identity full;
alter table public.notifications replica identity full;
alter table public.clinic_members replica identity full;
alter table public.company_sessions replica identity full;

-- Realtime publication membership is idempotent across environments.
do $$
declare t text;
begin
  foreach t in array array['cases','case_activity','case_attachments','notifications','clinic_members','company_sessions','company_member_sessions'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

-- DentalFlow 0.3.5 — tighten helper visibility and expose only a validated mention RPC.

revoke all on function public.case_notification_recipients_v035(uuid,uuid) from public,anon,authenticated;
grant execute on function public.case_notification_recipients_v035(uuid,uuid) to service_role;

create or replace function public.case_mentionable_profiles_v035(
  _case_id uuid,
  _query text default '',
  _limit integer default 8
) returns table(id uuid, full_name text, email text, role text)
language plpgsql stable security definer set search_path=public as $$
declare actor uuid:=auth.uid(); cid uuid; lim integer:=greatest(1,least(coalesce(_limit,8),20)); q text:=trim(coalesce(_query,''));
begin
  if actor is null then raise exception 'Sessão inválida.'; end if;
  if not public.can_access_case(_case_id) then raise exception 'Sem acesso ao caso.'; end if;
  select p.clinic_id into cid from public.profiles p where p.id=actor;
  if cid is null then return; end if;

  return query
  with eligible as (
    select r.user_id from public.case_notification_recipients_v035(_case_id,actor) r
    union select actor
  )
  select p.id,p.full_name,p.email,p.role::text
  from eligible e
  join public.profiles p on p.id=e.user_id and p.clinic_id=cid
  where q='' or coalesce(p.full_name,'') ilike '%'||q||'%' or coalesce(p.email,'') ilike '%'||q||'%'
  order by coalesce(p.full_name,p.email,'')
  limit lim;
end $$;
revoke all on function public.case_mentionable_profiles_v035(uuid,text,integer) from public,anon;
grant execute on function public.case_mentionable_profiles_v035(uuid,text,integer) to authenticated;

-- Ensure the public notification RPC is the only client-facing path that can
-- invoke the internal recipient resolver. It still validates can_access_case().
revoke all on function public.notify_case_stakeholders_v035(uuid,text,text,text,uuid,text,uuid[]) from public,anon;
grant execute on function public.notify_case_stakeholders_v035(uuid,text,text,text,uuid,text,uuid[]) to authenticated;

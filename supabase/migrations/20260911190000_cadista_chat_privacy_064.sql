-- DentalFlow 0.6.4
-- Enforce CAD zero-knowledge chat history at the database boundary.
-- A CAD assigned after another CAD may only read activity created from the
-- beginning of the current assignment onward. Admins and non-CAD authorized
-- participants keep their existing case access.

create or replace function public.case_cadista_assignment_started_at(
  _case_id uuid,
  _user_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ca.created_at
  from public.case_activity ca
  join public.cases c on c.id = _case_id
  join public.cadistas current_cd on current_cd.id = c.cadista_id
  where ca.case_id = _case_id
    and current_cd.user_id = _user_id
    and coalesce(ca.metadata ->> 'event_key', '') = 'case_cadista_reassigned'
    and coalesce(ca.metadata ->> 'cadista_user_id', '') = _user_id::text
  order by ca.created_at desc
  limit 1
$$;

create or replace function public.case_activity_visible_to_user(
  _case_id uuid,
  _created_at timestamptz,
  _user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_case(_case_id)
    and (
      public.current_user_is_admin()
      or not exists (
        select 1
        from public.cases c
        join public.cadistas cd on cd.id = c.cadista_id
        where c.id = _case_id
          and cd.user_id = _user_id
      )
      or (
        public.case_cadista_assignment_started_at(_case_id, _user_id) is not null
        and _created_at >= public.case_cadista_assignment_started_at(_case_id, _user_id)
      )
    )
$$;

alter table public.case_activity enable row level security;

drop policy if exists case_activity_select_v064 on public.case_activity;
create policy case_activity_select_v064
  on public.case_activity
  for select
  using (public.case_activity_visible_to_user(case_id, created_at, auth.uid()));

comment on function public.case_activity_visible_to_user(uuid,timestamptz,uuid)
is '0.6.4: CADs see case activity only from the start of their current assignment; fail closed when no assignment boundary exists.';

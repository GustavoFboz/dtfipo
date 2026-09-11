-- DentalFlow 0.6.4
-- Enforce CAD assignment-window privacy at the database boundary.
-- A CAD assigned after prior work on a case must not receive historical chat/activity.

create table if not exists public.case_cadista_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  cadista_id uuid not null references public.cadistas(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.case_cadista_assignments enable row level security;

create index if not exists idx_case_cadista_assignments_case
  on public.case_cadista_assignments(case_id, started_at desc);
create index if not exists idx_case_cadista_assignments_cadista
  on public.case_cadista_assignments(cadista_id, started_at desc);
create unique index if not exists uq_case_cadista_assignments_active
  on public.case_cadista_assignments(case_id)
  where ended_at is null;

-- Backfill only the current assignment. When a historical case_edit contains the
-- assignment switch, use its timestamp. Otherwise the case creation timestamp is
-- the safest backwards-compatible lower bound for an original assignment.
insert into public.case_cadista_assignments(case_id, cadista_id, started_at, ended_at)
select
  c.id,
  c.cadista_id,
  coalesce((
    select max(a.created_at)
    from public.case_activity a
    cross join lateral jsonb_array_elements(coalesce(a.metadata->'changes', '[]'::jsonb)) change
    where a.case_id = c.id
      and a.kind = 'case_edit'
      and change->>'field' = 'cadista_id'
      and change->>'to' = c.cadista_id::text
  ), c.created_at),
  null
from public.cases c
where c.cadista_id is not null
  and not exists (
    select 1
    from public.case_cadista_assignments existing
    where existing.case_id = c.id and existing.ended_at is null
  );

create or replace function public.track_case_cadista_assignment_v064()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.cadista_id is distinct from old.cadista_id then
    update public.case_cadista_assignments
      set ended_at = now()
      where case_id = new.id and ended_at is null;

    if new.cadista_id is not null then
      insert into public.case_cadista_assignments(case_id, cadista_id, started_at)
      values (new.id, new.cadista_id, now());
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.track_case_cadista_assignment_v064() from public;

drop trigger if exists trg_track_case_cadista_assignment_v064 on public.cases;
create trigger trg_track_case_cadista_assignment_v064
after update of cadista_id on public.cases
for each row execute function public.track_case_cadista_assignment_v064();

create or replace function public.case_cadista_assignment_started_at(
  _case_id uuid,
  _user_id uuid default auth.uid()
)
returns timestamptz
language sql
stable
security definer
set search_path = 'public'
as $$
  select assignment.started_at
  from public.case_cadista_assignments assignment
  join public.cadistas cadista on cadista.id = assignment.cadista_id
  where assignment.case_id = _case_id
    and assignment.ended_at is null
    and cadista.user_id = _user_id
  order by assignment.started_at desc
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
set search_path = 'public'
as $$
  select public.can_access_case(_case_id)
    and (
      public.current_user_is_admin()
      or not exists (
        select 1
        from public.cases c
        join public.cadistas cadista on cadista.id = c.cadista_id
        where c.id = _case_id
          and cadista.user_id = _user_id
      )
      or _created_at >= coalesce(
        public.case_cadista_assignment_started_at(_case_id, _user_id),
        'infinity'::timestamptz
      )
    )
$$;

revoke all on function public.case_cadista_assignment_started_at(uuid, uuid) from public;
revoke all on function public.case_activity_visible_to_user(uuid, timestamptz, uuid) from public;
grant execute on function public.case_cadista_assignment_started_at(uuid, uuid) to authenticated;
grant execute on function public.case_activity_visible_to_user(uuid, timestamptz, uuid) to authenticated;

-- Replace the former all-purpose policy. SELECT is now assignment-window aware;
-- writes retain the existing case-access contract and only allow users to mutate
-- their own activity unless they are an administrator.
drop policy if exists case_activity_access on public.case_activity;
drop policy if exists case_activity_select_v064 on public.case_activity;
drop policy if exists case_activity_insert_v064 on public.case_activity;
drop policy if exists case_activity_update_v064 on public.case_activity;
drop policy if exists case_activity_delete_v064 on public.case_activity;

create policy case_activity_select_v064
on public.case_activity
for select
to authenticated
using (public.case_activity_visible_to_user(case_id, created_at, auth.uid()));

create policy case_activity_insert_v064
on public.case_activity
for insert
to authenticated
with check (public.can_access_case(case_id) and user_id = auth.uid());

create policy case_activity_update_v064
on public.case_activity
for update
to authenticated
using (public.can_access_case(case_id) and (user_id = auth.uid() or public.current_user_is_admin()))
with check (public.can_access_case(case_id) and (user_id = auth.uid() or public.current_user_is_admin()));

create policy case_activity_delete_v064
on public.case_activity
for delete
to authenticated
using (public.can_access_case(case_id) and (user_id = auth.uid() or public.current_user_is_admin()));

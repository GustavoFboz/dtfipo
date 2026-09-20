-- DentalFlow SaaS — Stage 01 recovery prerequisites.
-- Repairs legacy restore snapshots without importing user-specific historical SQL.

create table if not exists public.proteticos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.proteticos enable row level security;

drop policy if exists proteticos_authenticated_read on public.proteticos;
create policy proteticos_authenticated_read
on public.proteticos for select to authenticated
using (true);

grant select, insert, update, delete on public.proteticos to authenticated;
grant all on public.proteticos to service_role;

alter table public.doctors add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.cadistas add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.cases add column if not exists requested_by uuid references auth.users(id) on delete set null;

create unique index if not exists doctors_user_id_uidx
  on public.doctors(user_id) where user_id is not null;
create unique index if not exists cadistas_user_id_uidx
  on public.cadistas(user_id) where user_id is not null;

create or replace function public.is_clinic_member(_clinic_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _user_id is not null and (
    exists (
      select 1 from public.clinics c
      where c.id = _clinic_id and c.owner_id = _user_id
    )
    or exists (
      select 1 from public.clinic_members m
      where m.clinic_id = _clinic_id
        and m.user_id = _user_id
        and m.status in ('active','accepted')
    )
  )
$$;

revoke all on function public.is_clinic_member(uuid,uuid) from public, anon;
grant execute on function public.is_clinic_member(uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

begin;

alter table public.patients
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists age integer not null default 0,
  add column if not exists birth_date date,
  add column if not exists gender text,
  add column if not exists cpf text,
  add column if not exists rg text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists medical_history text,
  add column if not exists allergies text,
  add column if not exists medications text,
  add column if not exists clinical_notes text;

create table if not exists public.clinic_patient_evolutions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  appointment_id uuid references public.clinic_appointments(id) on delete set null,
  teeth_numbers integer[] not null default '{}'::integer[],
  procedure text,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinic_patient_evolutions_patient_created_idx
  on public.clinic_patient_evolutions(patient_id, created_at desc);
create index if not exists clinic_patient_evolutions_clinic_created_idx
  on public.clinic_patient_evolutions(clinic_id, created_at desc);

alter table public.clinic_patient_evolutions enable row level security;

drop policy if exists clinic_patient_evolutions_select on public.clinic_patient_evolutions;
create policy clinic_patient_evolutions_select
  on public.clinic_patient_evolutions
  for select
  using (
    public.clinical_permission_allowed(clinic_id, 'clinical.patients')
    and public.can_access_patient(patient_id)
  );

drop policy if exists clinic_patient_evolutions_insert on public.clinic_patient_evolutions;
create policy clinic_patient_evolutions_insert
  on public.clinic_patient_evolutions
  for insert
  with check (
    public.clinical_permission_allowed(clinic_id, 'clinical.patients')
    and public.can_access_patient(patient_id)
    and (author_id is null or author_id = auth.uid())
  );

drop policy if exists clinic_patient_evolutions_update on public.clinic_patient_evolutions;
create policy clinic_patient_evolutions_update
  on public.clinic_patient_evolutions
  for update
  using (
    public.clinical_permission_allowed(clinic_id, 'clinical.patients')
    and public.can_access_patient(patient_id)
  )
  with check (
    public.clinical_permission_allowed(clinic_id, 'clinical.patients')
    and public.can_access_patient(patient_id)
  );

drop policy if exists clinic_patient_evolutions_delete on public.clinic_patient_evolutions;
create policy clinic_patient_evolutions_delete
  on public.clinic_patient_evolutions
  for delete
  using (
    public.clinical_permission_allowed(clinic_id, 'clinical.patients')
    and public.can_access_patient(patient_id)
  );

commit;

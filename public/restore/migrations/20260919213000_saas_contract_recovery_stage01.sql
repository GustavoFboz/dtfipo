-- DentalFlow SaaS — Stage 01: canonical billing contract and provider identity.
--
-- This migration does not contact Asaas and does not activate subscriptions.
-- It prepares an environment-aware, idempotent contract for the provider adapter.

alter table public.account_subscriptions
  add column if not exists provider_environment text,
  add column if not exists billing_cycle text not null default 'MONTHLY';

alter table public.checkout_intents
  add column if not exists provider_environment text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_payment_url text;

alter table public.billing_payments
  add column if not exists provider_environment text;

alter table public.billing_events
  add column if not exists provider_environment text;

-- Existing records predate the environment namespace. The only provider-backed
-- flow before this migration was the controlled sandbox; IPO uses an internal
-- override. No record is promoted to Production by inference.
update public.account_subscriptions
set provider_environment = case
  when billing_provider = 'internal_override' then 'internal'
  else 'sandbox'
end
where provider_environment is null
  and billing_provider is not null
  and (external_customer_id is not null or external_subscription_id is not null);

update public.checkout_intents
set provider_environment = case
  when billing_provider = 'internal_override' then 'internal'
  else 'sandbox'
end
where provider_environment is null
  and billing_provider is not null
  and (provider_checkout_id is not null or provider_payment_id is not null);

update public.billing_payments
set provider_environment = case
  when provider = 'internal_override' then 'internal'
  else 'sandbox'
end
where provider_environment is null
  and provider is not null
  and provider_payment_id is not null;

update public.billing_events
set provider_environment = case
  when provider = 'internal_override' then 'internal'
  else 'sandbox'
end
where provider_environment is null;

alter table public.billing_events
  alter column provider_environment drop default,
  alter column provider_environment set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_subscriptions'::regclass
      and conname = 'account_subscriptions_provider_environment_check'
  ) then
    alter table public.account_subscriptions
      add constraint account_subscriptions_provider_environment_check
      check (provider_environment is null or provider_environment in ('sandbox','production','internal'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_subscriptions'::regclass
      and conname = 'account_subscriptions_billing_cycle_check'
  ) then
    alter table public.account_subscriptions
      add constraint account_subscriptions_billing_cycle_check
      check (billing_cycle = 'MONTHLY');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_subscriptions'::regclass
      and conname = 'account_subscriptions_external_identity_check'
  ) then
    alter table public.account_subscriptions
      add constraint account_subscriptions_external_identity_check
      check (
        (external_customer_id is null and external_subscription_id is null)
        or (billing_provider is not null and provider_environment is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checkout_intents'::regclass
      and conname = 'checkout_intents_provider_environment_check'
  ) then
    alter table public.checkout_intents
      add constraint checkout_intents_provider_environment_check
      check (provider_environment is null or provider_environment in ('sandbox','production','internal'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checkout_intents'::regclass
      and conname = 'checkout_intents_external_identity_check'
  ) then
    alter table public.checkout_intents
      add constraint checkout_intents_external_identity_check
      check (
        (provider_checkout_id is null and provider_payment_id is null and provider_payment_url is null)
        or (billing_provider is not null and provider_environment is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_payments'::regclass
      and conname = 'billing_payments_provider_environment_check'
  ) then
    alter table public.billing_payments
      add constraint billing_payments_provider_environment_check
      check (provider_environment is null or provider_environment in ('sandbox','production','internal'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_payments'::regclass
      and conname = 'billing_payments_external_identity_check'
  ) then
    alter table public.billing_payments
      add constraint billing_payments_external_identity_check
      check (
        provider_payment_id is null
        or (provider is not null and provider_environment is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_events'::regclass
      and conname = 'billing_events_provider_environment_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_provider_environment_check
      check (provider_environment in ('sandbox','production','internal'));
  end if;
end $$;

-- Provider IDs are namespaced by provider + environment. Customer IDs are not
-- unique on subscriptions because a company may have multiple historical
-- subscriptions attached to the same canonical Asaas customer.
alter table public.billing_events
  drop constraint if exists billing_events_provider_provider_event_id_key;

alter table public.billing_payments
  drop constraint if exists billing_payments_provider_provider_payment_id_key;

create unique index if not exists account_subscriptions_provider_subscription_uidx
  on public.account_subscriptions (billing_provider, provider_environment, external_subscription_id)
  where external_subscription_id is not null;

create unique index if not exists checkout_intents_provider_checkout_uidx
  on public.checkout_intents (billing_provider, provider_environment, provider_checkout_id)
  where provider_checkout_id is not null;

create unique index if not exists checkout_intents_provider_payment_uidx
  on public.checkout_intents (billing_provider, provider_environment, provider_payment_id)
  where provider_payment_id is not null;

create unique index if not exists billing_payments_provider_payment_uidx
  on public.billing_payments (provider, provider_environment, provider_payment_id)
  where provider_payment_id is not null;

create unique index if not exists billing_events_provider_event_uidx
  on public.billing_events (provider, provider_environment, provider_event_id);

create or replace function public.billing_valid_br_tax_id(p_value text)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_digits text := regexp_replace(p_value, '[^0-9]', '', 'g');
  v_sum integer := 0;
  v_first integer;
  v_second integer;
  v_weights integer[];
  i integer;
begin
  if char_length(v_digits) not in (11, 14)
     or v_digits = repeat(substr(v_digits, 1, 1), char_length(v_digits)) then
    return false;
  end if;

  if char_length(v_digits) = 11 then
    for i in 1..9 loop
      v_sum := v_sum + substr(v_digits, i, 1)::integer * (11 - i);
    end loop;
    v_first := case when (v_sum % 11) < 2 then 0 else 11 - (v_sum % 11) end;

    v_sum := 0;
    for i in 1..10 loop
      v_sum := v_sum + substr(v_digits, i, 1)::integer * (12 - i);
    end loop;
    v_second := case when (v_sum % 11) < 2 then 0 else 11 - (v_sum % 11) end;
  else
    v_weights := array[5,4,3,2,9,8,7,6,5,4,3,2];
    for i in 1..12 loop
      v_sum := v_sum + substr(v_digits, i, 1)::integer * v_weights[i];
    end loop;
    v_first := case when (v_sum % 11) < 2 then 0 else 11 - (v_sum % 11) end;

    v_sum := 0;
    v_weights := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
    for i in 1..13 loop
      v_sum := v_sum + substr(v_digits, i, 1)::integer * v_weights[i];
    end loop;
    v_second := case when (v_sum % 11) < 2 then 0 else 11 - (v_sum % 11) end;
  end if;

  return substr(v_digits, char_length(v_digits) - 1, 1)::integer = v_first
     and substr(v_digits, char_length(v_digits), 1)::integer = v_second;
end;
$$;

revoke all on function public.billing_valid_br_tax_id(text)
  from public, anon, authenticated;
grant execute on function public.billing_valid_br_tax_id(text)
  to service_role;

create table if not exists public.company_billing_profiles (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  legal_name text not null,
  tax_id_type text not null,
  tax_id_digits text not null,
  billing_email text not null,
  billing_phone_digits text not null,
  postal_code_digits text not null,
  address_line text not null,
  address_number text not null,
  address_complement text,
  district text not null,
  city text not null,
  state text not null,
  country_code text not null default 'BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_billing_profiles_legal_name_check
    check (char_length(trim(legal_name)) between 2 and 160),
  constraint company_billing_profiles_tax_id_type_check
    check (tax_id_type in ('CPF','CNPJ')),
  constraint company_billing_profiles_tax_id_digits_check
    check (
      tax_id_digits ~ '^[0-9]+$'
      and ((tax_id_type = 'CPF' and char_length(tax_id_digits) = 11)
        or (tax_id_type = 'CNPJ' and char_length(tax_id_digits) = 14))
      and public.billing_valid_br_tax_id(tax_id_digits)
    ),
  constraint company_billing_profiles_email_check
    check (
      billing_email = lower(trim(billing_email))
      and billing_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint company_billing_profiles_phone_check
    check (billing_phone_digits ~ '^[0-9]{10,13}$'),
  constraint company_billing_profiles_postal_code_check
    check (postal_code_digits ~ '^[0-9]{8}$'),
  constraint company_billing_profiles_address_check
    check (
      char_length(trim(address_line)) between 2 and 160
      and char_length(trim(address_number)) between 1 and 30
      and char_length(trim(district)) between 2 and 100
      and char_length(trim(city)) between 2 and 100
    ),
  constraint company_billing_profiles_state_check
    check (state ~ '^[A-Z]{2}$'),
  constraint company_billing_profiles_country_check
    check (country_code = 'BR')
);

create table if not exists public.billing_provider_customers (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null check (provider = 'asaas'),
  provider_environment text not null check (provider_environment in ('sandbox','production')),
  provider_customer_id text not null check (provider_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  profile_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, provider, provider_environment)
);

create unique index if not exists billing_provider_customers_provider_customer_uidx
  on public.billing_provider_customers (provider, provider_environment, provider_customer_id);

alter table public.company_billing_profiles enable row level security;
alter table public.billing_provider_customers enable row level security;

-- Deliberately no client table policy. Fiscal identifiers are available only
-- through the masked manager RPC below; the provider adapter uses service_role.
revoke all on table public.company_billing_profiles from public, anon, authenticated;
revoke all on table public.billing_provider_customers from public, anon, authenticated;
grant all on table public.company_billing_profiles to service_role;
grant all on table public.billing_provider_customers to service_role;

create or replace function public.billing_touch_company_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_company_billing_profiles_touch on public.company_billing_profiles;
create trigger trg_company_billing_profiles_touch
before update on public.company_billing_profiles
for each row execute function public.billing_touch_company_profile_updated_at();

drop trigger if exists trg_billing_provider_customers_touch on public.billing_provider_customers;
create trigger trg_billing_provider_customers_touch
before update on public.billing_provider_customers
for each row execute function public.billing_touch_company_profile_updated_at();

create or replace function public.billing_user_can_manage_company(
  p_clinic_id uuid,
  p_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.clinics c
    where c.id = p_clinic_id
      and (
        c.owner_id = p_user_id
        or exists (
          select 1
          from public.clinic_members m
          where m.clinic_id = c.id
            and m.user_id = p_user_id
            and m.status in ('active','accepted')
            and upper(m.role) in ('CEO','ADMIN')
        )
      )
  )
$$;

revoke all on function public.billing_user_can_manage_company(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.billing_user_can_manage_company(uuid,uuid)
  to service_role;

create or replace function public.billing_get_company_profile(p_clinic_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.company_billing_profiles%rowtype;
begin
  if auth.uid() is null
     or not public.billing_user_can_manage_company(p_clinic_id, auth.uid()) then
    raise exception 'BILLING_PROFILE_FORBIDDEN';
  end if;

  select * into v_profile
  from public.company_billing_profiles
  where clinic_id = p_clinic_id;

  if v_profile.clinic_id is null then
    return jsonb_build_object('configured', false, 'clinic_id', p_clinic_id);
  end if;

  return jsonb_build_object(
    'configured', true,
    'clinic_id', v_profile.clinic_id,
    'legal_name', v_profile.legal_name,
    'tax_id_type', v_profile.tax_id_type,
    'tax_id_masked', case
      when v_profile.tax_id_type = 'CPF' then '***.***.***-' || right(v_profile.tax_id_digits, 2)
      else '**.***.***/****-' || right(v_profile.tax_id_digits, 2)
    end,
    'billing_email', v_profile.billing_email,
    'billing_phone_digits', v_profile.billing_phone_digits,
    'postal_code_digits', v_profile.postal_code_digits,
    'address_line', v_profile.address_line,
    'address_number', v_profile.address_number,
    'address_complement', v_profile.address_complement,
    'district', v_profile.district,
    'city', v_profile.city,
    'state', v_profile.state,
    'country_code', v_profile.country_code,
    'provider_bound_sandbox', exists (
      select 1 from public.billing_provider_customers pc
      where pc.clinic_id = p_clinic_id
        and pc.provider = 'asaas'
        and pc.provider_environment = 'sandbox'
    ),
    'provider_bound_production', exists (
      select 1 from public.billing_provider_customers pc
      where pc.clinic_id = p_clinic_id
        and pc.provider = 'asaas'
        and pc.provider_environment = 'production'
    ),
    'updated_at', v_profile.updated_at
  );
end;
$$;

create or replace function public.billing_upsert_company_profile(
  p_clinic_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_billing_email text,
  p_billing_phone text,
  p_postal_code text,
  p_address_line text,
  p_address_number text,
  p_address_complement text,
  p_district text,
  p_city text,
  p_state text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tax_id text := regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g');
  v_phone text := regexp_replace(coalesce(p_billing_phone, ''), '[^0-9]', '', 'g');
  v_postal_code text := regexp_replace(coalesce(p_postal_code, ''), '[^0-9]', '', 'g');
  v_email text := lower(trim(coalesce(p_billing_email, '')));
  v_state text := upper(trim(coalesce(p_state, '')));
  v_tax_id_type text;
begin
  if auth.uid() is null
     or not public.billing_user_can_manage_company(p_clinic_id, auth.uid()) then
    raise exception 'BILLING_PROFILE_FORBIDDEN';
  end if;

  if char_length(v_tax_id) = 11 then
    v_tax_id_type := 'CPF';
  elsif char_length(v_tax_id) = 14 then
    v_tax_id_type := 'CNPJ';
  else
    raise exception 'BILLING_PROFILE_INVALID_TAX_ID';
  end if;
  if not public.billing_valid_br_tax_id(v_tax_id) then
    raise exception 'BILLING_PROFILE_INVALID_TAX_ID';
  end if;

  if char_length(trim(coalesce(p_legal_name, ''))) not between 2 and 160 then
    raise exception 'BILLING_PROFILE_INVALID_LEGAL_NAME';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'BILLING_PROFILE_INVALID_EMAIL';
  end if;
  if v_phone !~ '^[0-9]{10,13}$' then
    raise exception 'BILLING_PROFILE_INVALID_PHONE';
  end if;
  if v_postal_code !~ '^[0-9]{8}$' then
    raise exception 'BILLING_PROFILE_INVALID_POSTAL_CODE';
  end if;
  if v_state !~ '^[A-Z]{2}$' then
    raise exception 'BILLING_PROFILE_INVALID_STATE';
  end if;

  insert into public.company_billing_profiles (
    clinic_id, legal_name, tax_id_type, tax_id_digits, billing_email,
    billing_phone_digits, postal_code_digits, address_line, address_number,
    address_complement, district, city, state, country_code
  ) values (
    p_clinic_id, trim(p_legal_name), v_tax_id_type, v_tax_id, v_email,
    v_phone, v_postal_code, trim(p_address_line), trim(p_address_number),
    nullif(trim(coalesce(p_address_complement, '')), ''), trim(p_district),
    trim(p_city), v_state, 'BR'
  )
  on conflict (clinic_id) do update set
    legal_name = excluded.legal_name,
    tax_id_type = excluded.tax_id_type,
    tax_id_digits = excluded.tax_id_digits,
    billing_email = excluded.billing_email,
    billing_phone_digits = excluded.billing_phone_digits,
    postal_code_digits = excluded.postal_code_digits,
    address_line = excluded.address_line,
    address_number = excluded.address_number,
    address_complement = excluded.address_complement,
    district = excluded.district,
    city = excluded.city,
    state = excluded.state,
    country_code = excluded.country_code,
    updated_at = now();

  update public.billing_provider_customers
  set profile_synced_at = null,
      updated_at = now()
  where clinic_id = p_clinic_id;

  return public.billing_get_company_profile(p_clinic_id);
end;
$$;

create or replace function public.billing_bind_asaas_customer(
  p_clinic_id uuid,
  p_provider_environment text,
  p_provider_customer_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_provider_environment not in ('sandbox','production') then
    raise exception 'BILLING_PROVIDER_INVALID_ENVIRONMENT';
  end if;
  if trim(coalesce(p_provider_customer_id, '')) !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'BILLING_PROVIDER_INVALID_CUSTOMER_ID';
  end if;

  if not exists (
    select 1 from public.company_billing_profiles where clinic_id = p_clinic_id
  ) then
    raise exception 'BILLING_PROFILE_REQUIRED';
  end if;

  insert into public.billing_provider_customers (
    clinic_id, provider, provider_environment, provider_customer_id,
    profile_synced_at
  ) values (
    p_clinic_id, 'asaas', p_provider_environment,
    trim(p_provider_customer_id), now()
  )
  on conflict (clinic_id, provider, provider_environment) do update set
    provider_customer_id = excluded.provider_customer_id,
    profile_synced_at = now(),
    updated_at = now();
end;
$$;

revoke all on function public.billing_get_company_profile(uuid)
  from public, anon;
revoke all on function public.billing_upsert_company_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
revoke all on function public.billing_bind_asaas_customer(uuid,text,text)
  from public, anon, authenticated;

grant execute on function public.billing_get_company_profile(uuid)
  to authenticated;
grant execute on function public.billing_upsert_company_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) to authenticated;
grant execute on function public.billing_bind_asaas_customer(uuid,text,text)
  to service_role;

comment on table public.company_billing_profiles is
  'Restricted fiscal profile for a billable company.';
comment on table public.billing_provider_customers is
  'Canonical provider customer identity, separated by company and Sandbox/Production environment.';
comment on column public.company_billing_profiles.tax_id_digits is
  'CPF/CNPJ digits. Never expose directly to browser clients; use the masked RPC.';
comment on column public.account_subscriptions.provider_environment is
  'Provider namespace: sandbox, production, or internal. Sandbox IDs must never be reused in Production.';

-- Compare enum roles as text so restored databases remain compatible with both
-- legacy lowercase and current uppercase specialist labels.
create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = _user_id
      and upper(ur.role::text) in (
        'ADMIN','DENTISTA','RECEPCIONISTA','AUXILIAR','PROTETICO','SOLICITANTE'
      )
      and p.clinic_id is not null
      and public.company_has_operational_access(p.clinic_id)
  )
$$;

revoke all on function public.is_staff(uuid) from public, anon;
grant execute on function public.is_staff(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

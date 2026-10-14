-- DentalFlow SaaS — Stage 02: durable Asaas adapter coordination.
--
-- External calls remain in the trusted application backend. This migration
-- provides the minimum private state and service-role RPCs needed to serialize
-- provider writes, recover inconclusive requests and bind Asaas identifiers
-- without ever activating access before a confirmed payment webhook.

create table if not exists public.billing_provider_operations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'asaas'),
  provider_environment text not null check (provider_environment in ('sandbox','production')),
  operation_type text not null check (operation_type in ('customer_ensure','subscription_create')),
  idempotency_key text not null,
  external_reference text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress','succeeded','uncertain','failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  provider_resource_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_provider_operations_idempotency_key_check
    check (idempotency_key ~ '^[A-Za-z0-9:_-]{8,200}$'),
  constraint billing_provider_operations_external_reference_check
    check (external_reference ~ '^[A-Za-z0-9:_-]{8,200}$'),
  constraint billing_provider_operations_lease_check
    check (
      (status = 'in_progress' and lease_token is not null and lease_expires_at is not null)
      or (status <> 'in_progress' and lease_token is null and lease_expires_at is null)
    ),
  constraint billing_provider_operations_result_check
    check (status <> 'succeeded' or provider_resource_id is not null)
);

create unique index if not exists billing_provider_operations_idempotency_uidx
  on public.billing_provider_operations (
    provider, provider_environment, operation_type, idempotency_key
  );

create unique index if not exists billing_provider_operations_reference_uidx
  on public.billing_provider_operations (
    provider, provider_environment, operation_type, external_reference
  );

create index if not exists billing_provider_operations_recovery_idx
  on public.billing_provider_operations (status, lease_expires_at)
  where status in ('in_progress','uncertain');

alter table public.billing_provider_operations enable row level security;
revoke all on table public.billing_provider_operations
  from public, anon, authenticated;
grant all on table public.billing_provider_operations to service_role;

drop trigger if exists trg_billing_provider_operations_touch
  on public.billing_provider_operations;
create trigger trg_billing_provider_operations_touch
before update on public.billing_provider_operations
for each row execute function public.billing_touch_company_profile_updated_at();

create or replace function public.billing_bind_asaas_customer(
  p_clinic_id uuid,
  p_provider_environment text,
  p_provider_customer_id text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_bound integer;
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
    profile_synced_at = now(),
    updated_at = now()
  where billing_provider_customers.provider_customer_id = excluded.provider_customer_id;

  get diagnostics v_bound = row_count;
  if v_bound <> 1 then
    raise exception 'BILLING_PROVIDER_CUSTOMER_CONFLICT';
  end if;
end;
$$;

create or replace function public.billing_claim_provider_operation(
  p_provider text,
  p_provider_environment text,
  p_operation_type text,
  p_idempotency_key text,
  p_external_reference text,
  p_lease_seconds integer default 120
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.billing_provider_operations%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if p_provider <> 'asaas' then
    raise exception 'BILLING_PROVIDER_UNSUPPORTED';
  end if;
  if p_provider_environment not in ('sandbox','production') then
    raise exception 'BILLING_PROVIDER_INVALID_ENVIRONMENT';
  end if;
  if p_operation_type not in ('customer_ensure','subscription_create') then
    raise exception 'BILLING_PROVIDER_INVALID_OPERATION';
  end if;
  if coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9:_-]{8,200}$'
     or coalesce(p_external_reference, '') !~ '^[A-Za-z0-9:_-]{8,200}$' then
    raise exception 'BILLING_PROVIDER_INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_lease_seconds not between 30 and 300 then
    raise exception 'BILLING_PROVIDER_INVALID_LEASE';
  end if;

  insert into public.billing_provider_operations (
    provider, provider_environment, operation_type, idempotency_key,
    external_reference, status, lease_token, lease_expires_at, attempt_count
  ) values (
    p_provider, p_provider_environment, p_operation_type, p_idempotency_key,
    p_external_reference, 'in_progress', v_token,
    now() + make_interval(secs => p_lease_seconds), 1
  )
  on conflict (provider, provider_environment, operation_type, idempotency_key)
  do nothing
  returning * into v_row;

  if v_row.id is not null then
    return jsonb_build_object(
      'operation_id', v_row.id,
      'claimed', true,
      'status', v_row.status,
      'lease_token', v_row.lease_token,
      'attempt_count', v_row.attempt_count
    );
  end if;

  select * into v_row
  from public.billing_provider_operations
  where provider = p_provider
    and provider_environment = p_provider_environment
    and operation_type = p_operation_type
    and idempotency_key = p_idempotency_key
  for update;

  if v_row.external_reference <> p_external_reference then
    raise exception 'BILLING_PROVIDER_IDEMPOTENCY_CONFLICT';
  end if;

  if v_row.status = 'succeeded' then
    return jsonb_build_object(
      'operation_id', v_row.id,
      'claimed', false,
      'status', v_row.status,
      'provider_resource_id', v_row.provider_resource_id,
      'attempt_count', v_row.attempt_count
    );
  end if;

  if v_row.status = 'uncertain' then
    return jsonb_build_object(
      'operation_id', v_row.id,
      'claimed', false,
      'status', v_row.status,
      'manual_review', true,
      'attempt_count', v_row.attempt_count
    );
  end if;

  if v_row.status = 'in_progress' and v_row.lease_expires_at > now() then
    return jsonb_build_object(
      'operation_id', v_row.id,
      'claimed', false,
      'status', 'in_progress',
      'busy', true,
      'retry_after_seconds', greatest(
        1,
        ceil(extract(epoch from (v_row.lease_expires_at - now())))::integer
      ),
      'attempt_count', v_row.attempt_count
    );
  end if;

  v_token := gen_random_uuid();
  update public.billing_provider_operations
  set status = 'in_progress',
      lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_error_code = null,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'operation_id', v_row.id,
    'claimed', true,
    'status', v_row.status,
    'lease_token', v_row.lease_token,
    'attempt_count', v_row.attempt_count,
    'recovered', true
  );
end;
$$;

create or replace function public.billing_finish_provider_operation(
  p_operation_id uuid,
  p_lease_token uuid,
  p_status text,
  p_provider_resource_id text default null,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if p_status not in ('succeeded','uncertain','failed') then
    raise exception 'BILLING_PROVIDER_INVALID_OPERATION_STATUS';
  end if;
  if p_status = 'succeeded' and nullif(trim(coalesce(p_provider_resource_id, '')), '') is null then
    raise exception 'BILLING_PROVIDER_RESULT_REQUIRED';
  end if;

  update public.billing_provider_operations
  set status = p_status,
      provider_resource_id = case
        when p_status = 'succeeded' then trim(p_provider_resource_id)
        else provider_resource_id
      end,
      last_error_code = case
        when p_status = 'succeeded' then null
        else left(nullif(trim(coalesce(p_error_code, '')), ''), 80)
      end,
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_operation_id
    and status = 'in_progress'
    and lease_token = p_lease_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.billing_get_asaas_provisioning_context(
  p_subscription_id uuid,
  p_actor_user_id uuid,
  p_provider_environment text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subscription public.account_subscriptions%rowtype;
  v_profile public.company_billing_profiles%rowtype;
  v_plan public.billing_plans%rowtype;
  v_clinic public.clinics%rowtype;
  v_customer public.billing_provider_customers%rowtype;
begin
  if p_provider_environment not in ('sandbox','production') then
    raise exception 'BILLING_PROVIDER_INVALID_ENVIRONMENT';
  end if;

  select * into v_subscription
  from public.account_subscriptions
  where id = p_subscription_id;

  if v_subscription.id is null
     or v_subscription.scope_type <> 'company'
     or v_subscription.clinic_id is null
     or v_subscription.status = 'canceled' then
    raise exception 'BILLING_SUBSCRIPTION_NOT_PROVISIONABLE';
  end if;

  if not public.billing_user_can_manage_company(
    v_subscription.clinic_id,
    p_actor_user_id
  ) then
    raise exception 'BILLING_SUBSCRIPTION_FORBIDDEN';
  end if;

  select * into v_clinic
  from public.clinics
  where id = v_subscription.clinic_id;
  if v_clinic.id is null or coalesce(v_clinic.billing_exempt, false) then
    raise exception 'BILLING_SUBSCRIPTION_EXEMPT_OR_MISSING';
  end if;

  select * into v_profile
  from public.company_billing_profiles
  where clinic_id = v_subscription.clinic_id;
  if v_profile.clinic_id is null then
    raise exception 'BILLING_PROFILE_REQUIRED';
  end if;

  select * into v_plan
  from public.billing_plans
  where code = v_subscription.plan_code
    and account_scope = 'company'
    and is_active;
  if v_plan.code is null
     or v_plan.currency <> 'BRL'
     or v_plan.monthly_price_cents <= 0 then
    raise exception 'BILLING_PLAN_NOT_PROVISIONABLE';
  end if;

  select * into v_customer
  from public.billing_provider_customers
  where clinic_id = v_subscription.clinic_id
    and provider = 'asaas'
    and provider_environment = p_provider_environment;

  return jsonb_build_object(
    'subscription_id', v_subscription.id,
    'clinic_id', v_subscription.clinic_id,
    'clinic_name', v_clinic.name,
    'plan_code', v_plan.code,
    'plan_name', v_plan.name,
    'monthly_price_cents', v_plan.monthly_price_cents,
    'currency', v_plan.currency,
    'billing_day', v_subscription.billing_day,
    'provider_environment', p_provider_environment,
    'provider_customer_id', v_customer.provider_customer_id,
    'external_customer_id', case
      when v_subscription.billing_provider = 'asaas'
       and v_subscription.provider_environment = p_provider_environment
      then v_subscription.external_customer_id
      else null
    end,
    'external_subscription_id', case
      when v_subscription.billing_provider = 'asaas'
       and v_subscription.provider_environment = p_provider_environment
      then v_subscription.external_subscription_id
      else null
    end,
    'legal_name', v_profile.legal_name,
    'tax_id_digits', v_profile.tax_id_digits,
    'billing_email', v_profile.billing_email,
    'billing_phone_digits', v_profile.billing_phone_digits,
    'postal_code_digits', v_profile.postal_code_digits,
    'address_line', v_profile.address_line,
    'address_number', v_profile.address_number,
    'address_complement', v_profile.address_complement,
    'district', v_profile.district,
    'city', v_profile.city,
    'state', v_profile.state,
    'country_code', v_profile.country_code
  );
end;
$$;

create or replace function public.billing_bind_asaas_subscription(
  p_subscription_id uuid,
  p_provider_environment text,
  p_provider_customer_id text,
  p_provider_subscription_id text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subscription public.account_subscriptions%rowtype;
begin
  if p_provider_environment not in ('sandbox','production') then
    raise exception 'BILLING_PROVIDER_INVALID_ENVIRONMENT';
  end if;
  if trim(coalesce(p_provider_customer_id, '')) !~ '^cus_[A-Za-z0-9]+$'
     or trim(coalesce(p_provider_subscription_id, '')) !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'BILLING_PROVIDER_INVALID_RESOURCE_ID';
  end if;

  select * into v_subscription
  from public.account_subscriptions
  where id = p_subscription_id
  for update;

  if v_subscription.id is null
     or v_subscription.scope_type <> 'company'
     or v_subscription.clinic_id is null
     or v_subscription.status = 'canceled' then
    raise exception 'BILLING_SUBSCRIPTION_NOT_PROVISIONABLE';
  end if;

  if (v_subscription.billing_provider is not null
      and v_subscription.billing_provider <> 'asaas')
     or (v_subscription.provider_environment is not null
         and v_subscription.provider_environment <> p_provider_environment)
     or (v_subscription.external_customer_id is not null
         and v_subscription.external_customer_id <> trim(p_provider_customer_id)) then
    raise exception 'BILLING_PROVIDER_CUSTOMER_CONFLICT';
  end if;

  if v_subscription.external_subscription_id is not null
     and v_subscription.external_subscription_id <> trim(p_provider_subscription_id) then
    raise exception 'BILLING_PROVIDER_SUBSCRIPTION_CONFLICT';
  end if;

  if not exists (
    select 1
    from public.billing_provider_customers c
    where c.clinic_id = v_subscription.clinic_id
      and c.provider = 'asaas'
      and c.provider_environment = p_provider_environment
      and c.provider_customer_id = trim(p_provider_customer_id)
  ) then
    raise exception 'BILLING_PROVIDER_CUSTOMER_NOT_BOUND';
  end if;

  update public.account_subscriptions
  set billing_provider = 'asaas',
      provider_environment = p_provider_environment,
      external_customer_id = trim(p_provider_customer_id),
      external_subscription_id = trim(p_provider_subscription_id),
      billing_cycle = 'MONTHLY',
      updated_at = now()
  where id = p_subscription_id;
end;
$$;

revoke all on function public.billing_claim_provider_operation(
  text,text,text,text,text,integer
) from public, anon, authenticated;
revoke all on function public.billing_bind_asaas_customer(
  uuid,text,text
) from public, anon, authenticated;
revoke all on function public.billing_finish_provider_operation(
  uuid,uuid,text,text,text
) from public, anon, authenticated;
revoke all on function public.billing_get_asaas_provisioning_context(
  uuid,uuid,text
) from public, anon, authenticated;
revoke all on function public.billing_bind_asaas_subscription(
  uuid,text,text,text
) from public, anon, authenticated;

grant execute on function public.billing_claim_provider_operation(
  text,text,text,text,text,integer
) to service_role;
grant execute on function public.billing_bind_asaas_customer(
  uuid,text,text
) to service_role;
grant execute on function public.billing_finish_provider_operation(
  uuid,uuid,text,text,text
) to service_role;
grant execute on function public.billing_get_asaas_provisioning_context(
  uuid,uuid,text
) to service_role;
grant execute on function public.billing_bind_asaas_subscription(
  uuid,text,text,text
) to service_role;

comment on table public.billing_provider_operations is
  'Private durable leases and outcomes for idempotent Asaas writes; contains no fiscal payload.';
comment on function public.billing_get_asaas_provisioning_context(uuid,uuid,text) is
  'Backend-only full fiscal context after explicit company-manager authorization.';
comment on function public.billing_bind_asaas_subscription(uuid,text,text,text) is
  'Binds provider identity only; payment webhooks remain the sole authority that activates access.';

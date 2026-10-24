-- Asaas catalog price transition: R$1 test offer for NEW Empresa Inicial checkouts.
-- Existing linked subscriptions retain their original contract amount.
-- Do not use this promotional price for general release; restore the commercial
-- catalog price after the controlled production test in a separate migration.


-- Each Asaas resource keeps the amount of its original checkout. Catalog changes
-- only affect new checkouts; paid renewal and replay retain the agreed amount.
create or replace function public.billing_subscription_contract_amount(p_subscription_id uuid)
returns integer language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(
    (select ci.amount_cents from public.checkout_intents ci
      join public.account_subscriptions s on s.id = ci.subscription_id
      where ci.subscription_id = p_subscription_id and ci.plan_code = s.plan_code
        and ci.amount_cents > 0 and ci.currency = 'BRL'
        and ci.billing_provider = 'asaas'
        and ci.provider_environment = s.provider_environment
        and ci.status in ('paid','provider_created')
      order by case when ci.status = 'paid' then 0 else 1 end, ci.created_at desc
      limit 1),
    (select b.amount_cents from public.billing_payments b
      join public.account_subscriptions s on s.id = b.subscription_id
      where b.subscription_id = p_subscription_id and b.provider = 'asaas'
        and b.provider_environment = s.provider_environment
        and b.status = 'paid' and b.amount_cents > 0 and b.currency = 'BRL'
      order by b.period_start asc limit 1),
    (select ci.amount_cents from public.checkout_intents ci
      join public.account_subscriptions s on s.id = ci.subscription_id
      where ci.subscription_id = p_subscription_id and s.status = 'pending_checkout'
        and ci.plan_code = s.plan_code and ci.status = 'pending'
        and ci.expires_at > now() and ci.amount_cents > 0 and ci.currency = 'BRL'
      order by ci.created_at desc limit 1)
  );
$$;
revoke all on function public.billing_subscription_contract_amount(uuid) from public, anon, authenticated;
grant execute on function public.billing_subscription_contract_amount(uuid) to service_role;


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
  v_contract_amount integer;
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

  v_contract_amount := public.billing_subscription_contract_amount(v_subscription.id);
  if v_subscription.external_subscription_id is not null and v_contract_amount is null then
    raise exception 'BILLING_SUBSCRIPTION_PRICE_UNKNOWN';
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
    'monthly_price_cents', coalesce(v_contract_amount, v_plan.monthly_price_cents),
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

create or replace function public.billing_get_checkout_provisioning_context(
  p_checkout_intent_id uuid,
  p_actor_user_id uuid,
  p_provider_environment text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.checkout_intents%rowtype;
  v_subscription public.account_subscriptions%rowtype;
  v_plan public.billing_plans%rowtype;
begin
  if p_provider_environment not in ('sandbox','production') then
    raise exception 'BILLING_PROVIDER_INVALID_ENVIRONMENT';
  end if;

  select * into v_intent
  from public.checkout_intents
  where id = p_checkout_intent_id;

  if v_intent.id is null then
    raise exception 'BILLING_CHECKOUT_NOT_FOUND';
  end if;
  if v_intent.user_id <> p_actor_user_id then
    raise exception 'BILLING_CHECKOUT_FORBIDDEN';
  end if;
  if v_intent.status not in ('pending','provider_created') then
    raise exception 'BILLING_CHECKOUT_NOT_PROVISIONABLE';
  end if;
  if v_intent.status = 'pending' and v_intent.expires_at <= now() then
    raise exception 'BILLING_CHECKOUT_EXPIRED';
  end if;
  if not public.billing_user_can_manage_company(v_intent.clinic_id, p_actor_user_id) then
    raise exception 'BILLING_CHECKOUT_FORBIDDEN';
  end if;
  if public.is_internal_full_access_company(v_intent.clinic_id) then
    raise exception 'BILLING_CHECKOUT_EXEMPT_COMPANY';
  end if;

  select * into v_subscription
  from public.account_subscriptions
  where id = v_intent.subscription_id;

  if v_subscription.id is null
     or v_subscription.clinic_id <> v_intent.clinic_id
     or v_subscription.scope_type <> 'company'
     or v_subscription.status <> 'pending_checkout' then
    raise exception 'BILLING_SUBSCRIPTION_NOT_PROVISIONABLE';
  end if;

  select * into v_plan
  from public.billing_plans
  where code = v_intent.plan_code
    and account_scope = 'company'
    and is_active;

  if v_plan.code is null
     or v_subscription.plan_code <> v_plan.code
     or v_intent.currency <> 'BRL'
     or v_plan.currency <> v_intent.currency
     or (v_intent.status = 'pending' and v_plan.monthly_price_cents <> v_intent.amount_cents)
     or (v_intent.status = 'provider_created'
         and public.billing_subscription_contract_amount(v_subscription.id) is distinct from v_intent.amount_cents) then
    raise exception 'BILLING_CHECKOUT_CONTRACT_MISMATCH';
  end if;

  return jsonb_build_object(
    'checkout_intent_id', v_intent.id,
    'subscription_id', v_subscription.id,
    'clinic_id', v_intent.clinic_id,
    'plan_code', v_plan.code,
    'plan_name', v_plan.name,
    'amount_cents', v_intent.amount_cents,
    'currency', v_intent.currency,
    'status', v_intent.status,
    'expires_at', v_intent.expires_at,
    'provider_environment', p_provider_environment,
    'provider_customer_id', case
      when v_subscription.billing_provider = 'asaas'
       and v_subscription.provider_environment = p_provider_environment
      then v_subscription.external_customer_id
      else null
    end,
    'provider_subscription_id', case
      when v_subscription.billing_provider = 'asaas'
       and v_subscription.provider_environment = p_provider_environment
      then v_subscription.external_subscription_id
      else null
    end,
    'provider_payment_id', case
      when v_intent.billing_provider = 'asaas'
       and v_intent.provider_environment = p_provider_environment
      then v_intent.provider_payment_id
      else null
    end,
    'provider_payment_url', case
      when v_intent.billing_provider = 'asaas'
       and v_intent.provider_environment = p_provider_environment
      then v_intent.provider_payment_url
      else null
    end
  );
end;
$$;

create or replace function public.create_checkout_intent(
  p_plan_code text,
  p_clinic_id uuid,
  p_session_types text[] default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.billing_plans%rowtype;
  v_subscription public.account_subscriptions%rowtype;
  v_intent public.checkout_intents%rowtype;
  v_provider_intent public.checkout_intents%rowtype;
  v_requested text[];
begin
  if auth.uid() is null then
    raise exception 'BILLING_CHECKOUT_FORBIDDEN';
  end if;
  if p_clinic_id is null
     or not public.billing_user_can_manage_company(p_clinic_id, auth.uid()) then
    raise exception 'BILLING_CHECKOUT_FORBIDDEN';
  end if;
  if public.is_internal_full_access_company(p_clinic_id) then
    raise exception 'BILLING_CHECKOUT_EXEMPT_COMPANY';
  end if;

  select * into v_plan
  from public.billing_plans
  where code = p_plan_code
    and account_scope = 'company'
    and is_active;
  if v_plan.code is null or v_plan.currency <> 'BRL' or v_plan.monthly_price_cents <= 0 then
    raise exception 'BILLING_PLAN_NOT_PROVISIONABLE';
  end if;

  select coalesce(array_agg(distinct lower(x) order by lower(x)), '{}'::text[])
  into v_requested
  from unnest(coalesce(p_session_types, '{}'::text[])) x
  where lower(x) in ('laboratory','clinic','radiology');

  if cardinality(v_requested) = 0
     or cardinality(v_requested) > v_plan.max_sessions then
    raise exception 'BILLING_CHECKOUT_INVALID_SESSIONS';
  end if;

  select * into v_subscription
  from public.account_subscriptions
  where clinic_id = p_clinic_id
    and status <> 'canceled'
  order by created_at desc
  limit 1
  for update;

  if v_subscription.id is null then
    insert into public.account_subscriptions(
      scope_type, clinic_id, plan_code, status, billing_day
    ) values (
      'company', p_clinic_id, v_plan.code, 'pending_checkout',
      least(28, extract(day from now())::integer)
    ) returning * into v_subscription;
  elsif v_subscription.status <> 'pending_checkout' then
    raise exception 'BILLING_SUBSCRIPTION_REACTIVATION_PENDING';
  elsif v_subscription.external_subscription_id is not null
        and v_subscription.plan_code <> v_plan.code then
    raise exception 'BILLING_PROVIDER_SUBSCRIPTION_PLAN_LOCKED';
  elsif v_subscription.external_subscription_id is null
        and v_subscription.plan_code <> v_plan.code then
    update public.account_subscriptions
    set plan_code = v_plan.code,
        updated_at = now()
    where id = v_subscription.id
    returning * into v_subscription;
  end if;

  update public.checkout_intents
  set status = 'expired',
      updated_at = now()
  where subscription_id = v_subscription.id
    and status = 'pending'
    and expires_at <= now();

  select * into v_provider_intent
  from public.checkout_intents
  where subscription_id = v_subscription.id
    and status = 'provider_created'
  order by created_at desc
  limit 1;

  if v_provider_intent.id is not null then
    if v_provider_intent.plan_code <> v_plan.code
       or not (
         coalesce(v_provider_intent.metadata->'requested_sessions', '[]'::jsonb)
           @> to_jsonb(v_requested)
         and coalesce(v_provider_intent.metadata->'requested_sessions', '[]'::jsonb)
           <@ to_jsonb(v_requested)
       ) then
      raise exception 'BILLING_PROVIDER_CHECKOUT_LOCKED';
    end if;
    v_intent := v_provider_intent;
  else
    select * into v_intent
    from public.checkout_intents
    where user_id = auth.uid()
      and clinic_id = p_clinic_id
      and subscription_id = v_subscription.id
      and plan_code = v_plan.code
      and amount_cents = v_plan.monthly_price_cents
      and status = 'pending'
      and expires_at > now()
      and coalesce(metadata->'requested_sessions', '[]'::jsonb) @> to_jsonb(v_requested)
      and coalesce(metadata->'requested_sessions', '[]'::jsonb) <@ to_jsonb(v_requested)
    order by created_at desc
    limit 1;

    if v_intent.id is null then
      update public.checkout_intents
      set status = 'canceled',
          updated_at = now()
      where subscription_id = v_subscription.id
        and status = 'pending';

      insert into public.checkout_intents(
        user_id, clinic_id, subscription_id, plan_code, amount_cents,
        currency, status, metadata
      ) values (
        auth.uid(), p_clinic_id, v_subscription.id, v_plan.code,
        v_plan.monthly_price_cents, v_plan.currency, 'pending',
        jsonb_build_object(
          'requested_sessions', to_jsonb(v_requested),
          'billing_version', 'saas-stage-03'
        )
      ) returning * into v_intent;
    end if;
  end if;

  return jsonb_build_object(
    'checkout_intent_id', v_intent.id,
    'subscription_id', v_subscription.id,
    'plan_code', v_intent.plan_code,
    'plan_name', v_plan.name,
    'amount_cents', v_intent.amount_cents,
    'currency', v_intent.currency,
    'status', v_intent.status,
    'billing_mode', 'live'
  );
end;
$$;

create or replace function public.billing_apply_asaas_initial_payment(
  p_event_id uuid, p_lease_token uuid, p_payment_id text,
  p_customer_id text, p_subscription_id text,
  p_amount_cents integer, p_due_date date, p_payment_status text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_event public.billing_events%rowtype;
  v_intent public.checkout_intents%rowtype;
  v_sub public.account_subscriptions%rowtype;
  v_plan public.billing_plans%rowtype;
  v_prior public.billing_payments%rowtype;
  v_period_end timestamptz;
  v_requested text[];
begin
  select * into v_event from public.billing_events
  where id = p_event_id and provider = 'asaas' and status = 'processing'
    and lease_token = p_lease_token and lease_until > now() for update;
  if v_event.id is null or v_event.event_type not in ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED')
    or v_event.payload->>'paymentId' is distinct from p_payment_id
    or p_payment_status not in ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')
    or p_payment_id !~ '^pay_[A-Za-z0-9]+$'
    or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
    or p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
    or p_amount_cents <= 0 or p_due_date is null then
    raise exception 'BILLING_PAYMENT_NOT_VERIFIED';
  end if;

  select * into v_intent from public.checkout_intents
  where billing_provider = 'asaas' and provider_environment = v_event.provider_environment
    and provider_payment_id = p_payment_id for update;
  if v_intent.id is null or v_intent.status not in ('provider_created','paid')
    or v_intent.amount_cents <> p_amount_cents or v_intent.currency <> 'BRL' then
    raise exception 'BILLING_PAYMENT_INTENT_MISMATCH';
  end if;
  select * into v_sub from public.account_subscriptions
  where id = v_intent.subscription_id for update;
  if v_sub.id is null or v_sub.scope_type <> 'company'
    or v_sub.clinic_id is distinct from v_intent.clinic_id
    or v_sub.billing_provider <> 'asaas'
    or v_sub.provider_environment <> v_event.provider_environment
    or v_sub.external_customer_id <> p_customer_id
    or v_sub.external_subscription_id <> p_subscription_id
    or public.is_internal_full_access_company(v_sub.clinic_id) then
    raise exception 'BILLING_PAYMENT_OWNERSHIP_MISMATCH';
  end if;

  select * into v_prior from public.billing_payments
  where provider = 'asaas' and provider_environment = v_event.provider_environment
    and provider_payment_id = p_payment_id for update;
  if v_prior.id is not null then
    if v_prior.status <> 'paid' or v_prior.subscription_id <> v_sub.id
      or v_prior.checkout_intent_id <> v_intent.id or v_prior.amount_cents <> p_amount_cents then
      raise exception 'BILLING_PAYMENT_ALREADY_RECONCILED_DIFFERENTLY';
    end if;
    update public.billing_events set status = 'processed', processed_at = now(),
      error_message = null, lease_token = null, lease_until = null where id = v_event.id;
    return jsonb_build_object('applied', false, 'idempotent', true);
  end if;

  if v_intent.status <> 'provider_created' or v_sub.status <> 'pending_checkout' then
    raise exception 'BILLING_PAYMENT_STATE_MISMATCH';
  end if;
  select * into v_plan from public.billing_plans
  where code = v_intent.plan_code and account_scope = 'company';
  if v_plan.code is null or v_sub.plan_code <> v_plan.code
    or public.billing_subscription_contract_amount(v_sub.id) is distinct from p_amount_cents
    or v_plan.currency <> 'BRL' then
    raise exception 'BILLING_PAYMENT_PLAN_MISMATCH';
  end if;
  v_period_end := (p_due_date + interval '1 month')::timestamptz;
  if v_period_end <= now() or p_due_date > current_date + 31 then
    raise exception 'BILLING_PAYMENT_PERIOD_REVIEW_REQUIRED';
  end if;

  insert into public.billing_payments (
    subscription_id, checkout_intent_id, clinic_id, amount_cents, currency,
    status, provider, provider_environment, provider_payment_id,
    paid_at, period_start, period_end
  ) values (
    v_sub.id, v_intent.id, v_sub.clinic_id, p_amount_cents, 'BRL',
    'paid', 'asaas', v_event.provider_environment, p_payment_id,
    now(), p_due_date::timestamptz, v_period_end
  );
  update public.account_subscriptions set status = 'active',
    current_period_start = p_due_date::timestamptz,
    current_period_end = v_period_end, grace_until = null,
    updated_at = now() where id = v_sub.id;
  update public.checkout_intents set status = 'paid', updated_at = now()
    where id = v_intent.id;
  update public.clinics set storage_limit_bytes = v_plan.storage_bytes
    where id = v_sub.clinic_id;
  select coalesce(array_agg(s.value), '{}'::text[]) into v_requested
  from jsonb_array_elements_text(coalesce(v_intent.metadata->'requested_sessions', '[]'::jsonb)) s(value);
  if cardinality(v_requested) > 0 then
    update public.company_sessions set status = 'disabled'
      where clinic_id = v_sub.clinic_id and not (session_type = any(v_requested));
    insert into public.company_sessions (clinic_id,session_type,status,sharing_mode)
    select v_sub.clinic_id, x, 'active',
      case when v_plan.max_sessions > 1 then 'company' else 'isolated' end
    from unnest(v_requested) x
    on conflict (clinic_id,session_type) do update
      set status = 'active', sharing_mode = excluded.sharing_mode, updated_at = now();
  end if;
  update public.billing_events set status = 'processed', processed_at = now(),
    error_message = null, lease_token = null, lease_until = null where id = v_event.id;
  return jsonb_build_object('applied', true, 'subscription_id', v_sub.id);
end;
$$;

create or replace function public.billing_apply_asaas_payment_lifecycle(
  p_event_id uuid, p_lease_token uuid, p_payment_id text,
  p_customer_id text, p_subscription_id text,
  p_amount_cents integer, p_due_date date, p_payment_status text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_event public.billing_events%rowtype;
  v_sub public.account_subscriptions%rowtype;
  v_intent public.checkout_intents%rowtype;
  v_plan public.billing_plans%rowtype;
  v_payment public.billing_payments%rowtype;
  v_start timestamptz := p_due_date::timestamptz;
  v_end timestamptz := (p_due_date + interval '1 month')::timestamptz;
  v_last_paid_end timestamptz;
  v_last_paid_start timestamptz;
  v_action text;
begin
  select * into v_event from public.billing_events
  where id = p_event_id and provider = 'asaas' and status = 'processing'
    and lease_token = p_lease_token and lease_until > now() for update;
  if v_event.id is null
    or v_event.payload->>'paymentId' is distinct from p_payment_id
    or coalesce(p_payment_id, '') !~ '^pay_[A-Za-z0-9]+$'
    or coalesce(p_customer_id, '') !~ '^cus_[A-Za-z0-9]+$'
    or coalesce(p_subscription_id, '') !~ '^sub_[A-Za-z0-9]+$'
    or p_amount_cents is null or p_amount_cents <= 0 or p_due_date is null then
    raise exception 'BILLING_LIFECYCLE_PAYMENT_NOT_VERIFIED';
  end if;
  if v_event.event_type in ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED')
     and p_payment_status in ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH') then
    v_action := 'paid';
  elsif v_event.event_type = 'PAYMENT_OVERDUE' and p_payment_status = 'OVERDUE' then
    v_action := 'overdue';
  elsif v_event.event_type = 'PAYMENT_REFUNDED' and p_payment_status = 'REFUNDED' then
    v_action := 'reversed';
  else
    raise exception 'BILLING_LIFECYCLE_PROVIDER_STATUS_CHANGED';
  end if;

  -- The checkout payment is governed by the stricter Stage 04 first-payment
  -- contract, including its paid-intent and requested-session checks.
  if v_action = 'paid' then
    select * into v_intent from public.checkout_intents
    where billing_provider = 'asaas'
      and provider_environment = v_event.provider_environment
      and provider_payment_id = p_payment_id;
    if v_intent.id is not null then
      return public.billing_apply_asaas_initial_payment(
        p_event_id, p_lease_token, p_payment_id, p_customer_id,
        p_subscription_id, p_amount_cents, p_due_date, p_payment_status
      );
    end if;
  end if;

  select * into v_sub from public.account_subscriptions
  where billing_provider = 'asaas'
    and provider_environment = v_event.provider_environment
    and external_subscription_id = p_subscription_id for update;
  if v_sub.id is null or v_sub.scope_type <> 'company'
    or v_sub.clinic_id is null or v_sub.billing_cycle <> 'MONTHLY'
    or v_sub.external_customer_id is distinct from p_customer_id
    or public.is_internal_full_access_company(v_sub.clinic_id) then
    raise exception 'BILLING_LIFECYCLE_OWNERSHIP_MISMATCH';
  end if;
  select * into v_plan from public.billing_plans
  where code = v_sub.plan_code and account_scope = 'company';
  if v_plan.code is null or v_plan.currency <> 'BRL'
    or (v_action <> 'reversed' and public.billing_subscription_contract_amount(v_sub.id) is distinct from p_amount_cents) then
    raise exception 'BILLING_LIFECYCLE_PLAN_MISMATCH';
  end if;
  select * into v_payment from public.billing_payments
  where provider = 'asaas' and provider_environment = v_event.provider_environment
    and provider_payment_id = p_payment_id for update;
  if v_payment.id is not null and (
    v_payment.subscription_id <> v_sub.id
    or v_payment.clinic_id <> v_sub.clinic_id
    or v_payment.amount_cents <> p_amount_cents
    or v_payment.currency <> 'BRL'
    or (v_action <> 'reversed' and (
      v_payment.period_start is distinct from v_start
      or v_payment.period_end is distinct from v_end
    ))
  ) then
    raise exception 'BILLING_LIFECYCLE_PAYMENT_CONFLICT';
  end if;

  if v_action = 'paid' then
    if v_payment.status = 'paid' then
      -- An older CONFIRMED event may arrive after RECEIVED or vice versa.
      null;
    else
      if v_sub.status = 'canceled' or v_sub.current_period_end is null
        or v_start < v_sub.current_period_end
        or v_start > v_sub.current_period_end + interval '31 days'
        or v_end <= now() or p_due_date > current_date + 31 then
        raise exception 'BILLING_LIFECYCLE_PERIOD_REVIEW_REQUIRED';
      end if;
      if not exists (
        select 1 from public.billing_payments b
        where b.subscription_id = v_sub.id and b.provider = 'asaas'
          and b.provider_environment = v_event.provider_environment
          and b.status = 'paid'
      ) then
        raise exception 'BILLING_LIFECYCLE_INITIAL_PAYMENT_REQUIRED';
      end if;
      if v_payment.id is null then
        insert into public.billing_payments (
          subscription_id, clinic_id, amount_cents, currency, status,
          provider, provider_environment, provider_payment_id,
          paid_at, period_start, period_end
        ) values (
          v_sub.id, v_sub.clinic_id, p_amount_cents, 'BRL', 'paid',
          'asaas', v_event.provider_environment, p_payment_id,
          now(), v_start, v_end
        );
      elsif v_payment.status in ('pending','refunded','failed') then
        update public.billing_payments
        set status = 'paid', paid_at = now() where id = v_payment.id;
      else
        raise exception 'BILLING_LIFECYCLE_PAYMENT_CONFLICT';
      end if;
      update public.account_subscriptions
      set status = 'active', current_period_start = v_start,
          current_period_end = v_end, grace_until = null, updated_at = now()
      where id = v_sub.id;
    end if;
  elsif v_action = 'overdue' then
    -- An overdue invoice for a future or historical cycle cannot reduce an
    -- already-paid entitlement. Seven days of grace begin at the due date.
    if v_sub.status <> 'canceled' and v_sub.status <> 'pending_checkout'
      and v_sub.current_period_end is not null
      and v_start >= v_sub.current_period_end
      and v_start <= v_sub.current_period_end + interval '1 day'
      and v_start <= now() and v_payment.id is null
      and not exists (
        select 1 from public.billing_payments b
        where b.subscription_id = v_sub.id and b.provider = 'asaas'
          and b.provider_environment = v_event.provider_environment
          and b.status = 'paid' and b.period_start >= v_start
      ) then
      insert into public.billing_payments (
        subscription_id, clinic_id, amount_cents, currency, status,
        provider, provider_environment, provider_payment_id,
        period_start, period_end
      ) values (
        v_sub.id, v_sub.clinic_id, p_amount_cents, 'BRL', 'pending',
        'asaas', v_event.provider_environment, p_payment_id, v_start, v_end
      );
      update public.account_subscriptions
      set status = case when v_start + interval '7 days' > now()
        then 'past_due' else 'suspended' end,
        grace_until = case when v_start + interval '7 days' > now()
          then v_start + interval '7 days' else null end,
        updated_at = now()
      where id = v_sub.id;
    elsif v_payment.id is not null and v_payment.status = 'pending'
      and v_sub.status in ('past_due','suspended') then
      null; -- duplicate event, including one received after grace expiration
    elsif v_payment.id is not null and v_payment.status = 'paid' then
      null; -- paid already; this event arrived out of order
    elsif v_sub.status in ('canceled','pending_checkout') then
      null; -- neither cancellation nor first unpaid checkout gains access
    else
      raise exception 'BILLING_LIFECYCLE_OVERDUE_REVIEW_REQUIRED';
    end if;
  else
    if v_payment.id is null or v_payment.status not in ('paid','refunded') then
      raise exception 'BILLING_LIFECYCLE_REVERSAL_REVIEW_REQUIRED';
    end if;
    if v_payment.status = 'paid' then
      update public.billing_payments set status = 'refunded',
        metadata = metadata || jsonb_build_object('reversal_event', v_event.event_type)
      where id = v_payment.id;
      select b.period_start, b.period_end
      into v_last_paid_start, v_last_paid_end
      from public.billing_payments b
      where b.subscription_id = v_sub.id and b.provider = 'asaas'
        and b.provider_environment = v_event.provider_environment
        and b.status = 'paid'
      order by b.period_end desc limit 1;
      -- Reversing an older invoice does not shorten a newer paid period.
      if v_payment.period_end >= v_sub.current_period_end then
        update public.account_subscriptions
        set current_period_start = v_last_paid_start,
          current_period_end = v_last_paid_end,
          status = case
            when status = 'canceled' then 'canceled'
            when v_last_paid_end > now() then 'active'
            else 'suspended' end,
          grace_until = null, updated_at = now()
        where id = v_sub.id;
      end if;
    end if;
  end if;

  update public.billing_events set status = 'processed', processed_at = now(),
    error_message = null, lease_token = null, lease_until = null
  where id = v_event.id;
  return jsonb_build_object('applied', true, 'effect', v_action);
end;
$$;

create or replace function public.billing_apply_asaas_subscription_lifecycle(
  p_event_id uuid, p_lease_token uuid, p_subscription_id text,
  p_customer_id text, p_external_reference text,
  p_amount_cents integer, p_cycle text, p_provider_status text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_event public.billing_events%rowtype;
  v_sub public.account_subscriptions%rowtype;
  v_plan public.billing_plans%rowtype;
begin
  select * into v_event from public.billing_events
  where id = p_event_id and provider = 'asaas' and status = 'processing'
    and lease_token = p_lease_token and lease_until > now() for update;
  if v_event.id is null
    or v_event.payload->>'subscriptionId' is distinct from p_subscription_id
    or v_event.event_type not in (
      'SUBSCRIPTION_CREATED','SUBSCRIPTION_UPDATED','SUBSCRIPTION_INACTIVATED'
    )
    or coalesce(p_subscription_id, '') !~ '^sub_[A-Za-z0-9]+$'
    or coalesce(p_customer_id, '') !~ '^cus_[A-Za-z0-9]+$'
    or p_cycle is distinct from 'MONTHLY'
    or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'BILLING_SUBSCRIPTION_NOT_VERIFIED';
  end if;
  select * into v_sub from public.account_subscriptions
  where billing_provider = 'asaas'
    and provider_environment = v_event.provider_environment
    and external_subscription_id = p_subscription_id for update;
  if v_sub.id is null or v_sub.scope_type <> 'company'
    or v_sub.external_customer_id is distinct from p_customer_id
    or p_external_reference is distinct from 'dentalflow:subscription:' || v_sub.id::text
    or public.is_internal_full_access_company(v_sub.clinic_id) then
    raise exception 'BILLING_SUBSCRIPTION_OWNERSHIP_MISMATCH';
  end if;
  select * into v_plan from public.billing_plans
  where code = v_sub.plan_code and account_scope = 'company';
  if v_plan.code is null or v_plan.currency <> 'BRL'
    or (p_provider_status <> 'INACTIVE'
      and public.billing_subscription_contract_amount(v_sub.id) is distinct from p_amount_cents) then
    raise exception 'BILLING_SUBSCRIPTION_PLAN_MISMATCH';
  end if;
  if p_provider_status = 'INACTIVE'
     and v_event.event_type in ('SUBSCRIPTION_INACTIVATED','SUBSCRIPTION_UPDATED') then
    update public.account_subscriptions
    set status = 'canceled', canceled_at = coalesce(canceled_at, now()),
      grace_until = null, updated_at = now()
    where id = v_sub.id;
  elsif p_provider_status = 'ACTIVE'
    and v_event.event_type in ('SUBSCRIPTION_CREATED','SUBSCRIPTION_UPDATED')
    and v_sub.status <> 'canceled' then
    null; -- provider activity alone never establishes a paid entitlement
  else
    raise exception 'BILLING_SUBSCRIPTION_STATE_REVIEW_REQUIRED';
  end if;
  update public.billing_events set status = 'processed', processed_at = now(),
    error_message = null, lease_token = null, lease_until = null
  where id = v_event.id;
  return jsonb_build_object('applied', true, 'status', p_provider_status);
end;
$$;

create or replace function public.company_subscription_snapshot(_clinic_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  allowed boolean;
  internal boolean;
begin
  select exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or public.active_company_member(_clinic_id,auth.uid())
      or exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.clinic_id=_clinic_id)
    into allowed;
  if not allowed then return null; end if;

  internal:=public.is_internal_full_access_company(_clinic_id);
  select * into s from public.account_subscriptions
   where clinic_id=_clinic_id and status<>'canceled' order by created_at desc limit 1;
  if s.id is null then
    select * into s from public.account_subscriptions where clinic_id=_clinic_id order by created_at desc limit 1;
  end if;
  if s.id is null then return null; end if;
  select * into p from public.billing_plans where code=case when internal then 'company_advanced' else s.plan_code end;

  return jsonb_build_object(
    'subscription_id',s.id,'scope','company','plan_code',p.code,'plan_name',p.name,
    'status',case when internal then 'active' else s.status end,
    'access_mode',case when internal then 'full' else public.subscription_access_mode(s.status,s.current_period_end,s.grace_until) end,
    'billing_day',s.billing_day,
    'current_period_end',case when internal then '9999-12-31 23:59:59+00'::timestamptz else s.current_period_end end,
    'grace_until',case when internal then null else s.grace_until end,
    'monthly_price_cents',case when internal then p.monthly_price_cents
      else coalesce(public.billing_subscription_contract_amount(s.id),p.monthly_price_cents) end,
    'currency',p.currency,
    'max_sessions',p.max_sessions,'max_members',p.max_members,'storage_bytes',p.storage_bytes,'features',p.features,
    'internal_full_access',internal,
    'sessions',coalesce((select jsonb_agg(cs.session_type order by cs.session_type) from public.company_sessions cs where cs.clinic_id=_clinic_id and cs.status='active'),'[]'::jsonb)
  );
end $$;

revoke all on function public.billing_get_asaas_provisioning_context(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.billing_get_checkout_provisioning_context(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.billing_apply_asaas_initial_payment(uuid,uuid,text,text,text,integer,date,text) from public,anon,authenticated;
revoke all on function public.billing_apply_asaas_payment_lifecycle(uuid,uuid,text,text,text,integer,date,text) from public,anon,authenticated;
revoke all on function public.billing_apply_asaas_subscription_lifecycle(uuid,uuid,text,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.billing_get_asaas_provisioning_context(uuid,uuid,text) to service_role;
grant execute on function public.billing_get_checkout_provisioning_context(uuid,uuid,text) to service_role;
grant execute on function public.billing_apply_asaas_initial_payment(uuid,uuid,text,text,text,integer,date,text) to service_role;
grant execute on function public.billing_apply_asaas_payment_lifecycle(uuid,uuid,text,text,text,integer,date,text) to service_role;
grant execute on function public.billing_apply_asaas_subscription_lifecycle(uuid,uuid,text,text,text,integer,text,text) to service_role;

-- Change only the future catalog price. Historical intents and payments are immutable.
update public.billing_plans set monthly_price_cents = 100
where code = 'company_initial' and account_scope = 'company' and monthly_price_cents = 24900;
do $$ begin
  if (select monthly_price_cents from public.billing_plans where code = 'company_initial') <> 100 then
    raise exception 'BILLING_TEST_PRICE_NOT_APPLIED';
  end if;
end $$;
notify pgrst, 'reload schema';

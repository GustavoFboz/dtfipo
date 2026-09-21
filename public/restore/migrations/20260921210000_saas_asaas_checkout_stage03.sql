-- DentalFlow SaaS — Stage 03: authenticated Asaas checkout handoff.
--
-- Provider calls remain in the trusted application backend. These RPCs expose
-- only the minimum checkout context to service_role and persist the first Asaas
-- payment URL without ever confirming payment or activating entitlements.

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
     or v_plan.monthly_price_cents <> v_intent.amount_cents then
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

create or replace function public.billing_mark_asaas_checkout_ready(
  p_checkout_intent_id uuid,
  p_actor_user_id uuid,
  p_provider_environment text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_payment_id text,
  p_provider_payment_url text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.checkout_intents%rowtype;
  v_subscription public.account_subscriptions%rowtype;
  v_url text := trim(coalesce(p_provider_payment_url, ''));
begin
  if p_provider_environment not in ('sandbox','production') then
    raise exception 'BILLING_PROVIDER_INVALID_ENVIRONMENT';
  end if;
  if trim(coalesce(p_provider_customer_id, '')) !~ '^cus_[A-Za-z0-9]+$'
     or trim(coalesce(p_provider_subscription_id, '')) !~ '^sub_[A-Za-z0-9]+$'
     or trim(coalesce(p_provider_payment_id, '')) !~ '^pay_[A-Za-z0-9]+$' then
    raise exception 'BILLING_PROVIDER_INVALID_RESOURCE_ID';
  end if;
  if (p_provider_environment = 'sandbox'
      and v_url !~ '^https://sandbox\.asaas\.com/i/[A-Za-z0-9_-]+([/?#].*)?$')
     or (p_provider_environment = 'production'
      and v_url !~ '^https://www\.asaas\.com/i/[A-Za-z0-9_-]+([/?#].*)?$') then
    raise exception 'BILLING_PROVIDER_INVALID_PAYMENT_URL';
  end if;

  select * into v_intent
  from public.checkout_intents
  where id = p_checkout_intent_id
  for update;

  if v_intent.id is null then
    raise exception 'BILLING_CHECKOUT_NOT_FOUND';
  end if;
  if v_intent.user_id <> p_actor_user_id
     or not public.billing_user_can_manage_company(v_intent.clinic_id, p_actor_user_id) then
    raise exception 'BILLING_CHECKOUT_FORBIDDEN';
  end if;
  if v_intent.status not in ('pending','provider_created') then
    raise exception 'BILLING_CHECKOUT_NOT_PROVISIONABLE';
  end if;

  select * into v_subscription
  from public.account_subscriptions
  where id = v_intent.subscription_id
  for update;

  if v_subscription.id is null
     or v_subscription.status <> 'pending_checkout'
     or v_subscription.billing_provider <> 'asaas'
     or v_subscription.provider_environment <> p_provider_environment
     or v_subscription.external_customer_id <> trim(p_provider_customer_id)
     or v_subscription.external_subscription_id <> trim(p_provider_subscription_id) then
    raise exception 'BILLING_PROVIDER_SUBSCRIPTION_CONFLICT';
  end if;

  if (v_intent.billing_provider is not null and v_intent.billing_provider <> 'asaas')
     or (v_intent.provider_environment is not null
         and v_intent.provider_environment <> p_provider_environment)
     or (v_intent.provider_payment_id is not null
         and v_intent.provider_payment_id <> trim(p_provider_payment_id))
     or (v_intent.provider_payment_url is not null
         and v_intent.provider_payment_url <> v_url) then
    raise exception 'BILLING_CHECKOUT_PROVIDER_CONFLICT';
  end if;

  update public.checkout_intents
  set status = 'provider_created',
      billing_provider = 'asaas',
      provider_environment = p_provider_environment,
      provider_payment_id = trim(p_provider_payment_id),
      provider_payment_url = v_url,
      updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object(
    'checkout_intent_id', v_intent.id,
    'subscription_id', v_intent.subscription_id,
    'status', 'provider_created',
    'provider_environment', p_provider_environment,
    'provider_payment_id', trim(p_provider_payment_id),
    'provider_payment_url', v_url,
    'payment_confirmed', false
  );
end;
$$;

-- A browser refresh or a second click must reuse the same active checkout.
-- Once an Asaas subscription exists, plan/session changes require a later
-- lifecycle operation instead of silently attaching a new intent to the old
-- provider resource.
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
      where user_id = auth.uid()
        and clinic_id = p_clinic_id
        and subscription_id = v_subscription.id
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

drop function if exists public.create_checkout_intent(text,uuid);
create function public.create_checkout_intent(
  p_plan_code text,
  p_clinic_id uuid
) returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.create_checkout_intent(
    p_plan_code,
    p_clinic_id,
    coalesce(
      (
        select array_agg(cs.session_type::text order by cs.session_type::text)
        from public.company_sessions cs
        where cs.clinic_id = p_clinic_id
          and cs.status = 'active'
      ),
      array['laboratory']::text[]
    )
  )
$$;

revoke all on function public.create_checkout_intent(text,uuid,text[])
  from public, anon;
revoke all on function public.create_checkout_intent(text,uuid)
  from public, anon;
grant execute on function public.create_checkout_intent(text,uuid,text[])
  to authenticated, service_role;
grant execute on function public.create_checkout_intent(text,uuid)
  to authenticated, service_role;

revoke all on function public.billing_get_checkout_provisioning_context(
  uuid,uuid,text
) from public, anon, authenticated;
revoke all on function public.billing_mark_asaas_checkout_ready(
  uuid,uuid,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.billing_get_checkout_provisioning_context(
  uuid,uuid,text
) to service_role;
grant execute on function public.billing_mark_asaas_checkout_ready(
  uuid,uuid,text,text,text,text,text
) to service_role;

comment on function public.billing_get_checkout_provisioning_context(uuid,uuid,text) is
  'Backend-only checkout contract without fiscal data or provider secrets.';
comment on function public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text) is
  'Stores a validated Asaas payment handoff; never confirms payment or activates access.';

notify pgrst, 'reload schema';

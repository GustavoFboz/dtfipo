-- Stage 05: project verified monthly payment changes without trusting webhook data.
-- Requires the Stage 04 inbox and keeps provider secrets outside the database.

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
    or (v_action <> 'reversed' and v_plan.monthly_price_cents <> p_amount_cents) then
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
      and v_plan.monthly_price_cents <> p_amount_cents) then
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

-- The scheduler can inspect expired grace candidates. It must check the
-- current invoice with Asaas before suspending or enqueueing a paid recovery.
create or replace function public.billing_list_asaas_expired_grace(
  p_environment text, p_limit integer default 10
) returns table (
  subscription_id uuid, payment_id text
)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if p_environment not in ('sandbox','production') or p_limit not between 1 and 20 then
    raise exception 'BILLING_INVALID_WORKER_REQUEST';
  end if;
  return query
  select s.id, b.provider_payment_id
  from public.account_subscriptions s
  join lateral (
    select p.provider_payment_id
    from public.billing_payments p
    where p.subscription_id = s.id and p.provider = 'asaas'
      and p.provider_environment = p_environment
      and p.status = 'pending' and p.period_start >= s.current_period_end
    order by p.period_start desc limit 1
  ) b on true
  where s.billing_provider = 'asaas' and s.provider_environment = p_environment
    and s.status = 'past_due' and s.grace_until <= now()
  order by s.grace_until, s.id limit p_limit;
end;
$$;

create or replace function public.billing_suspend_asaas_expired_grace(
  p_subscription_id uuid, p_environment text, p_payment_id text,
  p_customer_id text, p_provider_subscription_id text, p_provider_status text
) returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_sub public.account_subscriptions%rowtype;
begin
  if p_environment not in ('sandbox','production')
    or p_provider_status is distinct from 'OVERDUE'
    or coalesce(p_payment_id, '') !~ '^pay_[A-Za-z0-9]+$'
    or coalesce(p_customer_id, '') !~ '^cus_[A-Za-z0-9]+$'
    or coalesce(p_provider_subscription_id, '') !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'BILLING_SUSPENSION_NOT_VERIFIED';
  end if;
  select * into v_sub from public.account_subscriptions
  where id = p_subscription_id for update;
  if v_sub.id is null or v_sub.status <> 'past_due'
    or v_sub.grace_until > now()
    or v_sub.billing_provider <> 'asaas'
    or v_sub.provider_environment <> p_environment
    or v_sub.external_customer_id is distinct from p_customer_id
    or v_sub.external_subscription_id is distinct from p_provider_subscription_id
    or public.is_internal_full_access_company(v_sub.clinic_id)
    or not exists (
      select 1 from public.billing_payments b
      where b.subscription_id = v_sub.id and b.provider = 'asaas'
        and b.provider_environment = p_environment
        and b.provider_payment_id = p_payment_id
        and b.status = 'pending' and b.period_start >= v_sub.current_period_end
    )
    or exists (
      select 1 from public.billing_payments b
      where b.subscription_id = v_sub.id and b.provider = 'asaas'
        and b.provider_environment = p_environment
        and b.status = 'paid' and b.period_start >= v_sub.current_period_end
    ) then return false; end if;
  update public.account_subscriptions
  set status = 'suspended', grace_until = null, updated_at = now()
  where id = v_sub.id;
  return true;
end;
$$;

revoke all on function public.billing_apply_asaas_payment_lifecycle(uuid,uuid,text,text,text,integer,date,text) from public,anon,authenticated;
revoke all on function public.billing_apply_asaas_subscription_lifecycle(uuid,uuid,text,text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.billing_list_asaas_expired_grace(text,integer) from public,anon,authenticated;
revoke all on function public.billing_suspend_asaas_expired_grace(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.billing_apply_asaas_payment_lifecycle(uuid,uuid,text,text,text,integer,date,text) to service_role;
grant execute on function public.billing_apply_asaas_subscription_lifecycle(uuid,uuid,text,text,text,integer,text,text) to service_role;
grant execute on function public.billing_list_asaas_expired_grace(text,integer) to service_role;
grant execute on function public.billing_suspend_asaas_expired_grace(uuid,text,text,text,text,text) to service_role;
notify pgrst, 'reload schema';

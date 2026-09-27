-- Stage 04: durable, private Asaas webhook inbox and leased processing.
-- Applying this migration does not enable the webhook or grant paid access.

alter table public.billing_events
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists lease_token uuid,
  add column if not exists lease_until timestamptz;

alter table public.billing_events
  drop constraint if exists billing_events_status_check;
alter table public.billing_events
  add constraint billing_events_status_check
  check (status in ('received','processing','processed','ignored','failed','dead_letter'));

create index if not exists billing_events_pending_work_idx
  on public.billing_events (next_attempt_at, received_at)
  where provider = 'asaas' and status in ('received','processing','failed');

create or replace function public.billing_receive_asaas_event(
  p_environment text, p_event_id text, p_event_type text, p_payload jsonb
) returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_inserted uuid;
begin
  if p_environment not in ('sandbox','production')
    or p_event_id !~ '^evt_[A-Za-z0-9&_-]{1,150}$'
    or p_event_type !~ '^[A-Z_]{3,100}$'
    or jsonb_typeof(p_payload) <> 'object'
    or pg_column_size(p_payload) > 4096 then
    raise exception 'BILLING_INVALID_ASAAS_EVENT';
  end if;

  insert into public.billing_events (
    provider, provider_environment, provider_event_id, event_type, payload, status
  ) values ('asaas', p_environment, p_event_id, p_event_type, p_payload, 'received')
  on conflict (provider, provider_environment, provider_event_id) do nothing
  returning id into v_inserted;
  return v_inserted is not null;
end;
$$;

create or replace function public.billing_claim_asaas_events(
  p_environment text, p_limit integer default 10
) returns table (
  id uuid, event_type text, payload jsonb, lease_token uuid, attempt_count integer
)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if p_environment not in ('sandbox','production') or p_limit not between 1 and 20 then
    raise exception 'BILLING_INVALID_WORKER_REQUEST';
  end if;
  return query
  with claimed as (
    select e.id
    from public.billing_events e
    where e.provider = 'asaas' and e.provider_environment = p_environment
      and e.next_attempt_at <= now()
      and (e.status in ('received','failed')
           or (e.status = 'processing' and e.lease_until < now()))
    order by e.received_at, e.id
    limit p_limit for update skip locked
  )
  update public.billing_events e
  set status = 'processing', lease_token = gen_random_uuid(),
      lease_until = now() + interval '90 seconds',
      attempt_count = e.attempt_count + 1
  from claimed c where e.id = c.id
  returning e.id, e.event_type, e.payload, e.lease_token, e.attempt_count;
end;
$$;

create or replace function public.billing_finish_asaas_event(
  p_id uuid, p_lease_token uuid, p_outcome text, p_error_code text default null
) returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_attempts integer;
begin
  if p_outcome not in ('processed','ignored','failed')
    or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,80}$') then
    raise exception 'BILLING_INVALID_WORKER_RESULT';
  end if;
  select attempt_count into v_attempts from public.billing_events
  where id = p_id and provider = 'asaas' and status = 'processing'
    and lease_token = p_lease_token and lease_until > now() for update;
  if not found then return false; end if;

  update public.billing_events set
    status = case when p_outcome = 'failed' and v_attempts >= 6
      then 'dead_letter' else p_outcome end,
    error_message = p_error_code,
    processed_at = case when p_outcome = 'failed' then null else now() end,
    next_attempt_at = case when p_outcome = 'failed'
      then now() + make_interval(secs => least(3600, 30 * power(2, least(v_attempts, 6)))::integer)
      else now() end,
    lease_token = null, lease_until = null
  where id = p_id;
  return true;
end;
$$;

-- An initial payment is applied in one transaction with its inbox event. A
-- second event for the same charge is a no-op; a different resource is rejected.
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
    or v_plan.monthly_price_cents <> p_amount_cents or v_plan.currency <> 'BRL' then
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

revoke all on function public.billing_receive_asaas_event(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.billing_claim_asaas_events(text,integer) from public,anon,authenticated;
revoke all on function public.billing_finish_asaas_event(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.billing_apply_asaas_initial_payment(uuid,uuid,text,text,text,integer,date,text) from public,anon,authenticated;
grant execute on function public.billing_receive_asaas_event(text,text,text,jsonb) to service_role;
grant execute on function public.billing_claim_asaas_events(text,integer) to service_role;
grant execute on function public.billing_finish_asaas_event(uuid,uuid,text,text) to service_role;
grant execute on function public.billing_apply_asaas_initial_payment(uuid,uuid,text,text,text,integer,date,text) to service_role;
notify pgrst, 'reload schema';

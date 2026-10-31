-- Stage 08: customer requests only. No provider call, entitlement/price change,
-- payment cancellation or automatic execution is authorized by this migration.
create table if not exists public.billing_change_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  subscription_id uuid not null references public.account_subscriptions(id),
  requested_by uuid not null references auth.users(id),
  kind text not null check (kind in ('cancel','change_plan')),
  status text not null default 'awaiting_provider' check (status in ('awaiting_provider','withdrawn')),
  provider_environment text not null check (provider_environment in ('sandbox','production')),
  current_plan_code text not null,
  current_plan_name text not null,
  current_amount_cents integer not null check (current_amount_cents > 0),
  target_plan_code text,
  target_plan_name text,
  target_amount_cents integer,
  currency text not null check (currency = 'BRL'),
  paid_period_end timestamptz,
  effective_not_before timestamptz not null,
  quote_token text not null,
  quote_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id),
  check ((kind = 'cancel' and target_plan_code is null and target_plan_name is null and target_amount_cents is null)
      or (kind = 'change_plan' and target_plan_code is not null and target_plan_name is not null and target_amount_cents is not null and target_amount_cents > 0)),
  check ((status = 'awaiting_provider' and withdrawn_at is null and withdrawn_by is null)
      or (status = 'withdrawn' and withdrawn_at is not null and withdrawn_by is not null))
);
create unique index if not exists billing_change_requests_one_pending_company
  on public.billing_change_requests(clinic_id) where status = 'awaiting_provider';
create index if not exists billing_change_requests_company_recent
  on public.billing_change_requests(clinic_id, created_at desc);
create table if not exists public.billing_change_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.billing_change_requests(id),
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in ('submitted','withdrawn')),
  created_at timestamptz not null default now(),
  unique(request_id, action)
);
alter table public.billing_change_requests enable row level security;
alter table public.billing_change_request_events enable row level security;
revoke all on public.billing_change_requests, public.billing_change_request_events from public, anon, authenticated, service_role;
grant select on public.billing_change_requests, public.billing_change_request_events to service_role;

-- Private fresh quote; the digest is a stale-selection guard, not authorization.
-- Consumption is advisory for a REQUEST and must be checked again at execution.
create or replace function public.billing_change_request_quote(
  p_subscription_id uuid, p_kind text, p_target_plan_code text
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  t public.billing_plans%rowtype;
  v_amount integer;
  v_used bigint;
  v_base bigint;
  v_extra bigint;
  v_target_storage bigint;
  v_members integer;
  v_sessions integer;
  v_block text;
  v_snapshot jsonb;
begin
  select * into s from public.account_subscriptions where id = p_subscription_id;
  v_amount := public.billing_subscription_contract_amount(s.id);
  if s.id is null or s.scope_type <> 'company' or s.billing_provider is distinct from 'asaas'
    or s.status not in ('active','past_due','grace','suspended')
    or coalesce(s.provider_environment,'') not in ('sandbox','production')
    or coalesce(s.external_customer_id,'') !~ '^cus_[A-Za-z0-9]+$'
    or coalesce(s.external_subscription_id,'') !~ '^sub_[A-Za-z0-9]+$'
    or public.is_internal_full_access_company(s.clinic_id)
    or v_amount is null or v_amount <= 0 then
    raise exception 'BILLING_CHANGE_NOT_ELIGIBLE';
  end if;
  select * into p from public.billing_plans where code = s.plan_code and account_scope = 'company';
  if p.code is null or p.currency <> 'BRL' then raise exception 'BILLING_CHANGE_NOT_ELIGIBLE'; end if;
  if p_kind is null or p_kind not in ('cancel','change_plan')
    or (p_kind = 'cancel' and p_target_plan_code is not null) then
    raise exception 'BILLING_CHANGE_INVALID';
  end if;
  if p_kind = 'change_plan' then
    select * into t from public.billing_plans
    where code = p_target_plan_code and account_scope = 'company' and is_active
      and currency = 'BRL' and monthly_price_cents > 0 and code <> s.plan_code;
    if t.code is null then raise exception 'BILLING_CHANGE_INVALID_PLAN'; end if;
    if s.status <> 'active' or s.current_period_end is null or s.current_period_end <= now()
      or not exists (select 1 from public.billing_payments b where b.subscription_id = s.id
        and b.provider = 'asaas' and b.provider_environment = s.provider_environment
        and b.status = 'paid' and b.period_end >= s.current_period_end) then
      v_block := 'paid_period_required';
    end if;
    select coalesce(sum(size_bytes),0) into v_used from public.storage_files
    where clinic_id = s.clinic_id and status in ('ready','reserved');
    select coalesce(sum(bytes) filter (where entitlement_type in ('base','courtesy')),0),
           coalesce(sum(bytes) filter (where entitlement_type in ('purchase','manual')),0)
    into v_base, v_extra from public.clinic_storage_entitlements
    where clinic_id = s.clinic_id and status = 'active' and starts_at <= now()
      and (ends_at is null or ends_at > now());
    v_target_storage := greatest(t.storage_bytes, v_base, 1073741824::bigint) + v_extra;
    select count(*) into v_members from public.clinic_members
    where clinic_id = s.clinic_id and status in ('active','accepted');
    select count(*) into v_sessions from public.company_sessions
    where clinic_id = s.clinic_id and status = 'active';
    if v_block is null then
      v_block := case when v_used > v_target_storage then 'storage_limit'
        when t.max_members > 0 and v_members > t.max_members then 'member_limit'
        when t.max_sessions > 0 and v_sessions > t.max_sessions then 'session_limit' end;
    end if;
  end if;
  v_snapshot := jsonb_build_object(
    'subscription_id',s.id,'current_plan_code',p.code,'current_plan_name',p.name,
    'current_amount_cents',v_amount,'currency','BRL','paid_period_end',s.current_period_end,
    'provider_environment',s.provider_environment,'kind',p_kind,
    'target_plan_code',t.code,'target_plan_name',t.name,'target_amount_cents',t.monthly_price_cents,
    'target_max_members',t.max_members,'target_max_sessions',t.max_sessions,
    'target_features',t.features,
    'target_storage_bytes',v_target_storage,'storage_used_bytes',v_used,
    'members_used',v_members,'sessions_used',v_sessions,'block_reason',v_block
  );
  -- Usage is checked afresh but is not a price/agreement version: an unrelated
  -- small upload must not invalidate a still-compatible selection.
  return v_snapshot || jsonb_build_object('quote_token',md5((
    v_snapshot - 'storage_used_bytes' - 'members_used' - 'sessions_used' - 'block_reason'
    || jsonb_build_object('status',s.status,'customer',s.external_customer_id,
                         'subscription',s.external_subscription_id)
  )::text));
end $$;

-- Return an explicit, safe projection. Never expose provider IDs or raw quote.
create or replace function public.billing_change_request_summary(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('id',r.id,'subscription_id',r.subscription_id,'kind',r.kind,
    'status',r.status,'provider_environment',r.provider_environment,
    'current_plan_name',r.current_plan_name,'current_amount_cents',r.current_amount_cents,
    'target_plan_name',r.target_plan_name,'target_amount_cents',r.target_amount_cents,
    'currency',r.currency,'paid_period_end',r.paid_period_end,
    'effective_not_before',r.effective_not_before,'created_at',r.created_at,'withdrawn_at',r.withdrawn_at)
  from public.billing_change_requests r where r.id = p_request_id;
$$;

create or replace function public.billing_company_change_context(p_clinic_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare s public.account_subscriptions%rowtype; v_cancel jsonb; v_plans jsonb := '[]'; v_requests jsonb; t record;
begin
  if auth.role() <> 'authenticated' or not public.billing_current_user_can_manage_company(p_clinic_id) then
    raise exception 'BILLING_CHANGE_FORBIDDEN';
  end if;
  select * into s from public.account_subscriptions where clinic_id = p_clinic_id and scope_type = 'company'
  order by (status <> 'canceled') desc, created_at desc, id desc limit 1;
  begin
    v_cancel := public.billing_change_request_quote(s.id,'cancel',null);
  exception when others then
    if sqlerrm <> 'BILLING_CHANGE_NOT_ELIGIBLE' then raise; end if;
  end;
  if v_cancel is not null then
    for t in select code from public.billing_plans where account_scope = 'company' and is_active
      and code <> s.plan_code and currency = 'BRL' and monthly_price_cents > 0 order by display_order, code loop
      v_plans := v_plans || jsonb_build_array(public.billing_change_request_quote(s.id,'change_plan',t.code));
    end loop;
  end if;
  select coalesce(jsonb_agg(public.billing_change_request_summary(r.id) order by r.created_at desc),'[]')
  into v_requests from (select id, created_at from public.billing_change_requests
    where clinic_id = p_clinic_id order by created_at desc, id desc limit 20) r;
  return jsonb_build_object('clinic_id',p_clinic_id,'cancellation_quote',v_cancel,
    'plan_quotes',v_plans,'requests',v_requests);
end $$;

create or replace function public.billing_submit_change_request(
  p_clinic_id uuid, p_subscription_id uuid, p_kind text, p_target_plan_code text, p_quote_token text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.account_subscriptions%rowtype; r public.billing_change_requests%rowtype; q jsonb;
begin
  if auth.role() <> 'authenticated' or not public.billing_current_user_can_manage_company(p_clinic_id) then
    raise exception 'BILLING_CHANGE_FORBIDDEN';
  end if;
  select * into s from public.account_subscriptions
  where id = p_subscription_id and clinic_id = p_clinic_id and scope_type = 'company' for update;
  if s.id is null then raise exception 'BILLING_CHANGE_FORBIDDEN'; end if;
  select * into r from public.billing_change_requests
  where clinic_id = p_clinic_id and status = 'awaiting_provider' for update;
  if r.id is not null then
    if r.subscription_id = s.id and r.kind = p_kind
      and r.target_plan_code is not distinct from p_target_plan_code and r.quote_token = p_quote_token then
      return public.billing_change_request_summary(r.id); -- retry after ambiguous transport
    end if;
    raise exception 'BILLING_CHANGE_PENDING';
  end if;
  if s.id is distinct from (select id from public.account_subscriptions
      where clinic_id = p_clinic_id and scope_type = 'company'
      order by (status <> 'canceled') desc, created_at desc, id desc limit 1) then
    raise exception 'BILLING_CHANGE_QUOTE_STALE';
  end if;
  perform 1 from public.billing_plans where code in (s.plan_code,p_target_plan_code) order by code for share;
  q := public.billing_change_request_quote(s.id,p_kind,p_target_plan_code);
  if p_quote_token is null or q->>'quote_token' is distinct from p_quote_token then
    raise exception 'BILLING_CHANGE_QUOTE_STALE';
  end if;
  if q->>'block_reason' is not null then raise exception 'BILLING_CHANGE_LIMIT_REVIEW'; end if;
  insert into public.billing_change_requests
    (clinic_id,subscription_id,requested_by,kind,provider_environment,current_plan_code,current_plan_name,
     current_amount_cents,target_plan_code,target_plan_name,target_amount_cents,currency,paid_period_end,
     effective_not_before,quote_token,quote_snapshot)
  values (p_clinic_id,s.id,auth.uid(),p_kind,s.provider_environment,s.plan_code,q->>'current_plan_name',
    (q->>'current_amount_cents')::integer,q->>'target_plan_code',q->>'target_plan_name',
    (q->>'target_amount_cents')::integer,'BRL',s.current_period_end,
    greatest(now(),s.current_period_end),p_quote_token,q) returning * into r;
  insert into public.billing_change_request_events(request_id,actor_user_id,action) values (r.id,auth.uid(),'submitted');
  return public.billing_change_request_summary(r.id);
exception when unique_violation then raise exception 'BILLING_CHANGE_PENDING';
end $$;

create or replace function public.billing_withdraw_change_request(p_clinic_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.billing_change_requests%rowtype; v_sub uuid;
begin
  if auth.role() <> 'authenticated' or not public.billing_current_user_can_manage_company(p_clinic_id) then
    raise exception 'BILLING_CHANGE_FORBIDDEN';
  end if;
  select subscription_id into v_sub from public.billing_change_requests where id = p_request_id and clinic_id = p_clinic_id;
  if v_sub is null then raise exception 'BILLING_CHANGE_FORBIDDEN'; end if;
  -- Same lock order as submit: subscription, then request.
  perform 1 from public.account_subscriptions where id = v_sub for update;
  select * into r from public.billing_change_requests where id = p_request_id and clinic_id = p_clinic_id for update;
  if r.status = 'awaiting_provider' then
    update public.billing_change_requests set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid() where id = r.id;
    insert into public.billing_change_request_events(request_id,actor_user_id,action) values (r.id,auth.uid(),'withdrawn');
  elsif r.status is distinct from 'withdrawn' then raise exception 'BILLING_CHANGE_REVIEW_REQUIRED'; end if;
  return public.billing_change_request_summary(r.id);
end $$;

create or replace function public.platform_master_billing_change_requests(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_result jsonb; v_search text := btrim(coalesce(p_search,''));
begin
  if auth.uid() is null or auth.role() <> 'authenticated' or not exists
    (select 1 from public.platform_operators where user_id = auth.uid() and enabled) then
    raise exception 'PLATFORM_MASTER_FORBIDDEN';
  end if;
  if length(v_search) > 80 then raise exception 'PLATFORM_MASTER_SEARCH_INVALID'; end if;
  select coalesce(jsonb_agg(public.billing_change_request_summary(r.id) || jsonb_build_object('clinic_name',r.name)
    order by r.created_at),'[]') into v_result from (
    select r.id, r.created_at, c.name from public.billing_change_requests r join public.clinics c on c.id = r.clinic_id
    where r.status = 'awaiting_provider' and (v_search = '' or c.name ilike '%' || v_search || '%')
    order by r.created_at, r.id limit 50
  ) r;
  return v_result;
end $$;

revoke all on function public.billing_change_request_quote(uuid,text,text), public.billing_change_request_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.billing_change_request_quote(uuid,text,text), public.billing_change_request_summary(uuid) to service_role;
revoke all on function public.billing_company_change_context(uuid), public.billing_submit_change_request(uuid,uuid,text,text,text),
  public.billing_withdraw_change_request(uuid,uuid), public.platform_master_billing_change_requests(text) from public, anon, authenticated;
grant execute on function public.billing_company_change_context(uuid), public.billing_submit_change_request(uuid,uuid,text,text,text),
  public.billing_withdraw_change_request(uuid,uuid), public.platform_master_billing_change_requests(text) to authenticated;
notify pgrst, 'reload schema';

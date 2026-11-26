-- Stage 08: operator-authorized INACTIVE only. Preserve existing invoices,
-- ledger, clinical data, plan and paid periods. No change-plan write is enabled.
alter table public.billing_change_requests
  drop constraint if exists billing_change_requests_status_check,
  drop constraint if exists billing_change_requests_check1;
alter table public.billing_change_requests
  add column if not exists execution_lease_token uuid,
  add column if not exists execution_lease_until timestamptz,
  add column if not exists execution_actor uuid references auth.users(id),
  add column if not exists execution_session_id uuid,
  add column if not exists provider_write_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists last_error_code text;
alter table public.billing_change_requests
  add constraint billing_change_requests_status_check
    check(status in ('awaiting_provider','withdrawn','processing','review_required','completed')),
  add constraint billing_change_requests_withdrawal_check
    check((status = 'withdrawn' and withdrawn_at is not null and withdrawn_by is not null)
      or (status <> 'withdrawn' and withdrawn_at is null and withdrawn_by is null));
drop index if exists public.billing_change_requests_one_pending_company;
create unique index billing_change_requests_one_pending_company on public.billing_change_requests(clinic_id)
  where status in ('awaiting_provider','processing','review_required');

create table public.billing_cancel_executions (
  lease_token uuid primary key,
  request_id uuid not null references public.billing_change_requests(id),
  actor_user_id uuid not null references auth.users(id),
  actor_session_id uuid not null,
  reason text not null check(length(btrim(reason)) between 16 and 300),
  reconcile_only boolean not null,
  provider_environment text not null,
  provider_customer_id text not null,
  provider_subscription_id text not null,
  created_at timestamptz not null default now(),
  provider_write_started_at timestamptz,
  finished_at timestamptz,
  outcome text check(outcome in ('completed','review_required')),
  error_code text,
  provider_proof_hash text
);
alter table public.billing_cancel_executions enable row level security;
revoke all on public.billing_cancel_executions from public, anon, authenticated, service_role;
grant select on public.billing_cancel_executions to service_role;

-- Existing customer projections keep provider IDs, lease and identity private.
create or replace function public.billing_change_request_summary(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('id',r.id,'subscription_id',r.subscription_id,'kind',r.kind,
    'status',r.status,'provider_environment',r.provider_environment,
    'current_plan_name',r.current_plan_name,'current_amount_cents',r.current_amount_cents,
    'target_plan_name',r.target_plan_name,'target_amount_cents',r.target_amount_cents,
    'currency',r.currency,'paid_period_end',r.paid_period_end,
    'effective_not_before',r.effective_not_before,'created_at',r.created_at,'withdrawn_at',r.withdrawn_at,
    'completed_at',r.completed_at,'last_error_code',r.last_error_code)
  from public.billing_change_requests r where r.id = p_request_id;
$$;

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
    where r.status in ('awaiting_provider','processing','review_required')
      and (v_search = '' or c.name ilike '%' || v_search || '%')
    order by r.created_at, r.id limit 50
  ) r;
  return v_result;
end $$;

-- These checks run on the verified JWT received by PostgREST, not decoded
-- browser claims. A revoked/expired Auth session cannot authorize a write.
create function public.billing_cancel_master_identity()
returns uuid language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_session uuid;
begin
  if auth.uid() is null or auth.role() <> 'authenticated' or not exists
    (select 1 from public.platform_operators where user_id = auth.uid() and enabled) then
    raise exception 'BILLING_CANCEL_FORBIDDEN';
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'BILLING_CANCEL_MFA_REQUIRED'; end if;
  if coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-fA-F-]{36}$'
    or coalesce(auth.jwt()->>'exp','') !~ '^[0-9]{1,12}$' then raise exception 'BILLING_CANCEL_SESSION_REQUIRED'; end if;
  v_session := (auth.jwt()->>'session_id')::uuid;
  if (auth.jwt()->>'exp')::bigint <= extract(epoch from now()) + 15
    or not exists(select 1 from auth.sessions where id = v_session and user_id = auth.uid()
      and (not_after is null or not_after > now())) then raise exception 'BILLING_CANCEL_SESSION_REQUIRED'; end if;
  return v_session;
end $$;

create function public.platform_master_claim_cancel_request(
  p_request_id uuid, p_environment text, p_reason text, p_reconcile_only boolean
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.billing_change_requests%rowtype; s public.account_subscriptions%rowtype;
  v_sub uuid; v_session uuid; v_token uuid; v_readonly boolean; v_reason text := btrim(coalesce(p_reason,''));
begin
  v_session := public.billing_cancel_master_identity();
  if p_environment is null or p_environment not in ('sandbox','production') or p_reconcile_only is null
    or length(v_reason) not between 16 and 300 or v_reason ~ '[[:cntrl:]]' then
    raise exception 'BILLING_CANCEL_INVALID';
  end if;
  select subscription_id into v_sub from public.billing_change_requests where id = p_request_id;
  if v_sub is null then raise exception 'BILLING_CANCEL_NOT_ELIGIBLE'; end if;
  -- Same order as customer submit/withdraw: subscription, then request.
  select * into s from public.account_subscriptions where id = v_sub for update;
  select * into r from public.billing_change_requests where id = p_request_id for update;
  if r.kind <> 'cancel' then raise exception 'BILLING_CANCEL_PLAN_NOT_READY'; end if;
  if r.provider_environment is distinct from p_environment
    or s.provider_environment is distinct from p_environment or s.billing_provider is distinct from 'asaas'
    or s.scope_type <> 'company' or s.clinic_id is distinct from r.clinic_id
    or s.billing_cycle is distinct from 'MONTHLY' or public.is_internal_full_access_company(r.clinic_id)
    or coalesce(s.external_customer_id,'') !~ '^cus_[A-Za-z0-9]+$'
    or coalesce(s.external_subscription_id,'') !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'BILLING_CANCEL_NOT_ELIGIBLE';
  end if;
  if r.status = 'completed' then return jsonb_build_object('done',true,'request_id',r.id); end if;
  if r.status not in ('awaiting_provider','processing','review_required') then raise exception 'BILLING_CANCEL_NOT_ELIGIBLE'; end if;
  if r.status = 'processing' and r.execution_lease_until > now() then raise exception 'BILLING_CANCEL_BUSY'; end if;
  if not public.billing_user_can_manage_company(r.clinic_id,r.requested_by)
    or s.status not in ('active','past_due','grace','suspended','canceled')
    or s.plan_code is distinct from r.current_plan_code
    or s.current_period_end is distinct from r.paid_period_end
    or public.billing_subscription_contract_amount(s.id) is distinct from r.current_amount_cents then
    raise exception 'BILLING_CANCEL_STALE';
  end if;
  -- Expired claims and review states can only inspect, even if the first server
  -- crashed before recording whether it reached the provider.
  v_readonly := p_reconcile_only or r.status <> 'awaiting_provider' or r.provider_write_started_at is not null;
  v_token := gen_random_uuid();
  update public.billing_change_requests set status = 'processing', execution_lease_token = v_token,
    execution_lease_until = least(now()+interval '120 seconds',to_timestamp((auth.jwt()->>'exp')::bigint)),
    execution_actor = auth.uid(), execution_session_id = v_session, last_error_code = null where id = r.id;
  insert into public.billing_cancel_executions(lease_token,request_id,actor_user_id,actor_session_id,reason,reconcile_only,
    provider_environment,provider_customer_id,provider_subscription_id)
    values(v_token,r.id,auth.uid(),v_session,v_reason,v_readonly,p_environment,s.external_customer_id,s.external_subscription_id);
  return jsonb_build_object('done',false,'request_id',r.id,'lease_token',v_token,
    'subscription_id',s.id,'external_subscription_id',s.external_subscription_id,
    'external_customer_id',s.external_customer_id,'amount_cents',r.current_amount_cents,
    'environment',p_environment,'reconcile_only',v_readonly);
end $$;

create function public.platform_master_begin_cancel_write(p_request_id uuid, p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_session uuid; r public.billing_change_requests%rowtype; s public.account_subscriptions%rowtype;
begin
  v_session := public.billing_cancel_master_identity();
  select * into s from public.account_subscriptions where id =
    (select subscription_id from public.billing_change_requests where id = p_request_id) for update;
  select * into r from public.billing_change_requests where id = p_request_id for update;
  if r.id is null or r.kind <> 'cancel' or r.status <> 'processing'
    or r.execution_lease_token is distinct from p_lease_token or r.execution_lease_until is null or r.execution_lease_until <= now()
    or r.execution_actor is distinct from auth.uid() or r.execution_session_id is distinct from v_session
    or r.provider_write_started_at is not null or not exists(select 1 from public.billing_cancel_executions
      where lease_token = p_lease_token and request_id = r.id and not reconcile_only
        and provider_environment = s.provider_environment and provider_customer_id = s.external_customer_id
        and provider_subscription_id = s.external_subscription_id)
    or not public.billing_user_can_manage_company(r.clinic_id,r.requested_by)
    or s.billing_provider is distinct from 'asaas' or s.billing_cycle is distinct from 'MONTHLY'
    or s.clinic_id is distinct from r.clinic_id or s.provider_environment is distinct from r.provider_environment
    or public.is_internal_full_access_company(r.clinic_id)
    or s.current_period_end is distinct from r.paid_period_end or s.plan_code is distinct from r.current_plan_code
    or public.billing_subscription_contract_amount(s.id) is distinct from r.current_amount_cents then
    raise exception 'BILLING_CANCEL_WRITE_NOT_AUTHORIZED';
  end if;
  update public.billing_change_requests set provider_write_started_at = now() where id = r.id;
  update public.billing_cancel_executions set provider_write_started_at = now() where lease_token = p_lease_token;
  return true;
end $$;

-- Only the server can submit a fresh provider proof. Exact lease/actor/frozen
-- contract fences survive client timeouts, repeated clicks and worker runs.
create function public.billing_finish_cancel_request(
  p_request_id uuid, p_lease_token uuid, p_verified_subscription jsonb, p_error_code text
) returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.billing_change_requests%rowtype; s public.account_subscriptions%rowtype;
  v_outcome text; v_error text; v_proof jsonb := p_verified_subscription;
begin
  select * into s from public.account_subscriptions where id =
    (select subscription_id from public.billing_change_requests where id = p_request_id) for update;
  select * into r from public.billing_change_requests where id = p_request_id for update;
  if r.id is null or r.kind <> 'cancel' then raise exception 'BILLING_CANCEL_NOT_ELIGIBLE'; end if;
  if r.status = 'completed' then return 'completed'; end if;
  if r.status <> 'processing' or r.execution_lease_token is distinct from p_lease_token
    or r.execution_lease_until is null or r.execution_lease_until <= now() or not exists(select 1 from public.billing_cancel_executions e
      where e.lease_token = p_lease_token and e.request_id = r.id and e.actor_user_id = r.execution_actor
        and e.actor_session_id = r.execution_session_id) then raise exception 'BILLING_CANCEL_LEASE_LOST'; end if;
  v_outcome := 'review_required';
  v_error := case when p_error_code in ('PROVIDER_STILL_ACTIVE','PROVIDER_RESULT_UNCONFIRMED','PROVIDER_REVIEW_REQUIRED')
    then p_error_code else 'PROVIDER_REVIEW_REQUIRED' end;
  if p_error_code is null and v_proof is not null and jsonb_typeof(v_proof) = 'object'
    and v_proof->>'id' = s.external_subscription_id and v_proof->>'customer' = s.external_customer_id
    and v_proof->>'externalReference' = 'dentalflow:subscription:' || s.id::text
    and v_proof->>'cycle' = 'MONTHLY' and v_proof->>'status' = 'INACTIVE'
    and v_proof->'deleted' = 'false'::jsonb and jsonb_typeof(v_proof->'value') = 'number'
    and (v_proof->>'value')::numeric * 100 = r.current_amount_cents
    and s.plan_code = r.current_plan_code and s.current_period_end is not distinct from r.paid_period_end
    and s.billing_provider = 'asaas' and s.provider_environment = r.provider_environment
    and public.billing_subscription_contract_amount(s.id) = r.current_amount_cents
    and not public.is_internal_full_access_company(r.clinic_id) then
    v_outcome := 'completed'; v_error := null;
    -- Cancellation stops future renewal. Existing canceled-period access is
    -- governed by subscription_access_mode until the unchanged paid end.
    update public.account_subscriptions set status = 'canceled', canceled_at = coalesce(canceled_at,now()),
      grace_until = null, updated_at = now() where id = s.id;
  end if;
  update public.billing_change_requests set status = v_outcome,
    completed_at = case when v_outcome = 'completed' then now() else null end,
    last_error_code = v_error, execution_lease_until = null where id = r.id;
  update public.billing_cancel_executions set finished_at = now(), outcome = v_outcome,
    error_code = v_error, provider_proof_hash = case when v_outcome = 'completed' then md5(v_proof::text) else null end
    where lease_token = p_lease_token;
  return v_outcome;
end $$;

revoke all on function public.billing_cancel_master_identity() from public, anon, authenticated, service_role;
revoke all on function public.platform_master_claim_cancel_request(uuid,text,text,boolean),
  public.platform_master_begin_cancel_write(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.platform_master_claim_cancel_request(uuid,text,text,boolean),
  public.platform_master_begin_cancel_write(uuid,uuid) to authenticated;
revoke all on function public.billing_finish_cancel_request(uuid,uuid,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.billing_finish_cancel_request(uuid,uuid,jsonb,text) to service_role;
notify pgrst, 'reload schema';

-- Price agreements are append-only by period. Existing rows/paid invoices are
-- not backfilled, repriced or deleted. A provider update does not grant access.
CREATE TABLE public.billing_plan_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES public.billing_change_requests(id),
 subscription_id uuid NOT NULL REFERENCES public.account_subscriptions(id),
 clinic_id uuid NOT NULL REFERENCES public.clinics(id),
 provider_environment text NOT NULL CHECK(provider_environment IN('sandbox','production')),
 effective_date date NOT NULL,
 previous_plan_code text NOT NULL REFERENCES public.billing_plans(code),
 previous_amount_cents integer NOT NULL CHECK(previous_amount_cents>0),
 plan_code text NOT NULL REFERENCES public.billing_plans(code),
 amount_cents integer NOT NULL CHECK(amount_cents>=500),
 quote_snapshot jsonb NOT NULL,
 state text NOT NULL DEFAULT 'scheduled' CHECK(state IN('scheduled','active','review_required')),
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 last_checked_at timestamptz,
 UNIQUE(subscription_id,effective_date)
);
CREATE INDEX billing_plan_periods_due ON public.billing_plan_periods(effective_date,subscription_id) WHERE state<>'active';
CREATE INDEX billing_plan_periods_subscription_date ON public.billing_plan_periods(subscription_id,effective_date DESC);
ALTER TABLE public.billing_plan_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_plan_periods FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.billing_plan_periods TO service_role;

CREATE TABLE public.billing_plan_change_executions (
 lease_token uuid PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES public.billing_change_requests(id),
 actor_user_id uuid NOT NULL REFERENCES auth.users(id),
 actor_session_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 16 AND 300),
 reconcile_only boolean NOT NULL,
 provider_environment text NOT NULL,
 provider_subscription_id text NOT NULL,
 provider_customer_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 provider_write_started_at timestamptz,
 finished_at timestamptz,
 outcome text CHECK(outcome IN('completed','review_required')),
 error_code text,
 provider_proof_hash text
 ,invoice_digest text CHECK(invoice_digest~'^[a-f0-9]{64}$')
 ,invoice_count integer CHECK(invoice_count BETWEEN 0 AND 100)
);
ALTER TABLE public.billing_plan_change_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_plan_change_executions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.billing_plan_change_executions TO service_role;

create or replace function public.billing_subscription_base_amount(p_subscription_id uuid)
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

CREATE FUNCTION public.billing_subscription_period_amount(p_subscription_id uuid,p_due_date date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(
  (SELECT amount_cents FROM public.billing_plan_periods WHERE subscription_id=p_subscription_id
   AND effective_date<=p_due_date ORDER BY effective_date DESC LIMIT 1),
  (SELECT previous_amount_cents FROM public.billing_plan_periods WHERE subscription_id=p_subscription_id ORDER BY effective_date LIMIT 1),
  public.billing_subscription_base_amount(p_subscription_id));
$$;
CREATE OR REPLACE FUNCTION public.billing_subscription_contract_amount(p_subscription_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.billing_subscription_period_amount(p_subscription_id,coalesce(
  (SELECT (period_start AT TIME ZONE 'UTC')::date FROM public.billing_payments
   WHERE subscription_id=p_subscription_id AND provider='asaas' AND status='paid' AND period_start<=now()
   AND provider_environment=(SELECT provider_environment FROM public.account_subscriptions WHERE id=p_subscription_id)
   ORDER BY period_start DESC LIMIT 1),current_date));
$$;
CREATE FUNCTION public.billing_subscription_provider_amount(p_subscription_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT amount_cents FROM public.billing_plan_periods WHERE subscription_id=p_subscription_id
  ORDER BY effective_date DESC LIMIT 1),public.billing_subscription_base_amount(p_subscription_id));
$$;
CREATE FUNCTION public.billing_subscription_price_context(p_subscription_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('provider_amount_cents',public.billing_subscription_provider_amount(p_subscription_id),
  'periods',coalesce((SELECT jsonb_agg(jsonb_build_object('effective_date',effective_date,'amount_cents',amount_cents) ORDER BY effective_date)
   FROM public.billing_plan_periods WHERE subscription_id=p_subscription_id),'[]'::jsonb));
$$;

create or replace function public.billing_change_request_quote_base(
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
CREATE OR REPLACE FUNCTION public.billing_change_request_quote(p_subscription_id uuid,p_kind text,p_target_plan_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q jsonb; BEGIN
 q:=public.billing_change_request_quote_base(p_subscription_id,p_kind,p_target_plan_code);
 IF p_kind='change_plan' AND EXISTS(SELECT 1 FROM public.billing_plan_periods
  WHERE subscription_id=p_subscription_id AND state<>'active') THEN
  q:=jsonb_set(q,'{block_reason}','"scheduled_change"'::jsonb);
 END IF;
 RETURN q;
END $$;

-- A previously authorized possible write can be reconciled after its original
-- time window. This proves the frozen links; it never authorizes another PUT.
CREATE FUNCTION public.billing_plan_request_frozen(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.billing_change_requests r JOIN public.account_subscriptions s ON s.id=r.subscription_id
  WHERE r.id=p_request_id AND r.kind='change_plan' AND s.scope_type='company' AND s.clinic_id=r.clinic_id
  AND s.provider_environment=r.provider_environment AND s.billing_provider='asaas' AND s.billing_cycle='MONTHLY'
  AND NOT public.is_internal_full_access_company(r.clinic_id) AND s.external_subscription_id~'^sub_[A-Za-z0-9]+$'
  AND s.external_customer_id~'^cus_[A-Za-z0-9]+$' AND public.billing_user_can_manage_company(r.clinic_id,r.requested_by)
  AND s.plan_code=r.current_plan_code AND r.target_amount_cents>=500
  AND public.billing_subscription_contract_amount(s.id)=r.current_amount_cents
  AND r.effective_not_before=(date_trunc('day',r.effective_not_before AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'));
$$;
CREATE FUNCTION public.billing_plan_request_ready(p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.billing_change_requests%ROWTYPE; s public.account_subscriptions%ROWTYPE; q jsonb; BEGIN
 SELECT * INTO r FROM public.billing_change_requests WHERE id=p_request_id;
 SELECT * INTO s FROM public.account_subscriptions WHERE id=r.subscription_id;
 IF r.id IS NULL OR r.kind<>'change_plan' OR s.scope_type<>'company' OR s.clinic_id IS DISTINCT FROM r.clinic_id
  OR s.status<>'active' OR s.provider_environment IS DISTINCT FROM r.provider_environment OR s.billing_provider<>'asaas'
  OR s.billing_cycle<>'MONTHLY' OR public.is_internal_full_access_company(r.clinic_id)
  OR NOT public.billing_user_can_manage_company(r.clinic_id,r.requested_by)
  OR s.plan_code IS DISTINCT FROM r.current_plan_code OR s.current_period_end IS DISTINCT FROM r.paid_period_end
  OR s.current_period_end<=now() OR s.current_period_end IS NULL
  OR r.effective_not_before IS DISTINCT FROM s.current_period_end
  OR r.effective_not_before IS DISTINCT FROM (date_trunc('day',r.effective_not_before AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
  OR r.target_amount_cents<500 OR public.billing_subscription_contract_amount(s.id) IS DISTINCT FROM r.current_amount_cents
  OR EXISTS(SELECT 1 FROM public.billing_plan_periods WHERE subscription_id=s.id AND state<>'active') THEN RETURN false; END IF;
 q:=public.billing_change_request_quote(s.id,'change_plan',r.target_plan_code);
 RETURN q->>'block_reason' IS NULL AND q->>'quote_token'=r.quote_token;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE FUNCTION public.platform_master_claim_plan_change(p_request_id uuid,p_environment text,p_reason text,p_reconcile_only boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.billing_change_requests%ROWTYPE; s public.account_subscriptions%ROWTYPE;
 v_session uuid; v_token uuid; v_sub uuid; v_readonly boolean; BEGIN
 v_session:=public.billing_cancel_master_identity();
 IF p_environment IS NULL OR p_environment NOT IN('sandbox','production') OR p_reconcile_only IS NULL
  OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 16 AND 300 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'BILLING_PLAN_INVALID'; END IF;
 SELECT subscription_id INTO v_sub FROM public.billing_change_requests WHERE id=p_request_id;
 SELECT * INTO s FROM public.account_subscriptions WHERE id=v_sub FOR UPDATE;
 SELECT * INTO r FROM public.billing_change_requests WHERE id=p_request_id FOR UPDATE;
 IF r.id IS NULL OR r.kind<>'change_plan' OR r.provider_environment IS DISTINCT FROM p_environment
  OR s.provider_environment IS DISTINCT FROM p_environment THEN RAISE EXCEPTION 'BILLING_PLAN_NOT_ELIGIBLE'; END IF;
 IF r.status='completed' THEN RETURN jsonb_build_object('done',true,'request_id',r.id); END IF;
 IF r.status NOT IN('awaiting_provider','processing','review_required') THEN RAISE EXCEPTION 'BILLING_PLAN_NOT_ELIGIBLE'; END IF;
 IF r.status='processing' AND r.execution_lease_until>now() THEN RAISE EXCEPTION 'BILLING_PLAN_BUSY'; END IF;
 v_readonly:=p_reconcile_only OR r.status<>'awaiting_provider' OR r.provider_write_started_at IS NOT NULL;
 IF (v_readonly AND r.provider_write_started_at IS NOT NULL AND NOT public.billing_plan_request_frozen(r.id))
  OR ((NOT v_readonly OR r.provider_write_started_at IS NULL) AND NOT public.billing_plan_request_ready(r.id)) THEN RAISE EXCEPTION 'BILLING_PLAN_STALE'; END IF;
 v_token:=gen_random_uuid();
 UPDATE public.billing_change_requests SET status='processing',execution_lease_token=v_token,
  execution_lease_until=least(now()+interval '120 seconds',to_timestamp((auth.jwt()->>'exp')::bigint)),
  execution_actor=auth.uid(),execution_session_id=v_session,last_error_code=NULL WHERE id=r.id;
 INSERT INTO public.billing_plan_change_executions(lease_token,request_id,actor_user_id,actor_session_id,reason,reconcile_only,
  provider_environment,provider_subscription_id,provider_customer_id)
 VALUES(v_token,r.id,auth.uid(),v_session,btrim(p_reason),v_readonly,p_environment,s.external_subscription_id,s.external_customer_id);
 RETURN jsonb_build_object('done',false,'request_id',r.id,'lease_token',v_token,'subscription_id',s.id,
  'external_subscription_id',s.external_subscription_id,'external_customer_id',s.external_customer_id,
  'current_amount_cents',r.current_amount_cents,'provider_amount_cents',public.billing_subscription_provider_amount(s.id),'target_amount_cents',r.target_amount_cents,
  'effective_date',(r.effective_not_before AT TIME ZONE 'UTC')::date,'environment',p_environment,'reconcile_only',v_readonly,
  'write_started',r.provider_write_started_at IS NOT NULL);
END $$;

CREATE FUNCTION public.platform_master_begin_plan_change_write(p_request_id uuid,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.billing_change_requests%ROWTYPE; v_session uuid; BEGIN
 v_session:=public.billing_cancel_master_identity();
 PERFORM 1 FROM public.account_subscriptions WHERE id=(SELECT subscription_id FROM public.billing_change_requests WHERE id=p_request_id) FOR UPDATE;
 SELECT * INTO r FROM public.billing_change_requests WHERE id=p_request_id FOR UPDATE;
 IF r.id IS NULL OR r.kind<>'change_plan' OR r.status<>'processing' OR r.execution_lease_token IS DISTINCT FROM p_lease_token
  OR r.execution_lease_until IS NULL OR r.execution_lease_until<=now() OR r.execution_actor IS DISTINCT FROM auth.uid()
  OR r.execution_session_id IS DISTINCT FROM v_session OR r.provider_write_started_at IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM public.billing_plan_change_executions WHERE lease_token=p_lease_token AND request_id=r.id AND NOT reconcile_only)
  OR NOT public.billing_plan_request_ready(r.id) THEN RAISE EXCEPTION 'BILLING_PLAN_WRITE_NOT_AUTHORIZED'; END IF;
 UPDATE public.billing_change_requests SET provider_write_started_at=now() WHERE id=r.id;
 UPDATE public.billing_plan_change_executions SET provider_write_started_at=now() WHERE lease_token=p_lease_token;
 RETURN true;
END $$;

CREATE FUNCTION public.billing_finish_plan_change(p_request_id uuid,p_lease_token uuid,p_verified_subscription jsonb,p_error_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.billing_change_requests%ROWTYPE; s public.account_subscriptions%ROWTYPE; v jsonb:=p_verified_subscription;
 v_outcome text:='review_required'; v_error text:='PROVIDER_REVIEW_REQUIRED'; BEGIN
 SELECT * INTO s FROM public.account_subscriptions WHERE id=(SELECT subscription_id FROM public.billing_change_requests WHERE id=p_request_id) FOR UPDATE;
 SELECT * INTO r FROM public.billing_change_requests WHERE id=p_request_id FOR UPDATE;
 IF r.id IS NULL OR r.kind<>'change_plan' THEN RAISE EXCEPTION 'BILLING_PLAN_NOT_ELIGIBLE'; END IF;
 IF r.status='completed' THEN RETURN 'completed'; END IF;
 IF r.status<>'processing' OR r.execution_lease_token IS DISTINCT FROM p_lease_token OR r.execution_lease_until IS NULL
  OR r.execution_lease_until<=now() OR NOT EXISTS(SELECT 1 FROM public.billing_plan_change_executions e
   WHERE e.lease_token=p_lease_token AND e.request_id=r.id AND e.actor_user_id=r.execution_actor AND e.actor_session_id=r.execution_session_id)
  THEN RAISE EXCEPTION 'BILLING_PLAN_LEASE_LOST'; END IF;
 IF p_error_code IN('PROVIDER_STILL_OLD_PRICE','PROVIDER_RESULT_UNCONFIRMED','PROVIDER_REVIEW_REQUIRED',
  'FUTURE_INVOICE_REVIEW','PROVIDER_CALENDAR_REVIEW') THEN v_error:=p_error_code; END IF;
 IF p_error_code IS NULL AND jsonb_typeof(v)='object'
  AND ((r.provider_write_started_at IS NOT NULL AND public.billing_plan_request_frozen(r.id)) OR public.billing_plan_request_ready(r.id))
  AND v->>'id'=s.external_subscription_id AND v->>'customer'=s.external_customer_id
  AND v->>'externalReference'='dentalflow:subscription:'||s.id::text AND v->>'cycle'='MONTHLY'
  AND v->>'status'='ACTIVE' AND v->'deleted'='false'::jsonb AND v->>'billingType' IN('UNDEFINED','BOLETO','PIX')
  AND v->>'nextDueDate'~'^\d{4}-\d{2}-\d{2}$'
  AND (v->>'nextDueDate'=((r.effective_not_before AT TIME ZONE 'UTC')::date)::text
   OR (r.provider_write_started_at IS NOT NULL AND (v->>'nextDueDate')::date>(r.effective_not_before AT TIME ZONE 'UTC')::date))
  AND v->>'invoice_digest'~'^[a-f0-9]{64}$' AND jsonb_typeof(v->'invoice_count')='number' AND (v->>'invoice_count')::integer BETWEEN 0 AND 100
  AND jsonb_typeof(v->'value')='number' AND (v->>'value')::numeric*100=r.target_amount_cents THEN
  INSERT INTO public.billing_plan_periods(request_id,subscription_id,clinic_id,provider_environment,effective_date,
   previous_plan_code,previous_amount_cents,plan_code,amount_cents,quote_snapshot)
  VALUES(r.id,s.id,s.clinic_id,s.provider_environment,(r.effective_not_before AT TIME ZONE 'UTC')::date,
   r.current_plan_code,r.current_amount_cents,r.target_plan_code,r.target_amount_cents,r.quote_snapshot);
  v_outcome:='completed';v_error:=NULL;
 END IF;
 UPDATE public.billing_change_requests SET status=v_outcome,completed_at=CASE WHEN v_outcome='completed' THEN now() ELSE NULL END,
  execution_lease_until=NULL,last_error_code=v_error WHERE id=r.id;
 UPDATE public.billing_plan_change_executions SET finished_at=now(),outcome=v_outcome,error_code=v_error,
  provider_proof_hash=CASE WHEN v_outcome='completed' THEN md5(v::text) ELSE NULL END,
  invoice_digest=CASE WHEN v_outcome='completed' THEN v->>'invoice_digest' ELSE NULL END,
  invoice_count=CASE WHEN v_outcome='completed' THEN (v->>'invoice_count')::integer ELSE NULL END WHERE lease_token=p_lease_token;
 RETURN v_outcome;
END $$;

CREATE FUNCTION public.billing_refresh_subscription_plan(p_subscription_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.account_subscriptions%ROWTYPE; t public.billing_plan_periods%ROWTYPE; p public.billing_plans%ROWTYPE;
 paid_start timestamptz; paid_amount integer; target_code text; n_members integer; n_sessions integer; n_bytes bigint; capacity bigint; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'BILLING_PLAN_FORBIDDEN'; END IF;
 SELECT * INTO s FROM public.account_subscriptions WHERE id=p_subscription_id FOR UPDATE;
 IF s.id IS NULL OR public.is_internal_full_access_company(s.clinic_id)
  OR NOT EXISTS(SELECT 1 FROM public.billing_plan_periods WHERE subscription_id=s.id) THEN RETURN 'unchanged'; END IF;
 UPDATE public.billing_plan_periods SET last_checked_at=now() WHERE subscription_id=s.id AND state<>'active';
 SELECT period_start,amount_cents INTO paid_start,paid_amount FROM public.billing_payments WHERE subscription_id=s.id AND provider='asaas'
  AND provider_environment=s.provider_environment AND status='paid' AND period_start<=now() AND period_end>now()
  ORDER BY period_start DESC LIMIT 1;
 IF paid_start IS NULL THEN
  IF s.metadata->>'plan_usage_review'='true' THEN
   UPDATE public.account_subscriptions SET status='suspended',updated_at=now() WHERE id=s.id;
   RETURN 'review_required';
  END IF;
  RETURN 'unchanged';
 END IF;
 SELECT * INTO t FROM public.billing_plan_periods WHERE subscription_id=s.id
  AND effective_date<=(paid_start AT TIME ZONE 'UTC')::date ORDER BY effective_date DESC LIMIT 1;
 target_code:=t.plan_code;
 IF target_code IS NULL THEN SELECT previous_plan_code INTO target_code FROM public.billing_plan_periods
  WHERE subscription_id=s.id ORDER BY effective_date LIMIT 1; END IF;
 IF target_code=s.plan_code AND (t.id IS NULL OR t.state='active') THEN RETURN 'unchanged'; END IF;
 SELECT * INTO p FROM public.billing_plans WHERE code=target_code AND account_scope='company';
 SELECT count(*) INTO n_members FROM public.clinic_members WHERE clinic_id=s.clinic_id AND status IN('active','accepted');
 SELECT count(*) INTO n_sessions FROM public.company_sessions WHERE clinic_id=s.clinic_id AND status='active';
 SELECT coalesce(sum(size_bytes),0) INTO n_bytes FROM public.storage_files WHERE clinic_id=s.clinic_id AND status IN('ready','reserved');
 SELECT greatest(p.storage_bytes,coalesce(sum(bytes) FILTER(WHERE entitlement_type IN('base','courtesy')),0),1073741824::bigint)
  +coalesce(sum(bytes) FILTER(WHERE entitlement_type IN('purchase','manual')),0) INTO capacity
 FROM public.clinic_storage_entitlements WHERE clinic_id=s.clinic_id AND status='active' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now());
 IF p.code IS NULL OR NOT p.is_active OR (t.id IS NOT NULL AND paid_amount IS DISTINCT FROM t.amount_cents)
  OR n_bytes>capacity OR (p.max_members>0 AND n_members>p.max_members)
  OR (p.max_sessions>0 AND n_sessions>p.max_sessions) OR (t.id IS NOT NULL AND (
   (t.quote_snapshot->>'target_max_members')::integer IS DISTINCT FROM p.max_members
   OR (t.quote_snapshot->>'target_max_sessions')::integer IS DISTINCT FROM p.max_sessions
   OR t.quote_snapshot->'target_features' IS DISTINCT FROM p.features)) THEN
  IF t.id IS NOT NULL THEN UPDATE public.billing_plan_periods SET state='review_required' WHERE id=t.id; END IF;
  UPDATE public.account_subscriptions SET status='suspended',metadata=metadata||'{"plan_usage_review":true}'::jsonb,updated_at=now() WHERE id=s.id;
  RETURN 'review_required';
 END IF;
 UPDATE public.account_subscriptions SET plan_code=target_code,
  status=CASE WHEN metadata->>'plan_usage_review'='true' AND status='suspended' THEN CASE WHEN canceled_at IS NOT NULL THEN 'canceled' ELSE 'active' END ELSE status END,
  metadata=metadata-'plan_usage_review',updated_at=now() WHERE id=s.id;
 IF t.id IS NOT NULL THEN UPDATE public.billing_plan_periods SET state='active',activated_at=coalesce(activated_at,now()) WHERE id=t.id; END IF;
 RETURN 'activated';
END $$;

CREATE FUNCTION public.billing_refresh_due_plan_periods(p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c record; result text; activated integer:=0; review integer:=0; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_environment IS NULL OR p_environment NOT IN('sandbox','production') THEN RAISE EXCEPTION 'BILLING_PLAN_FORBIDDEN'; END IF;
 FOR c IN SELECT s.id FROM public.account_subscriptions s WHERE s.provider_environment=p_environment
  AND EXISTS(SELECT 1 FROM public.billing_plan_periods t WHERE t.subscription_id=s.id AND t.effective_date<=current_date AND t.state<>'active')
  ORDER BY (SELECT min(coalesce(t.last_checked_at,'-infinity'::timestamptz)) FROM public.billing_plan_periods t
   WHERE t.subscription_id=s.id AND t.state<>'active'),s.id LIMIT 10 FOR UPDATE OF s SKIP LOCKED LOOP
  result:=public.billing_refresh_subscription_plan(c.id);
  IF result='activated' THEN activated:=activated+1; ELSIF result='review_required' THEN review:=review+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('activated',activated,'review',review);
END $$;

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
    or (v_action <> 'reversed' and public.billing_subscription_period_amount(v_sub.id,p_due_date) is distinct from p_amount_cents) then
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
      if (v_sub.status = 'canceled' OR v_sub.canceled_at IS NOT NULL) or v_sub.current_period_end is null
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
  IF EXISTS(SELECT 1 FROM public.billing_plan_periods WHERE subscription_id=v_sub.id) THEN
    perform public.billing_refresh_subscription_plan(v_sub.id);
  END IF;
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
      and public.billing_subscription_provider_amount(v_sub.id) is distinct from p_amount_cents) then
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
create or replace function public.billing_change_request_summary(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('id',r.id,'subscription_id',r.subscription_id,'kind',r.kind,
    'status',r.status,'provider_environment',r.provider_environment,
    'current_plan_name',r.current_plan_name,'current_amount_cents',r.current_amount_cents,
    'target_plan_name',r.target_plan_name,'target_amount_cents',r.target_amount_cents,
    'currency',r.currency,'paid_period_end',r.paid_period_end,
    'effective_not_before',r.effective_not_before,'created_at',r.created_at,'withdrawn_at',r.withdrawn_at,
    'completed_at',r.completed_at,'last_error_code',r.last_error_code,
    'can_withdraw',r.status='awaiting_provider' OR (r.kind='change_plan' AND r.status='review_required' AND r.provider_write_started_at IS NULL),
    'plan_activation_state',(SELECT state FROM public.billing_plan_periods WHERE request_id=r.id))
  from public.billing_change_requests r where r.id = p_request_id;
$$;
create or replace function public.platform_master_claim_cancel_request(
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
    'external_customer_id',s.external_customer_id,'amount_cents',public.billing_subscription_provider_amount(s.id),
    'environment',p_environment,'reconcile_only',v_readonly);
end $$;

create or replace function public.billing_finish_cancel_request(
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
    and (v_proof->>'value')::numeric * 100 = public.billing_subscription_provider_amount(s.id)
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
  if r.status = 'awaiting_provider' OR (r.kind='change_plan' AND r.status='review_required' AND r.provider_write_started_at IS NULL) then
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
    where (r.status in ('awaiting_provider','processing','review_required') OR (r.status='completed' AND EXISTS(SELECT 1 FROM public.billing_plan_periods p WHERE p.request_id=r.id AND p.state='review_required')))
      and (v_search = '' or c.name ilike '%' || v_search || '%')
    order by r.created_at, r.id limit 50
  ) r;
  return v_result;
end $$;

REVOKE ALL ON FUNCTION public.billing_subscription_base_amount(uuid),public.billing_subscription_period_amount(uuid,date),
 public.billing_subscription_contract_amount(uuid),public.billing_subscription_provider_amount(uuid),public.billing_subscription_price_context(uuid),
 public.billing_change_request_quote_base(uuid,text,text),public.billing_plan_request_frozen(uuid),public.billing_plan_request_ready(uuid),
 public.platform_master_claim_plan_change(uuid,text,text,boolean),public.platform_master_begin_plan_change_write(uuid,uuid),
 public.billing_finish_plan_change(uuid,uuid,jsonb,text),public.billing_refresh_subscription_plan(uuid),public.billing_refresh_due_plan_periods(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.billing_subscription_period_amount(uuid,date),public.billing_subscription_contract_amount(uuid),
 public.billing_subscription_provider_amount(uuid),public.billing_subscription_price_context(uuid),public.billing_finish_plan_change(uuid,uuid,jsonb,text),
 public.billing_refresh_subscription_plan(uuid),public.billing_refresh_due_plan_periods(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_master_claim_plan_change(uuid,text,text,boolean),public.platform_master_begin_plan_change_write(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

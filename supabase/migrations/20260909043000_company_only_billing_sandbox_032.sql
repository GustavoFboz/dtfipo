-- DentalFlow 0.3.2 — company-only billing and controlled subscription sandbox.
-- Company accounts are the only billable accounts. Professional accounts are company seats.

update public.billing_plans
set is_active = false,
    updated_at = now()
where code = 'professional';

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.account_subscriptions(id) on delete cascade,
  checkout_intent_id uuid references public.checkout_intents(id) on delete set null,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null check (status in ('pending','paid','failed','refunded','canceled')),
  provider text,
  provider_payment_id text,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create index if not exists billing_payments_subscription_idx
  on public.billing_payments(subscription_id, created_at desc);

-- Test-mode capability is server-managed. No browser can enable itself.
create table if not exists public.billing_test_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled_until timestamptz not null,
  created_at timestamptz not null default now(),
  created_by text not null default 'manual'
);

alter table public.billing_payments enable row level security;
alter table public.billing_test_access enable row level security;

drop policy if exists billing_payments_company_read on public.billing_payments;
create policy billing_payments_company_read on public.billing_payments
for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=billing_payments.clinic_id and c.owner_id=auth.uid())
  or public.active_company_member(billing_payments.clinic_id,auth.uid())
);
-- billing_test_access intentionally has no client table policy.

grant select on public.billing_payments to authenticated;

create or replace function public.subscription_access_mode(
  _status text,
  _period_end timestamptz,
  _grace_until timestamptz
) returns text
language sql stable as $$
  select case
    when _status='trialing' and (_period_end is null or _period_end >= now()) then 'full'
    when _status='active' and _period_end is not null and _period_end >= now() then 'full'
    when _status in ('past_due','grace') and _grace_until is not null and _grace_until >= now() then 'full'
    when _status='canceled' and _period_end is not null and _period_end >= now() then 'full'
    else 'billing_only'
  end
$$;

create or replace function public.my_subscription_context()
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  pr public.profiles%rowtype;
  company_ctx jsonb;
  profession text;
begin
  if auth.uid() is null then return null; end if;
  select * into pr from public.profiles where id=auth.uid();
  if pr.id is null then return jsonb_build_object('account_type','unclassified','effective_access','billing_only'); end if;

  profession := coalesce(pr.profession_type,pr.account_subtype,pr.role);

  if pr.clinic_id is null then
    return jsonb_build_object(
      'account_type',coalesce(pr.account_type,'unclassified'),
      'effective_access',case when coalesce(pr.account_type,'')='professional' then 'needs_company_link' else 'billing_only' end,
      'active_clinic_id',null,
      'professional_profile',jsonb_build_object('profession_type',profession)
    );
  end if;

  company_ctx := public.company_subscription_snapshot(pr.clinic_id);
  return jsonb_build_object(
    'account_type',coalesce(pr.account_type,'company_member'),
    'effective_access',coalesce(company_ctx->>'access_mode','billing_only'),
    'active_clinic_id',pr.clinic_id,
    'company',company_ctx,
    'professional_profile',case when coalesce(pr.account_type,'')='professional'
      then jsonb_build_object('profession_type',profession) else null end
  );
end $$;

-- Only company plans can create checkout intents. A pending upgrade never changes live entitlements.
create or replace function public.create_checkout_intent(
  p_plan_code text,
  p_clinic_id uuid,
  p_session_types text[] default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  plan public.billing_plans%rowtype;
  sub public.account_subscriptions%rowtype;
  intent public.checkout_intents%rowtype;
  is_manager boolean;
  requested text[];
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if p_clinic_id is null then raise exception 'Empresa inválida.'; end if;

  select * into plan from public.billing_plans
  where code=p_plan_code and account_scope='company' and is_active;
  if plan.code is null then raise exception 'Plano empresarial inválido.'; end if;

  select exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.status in ('active','accepted') and upper(m.role) in ('CEO','ADMIN'))
  into is_manager;
  if not is_manager then raise exception 'Sem permissão para alterar a assinatura.'; end if;

  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into requested
  from unnest(coalesce(p_session_types,'{}'::text[])) x
  where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(requested)>plan.max_sessions then raise exception 'O plano selecionado permite no máximo % ambiente(s).',plan.max_sessions; end if;

  select * into sub from public.account_subscriptions
  where clinic_id=p_clinic_id and status<>'canceled'
  order by created_at desc limit 1;

  if sub.id is null then
    insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
    values('company',p_clinic_id,p_plan_code,'pending_checkout',least(28,extract(day from now())::int))
    returning * into sub;
  elsif sub.status='pending_checkout' then
    update public.account_subscriptions set plan_code=p_plan_code,updated_at=now() where id=sub.id returning * into sub;
  end if;

  update public.checkout_intents
  set status='expired',updated_at=now()
  where user_id=auth.uid() and clinic_id=p_clinic_id and status='pending' and expires_at<now();

  insert into public.checkout_intents(
    user_id,clinic_id,subscription_id,plan_code,amount_cents,currency,status,metadata
  ) values(
    auth.uid(),p_clinic_id,sub.id,p_plan_code,plan.monthly_price_cents,plan.currency,'pending',
    jsonb_build_object('requested_sessions',coalesce(to_jsonb(requested),'[]'::jsonb),'billing_version','0.3.2')
  ) returning * into intent;

  return jsonb_build_object(
    'checkout_intent_id',intent.id,
    'subscription_id',sub.id,
    'plan_code',plan.code,
    'plan_name',plan.name,
    'amount_cents',plan.monthly_price_cents,
    'currency',plan.currency,
    'status',intent.status,
    'billing_mode','live'
  );
end $$;

-- Provider/webhook entrypoint for a successful checkout. This is the only place that applies a paid upgrade.
create or replace function public.billing_apply_checkout_paid(
  p_checkout_intent_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_period_start timestamptz default now(),
  p_period_end timestamptz default (now()+interval '1 month')
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  intent public.checkout_intents%rowtype;
  sub public.account_subscriptions%rowtype;
  plan public.billing_plans%rowtype;
  requested text[];
begin
  select * into intent from public.checkout_intents where id=p_checkout_intent_id for update;
  if intent.id is null then raise exception 'Checkout não encontrado.'; end if;
  if intent.status='paid' then
    select * into sub from public.account_subscriptions where id=intent.subscription_id;
    return jsonb_build_object('subscription_id',sub.id,'status',sub.status,'idempotent',true);
  end if;
  if intent.status not in ('pending','provider_created') then raise exception 'Checkout não está disponível para pagamento.'; end if;

  select * into plan from public.billing_plans where code=intent.plan_code and account_scope='company';
  if plan.code is null then raise exception 'Plano do checkout não existe.'; end if;
  if p_period_end<=p_period_start then raise exception 'Período de assinatura inválido.'; end if;

  update public.account_subscriptions set
    plan_code=intent.plan_code,
    status='active',
    current_period_start=p_period_start,
    current_period_end=p_period_end,
    grace_until=null,
    billing_provider=p_provider,
    external_customer_id=coalesce(p_provider_customer_id,external_customer_id),
    external_subscription_id=coalesce(p_provider_subscription_id,external_subscription_id),
    updated_at=now()
  where id=intent.subscription_id returning * into sub;

  update public.checkout_intents set
    status='paid',billing_provider=p_provider,provider_checkout_id=coalesce(provider_checkout_id,p_provider_payment_id),updated_at=now()
  where id=intent.id;

  insert into public.billing_payments(
    subscription_id,checkout_intent_id,clinic_id,amount_cents,currency,status,provider,provider_payment_id,paid_at,period_start,period_end
  ) values(
    sub.id,intent.id,intent.clinic_id,intent.amount_cents,intent.currency,'paid',p_provider,p_provider_payment_id,now(),p_period_start,p_period_end
  ) on conflict(provider,provider_payment_id) do nothing;

  update public.clinics set storage_limit_bytes=plan.storage_bytes where id=intent.clinic_id;

  select coalesce(array_agg(value::text),'{}'::text[]) into requested
  from jsonb_array_elements_text(coalesce(intent.metadata->'requested_sessions','[]'::jsonb));
  if cardinality(requested)>0 then
    update public.company_sessions set status='disabled' where clinic_id=intent.clinic_id and not(session_type=any(requested));
    insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
    select intent.clinic_id,x,'active',case when plan.max_sessions>1 then 'company' else 'isolated' end
    from unnest(requested) x
    on conflict(clinic_id,session_type) do update set status='active',sharing_mode=excluded.sharing_mode,updated_at=now();
  end if;

  return jsonb_build_object(
    'subscription_id',sub.id,
    'status','active',
    'current_period_end',sub.current_period_end,
    'context',public.company_subscription_snapshot(intent.clinic_id)
  );
end $$;

revoke all on function public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz) to service_role;

-- Renewal/failure state entrypoint remains service-role only.
create or replace function public.billing_apply_subscription_state(
  p_subscription_id uuid,
  p_status text,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_grace_until timestamptz default null,
  p_provider text default null,
  p_external_customer_id text default null,
  p_external_subscription_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.account_subscriptions%rowtype;
begin
  if p_status not in ('pending_checkout','trialing','active','past_due','grace','suspended','canceled') then raise exception 'Status de cobrança inválido.'; end if;
  update public.account_subscriptions set
    status=p_status,
    current_period_start=coalesce(p_period_start,current_period_start),
    current_period_end=coalesce(p_period_end,current_period_end),
    grace_until=p_grace_until,
    billing_provider=coalesce(p_provider,billing_provider),
    external_customer_id=coalesce(p_external_customer_id,external_customer_id),
    external_subscription_id=coalesce(p_external_subscription_id,external_subscription_id),
    canceled_at=case when p_status='canceled' then now() else canceled_at end,
    updated_at=now()
  where id=p_subscription_id returning * into s;
  if s.id is null then raise exception 'Assinatura não encontrada.'; end if;
  return jsonb_build_object('subscription_id',s.id,'status',s.status,'access_mode',public.subscription_access_mode(s.status,s.current_period_end,s.grace_until));
end $$;
revoke all on function public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text) to service_role;

create or replace function public.create_professional_account(
  p_full_name text,
  p_profession_type text,
  p_invite_code text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  target public.clinics%rowtype;
  company_sub public.account_subscriptions%rowtype;
  company_plan public.billing_plans%rowtype;
  profession text:=upper(trim(coalesce(p_profession_type,'OUTRO')));
  profile_role text;
  app_role_value text;
  member_count integer;
  other_company_count integer;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_invite_code,'')))<4 then return jsonb_build_object('success',false,'error','Informe o código da empresa.'); end if;
  if profession not in ('DENTISTA','CADISTA','PROTETICO','ATENDIMENTO','RADIOLOGISTA','OUTRO') then profession:='OUTRO'; end if;

  select * into target from public.clinics where upper(trim(invite_code))=upper(trim(p_invite_code)) limit 1;
  if target.id is null then return jsonb_build_object('success',false,'error','Código de empresa inválido.'); end if;

  select * into company_sub from public.account_subscriptions
  where clinic_id=target.id and status<>'canceled' order by created_at desc limit 1;
  if company_sub.id is null then return jsonb_build_object('success',false,'error','A empresa não possui assinatura configurada.'); end if;
  select * into company_plan from public.billing_plans where code=company_sub.plan_code and account_scope='company';
  if public.subscription_access_mode(company_sub.status,company_sub.current_period_end,company_sub.grace_until)<>'full' then
    return jsonb_build_object('success',false,'error','A assinatura desta empresa precisa estar ativa.');
  end if;

  select count(*) into other_company_count from public.clinic_members
  where user_id=uid and status in ('active','accepted') and clinic_id<>target.id;
  if other_company_count>0 then return jsonb_build_object('success',false,'error','Uma conta profissional só pode pertencer a uma empresa.'); end if;

  select count(*) into member_count from public.clinic_members where clinic_id=target.id and status in ('active','accepted') and user_id<>uid;
  if company_plan.max_members>0 and member_count>=company_plan.max_members then
    return jsonb_build_object('success',false,'error','A empresa atingiu o limite de membros do plano.');
  end if;

  profile_role:=case profession when 'DENTISTA' then 'DR' when 'CADISTA' then 'CADISTA' when 'PROTETICO' then 'PROTETICO' when 'ATENDIMENTO' then 'ATENDIMENTO' when 'RADIOLOGISTA' then 'USER' else 'USER' end;
  app_role_value:=case profession when 'DENTISTA' then 'dentista' when 'CADISTA' then 'cadista' when 'PROTETICO' then 'protetico' when 'ATENDIMENTO' then 'recepcionista' else 'auxiliar' end;

  insert into public.profiles(id,full_name,role,account_subtype,account_type,profession_type,is_default_admin,clinic_id)
  values(uid,nullif(trim(p_full_name),''),profile_role,profile_role,'professional',profession,false,target.id)
  on conflict(id) do update set
    full_name=coalesce(excluded.full_name,profiles.full_name),role=profile_role,account_subtype=profile_role,
    account_type='professional',profession_type=profession,is_default_admin=false,clinic_id=target.id,updated_at=now();

  insert into public.clinic_members(clinic_id,user_id,role,status,decided_by,decided_at,access_source)
  values(target.id,uid,profile_role,'active',target.owner_id,now(),'company_seat')
  on conflict(clinic_id,user_id) do update set role=excluded.role,status='active',decided_by=excluded.decided_by,decided_at=now(),access_source='company_seat';

  delete from public.user_roles where user_id=uid;
  insert into public.user_roles(user_id,role) values(uid,app_role_value::public.app_role) on conflict(user_id,role) do nothing;

  if profession='CADISTA' then
    insert into public.cadistas(name,user_id) values(coalesce(nullif(trim(p_full_name),''),'Cadista'),uid)
    on conflict(user_id) do update set name=excluded.name;
  elsif profession='DENTISTA' then
    insert into public.doctors(name,user_id) values(coalesce(nullif(trim(p_full_name),''),'Dentista'),uid)
    on conflict(user_id) do update set name=excluded.name;
  elsif profession='PROTETICO' then
    insert into public.proteticos(name,user_id) values(coalesce(nullif(trim(p_full_name),''),'Protético'),uid)
    on conflict(user_id) do update set name=excluded.name;
  end if;

  return jsonb_build_object('success',true,'clinic_id',target.id,'clinic_name',target.name,'role',profile_role,'profession_type',profession,'context',public.my_subscription_context());
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

drop function if exists public.create_professional_account(text,text);
grant execute on function public.create_professional_account(text,text,text) to authenticated;

-- Existing recovery link is now one-company-only and has no professional billing dependency.
create or replace function public.link_professional_company(p_invite_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  pr public.profiles%rowtype;
  result jsonb;
begin
  select * into pr from public.profiles where id=uid;
  if pr.id is null or coalesce(pr.account_type,'')<>'professional' then return jsonb_build_object('success',false,'error','Conta profissional necessária.'); end if;
  if pr.clinic_id is not null then return jsonb_build_object('success',false,'error','Sua conta profissional já está vinculada a uma empresa.'); end if;
  result:=public.create_professional_account(pr.full_name,coalesce(pr.profession_type,pr.account_subtype,pr.role,'OUTRO'),p_invite_code);
  return result;
end $$;
grant execute on function public.link_professional_company(text) to authenticated;

create or replace function public.billing_test_capability()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'enabled',exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()),
    'until',(select t.enabled_until from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now() limit 1)
  )
$$;
grant execute on function public.billing_test_capability() to authenticated;

create or replace function public.billing_test_mark_checkout_paid(p_checkout_intent_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare allowed boolean; intent public.checkout_intents%rowtype; result jsonb;
begin
  select exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()) into allowed;
  if not allowed then return jsonb_build_object('success',false,'error','Modo de teste não autorizado.'); end if;
  select * into intent from public.checkout_intents where id=p_checkout_intent_id and user_id=auth.uid();
  if intent.id is null then return jsonb_build_object('success',false,'error','Checkout não encontrado.'); end if;
  result:=public.billing_apply_checkout_paid(intent.id,'sandbox','sandbox-'||intent.id::text,null,'sandbox-sub-'||intent.subscription_id::text,now(),now()+interval '30 days');
  return jsonb_build_object('success',true,'subscription_id',intent.subscription_id,'current_period_end',result->>'current_period_end','context',public.my_subscription_context());
exception when others then return jsonb_build_object('success',false,'error',sqlerrm); end $$;
grant execute on function public.billing_test_mark_checkout_paid(uuid) to authenticated;

create or replace function public.billing_test_simulate_nonpayment(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare allowed boolean; sub_id uuid;
begin
  select exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()) into allowed;
  if not allowed then return jsonb_build_object('success',false,'error','Modo de teste não autorizado.'); end if;
  if not exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid()) then return jsonb_build_object('success',false,'error','Somente o administrador da empresa pode simular cobrança.'); end if;
  select id into sub_id from public.account_subscriptions where clinic_id=p_clinic_id and status<>'canceled' order by created_at desc limit 1;
  if sub_id is null then return jsonb_build_object('success',false,'error','Assinatura não encontrada.'); end if;
  update public.account_subscriptions set status='past_due',current_period_end=now()-interval '1 second',grace_until=null,updated_at=now() where id=sub_id;
  return jsonb_build_object('success',true,'context',public.my_subscription_context());
exception when others then return jsonb_build_object('success',false,'error',sqlerrm); end $$;
grant execute on function public.billing_test_simulate_nonpayment(uuid) to authenticated;

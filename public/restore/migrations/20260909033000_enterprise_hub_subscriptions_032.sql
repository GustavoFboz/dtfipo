-- DentalFlow 0.3.2 — Enterprise Hub / subscription foundation
-- Payment-provider agnostic by design. Billing state is authoritative on the server.

create table if not exists public.billing_plans (
  code text primary key,
  account_scope text not null check (account_scope in ('professional','company')),
  name text not null,
  description text,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  currency text not null default 'BRL',
  max_sessions integer not null default 0 check (max_sessions between 0 and 3),
  max_members integer not null default 0 check (max_members >= 0),
  max_company_links integer not null default 0 check (max_company_links >= 0),
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.billing_plans
  (code, account_scope, name, description, monthly_price_cents, max_sessions, max_members, max_company_links, storage_bytes, features, display_order)
values
  (
    'professional', 'professional', 'Profissional',
    'Para dentistas, CADISTAs, protéticos e outros profissionais que trabalham vinculados a empresas DentalFlow.',
    8900, 0, 0, 2, 0,
    '{"independent_workspace":false,"cross_company_dashboard":true,"notifications":true,"professional_profile":true}'::jsonb,
    10
  ),
  (
    'company_initial', 'company', 'Empresa Inicial',
    'Uma sessão empresarial completa para começar com operação, equipe e dados centralizados.',
    24900, 1, 8, 0, 26843545600,
    '{"cross_session_sharing":false,"advanced_audit":false,"priority_support":false,"dicom":true,"full_session_features":true}'::jsonb,
    20
  ),
  (
    'company_growth', 'company', 'Empresa Crescimento',
    'Duas sessões integradas, mais equipe e capacidade para operações em expansão.',
    44900, 2, 20, 0, 107374182400,
    '{"cross_session_sharing":true,"advanced_audit":true,"priority_support":false,"dicom":true,"full_session_features":true}'::jsonb,
    30
  ),
  (
    'company_advanced', 'company', 'Empresa Avançado',
    'Hub empresarial completo com Clínica, Laboratório e Radiologia integrados.',
    74900, 3, 50, 0, 536870912000,
    '{"cross_session_sharing":true,"advanced_audit":true,"priority_support":true,"dicom":true,"full_session_features":true,"all_sessions":true}'::jsonb,
    40
  )
on conflict (code) do update set
  account_scope = excluded.account_scope,
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  max_sessions = excluded.max_sessions,
  max_members = excluded.max_members,
  max_company_links = excluded.max_company_links,
  storage_bytes = excluded.storage_bytes,
  features = excluded.features,
  is_active = true,
  display_order = excluded.display_order,
  updated_at = now();

alter table public.profiles add column if not exists account_type text;
alter table public.profiles add column if not exists profession_type text;
alter table public.clinic_members add column if not exists access_source text not null default 'company_seat';

create table if not exists public.professional_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profession_type text not null,
  status text not null default 'pending_checkout' check (status in ('pending_checkout','active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  session_type text not null check (session_type in ('laboratory','clinic','radiology')),
  status text not null default 'active' check (status in ('active','disabled')),
  sharing_mode text not null default 'company' check (sharing_mode in ('isolated','company')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, session_type)
);

create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('professional','company')),
  user_id uuid references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  plan_code text not null references public.billing_plans(code),
  status text not null default 'pending_checkout' check (status in ('pending_checkout','trialing','active','past_due','grace','suspended','canceled')),
  billing_day smallint check (billing_day between 1 and 28),
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  canceled_at timestamptz,
  billing_provider text,
  external_customer_id text,
  external_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope_type = 'professional' and user_id is not null and clinic_id is null)
    or (scope_type = 'company' and clinic_id is not null and user_id is null)
  )
);

create unique index if not exists account_subscriptions_company_one_current
  on public.account_subscriptions(clinic_id)
  where clinic_id is not null and status <> 'canceled';
create unique index if not exists account_subscriptions_professional_one_current
  on public.account_subscriptions(user_id)
  where user_id is not null and status <> 'canceled';
create index if not exists account_subscriptions_status_idx on public.account_subscriptions(status, current_period_end);

create table if not exists public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  subscription_id uuid not null references public.account_subscriptions(id) on delete cascade,
  plan_code text not null references public.billing_plans(code),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null default 'pending' check (status in ('pending','provider_created','paid','expired','canceled','failed')),
  billing_provider text,
  provider_checkout_id text,
  success_url text,
  cancel_url text,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checkout_intents_user_idx on public.checkout_intents(user_id, created_at desc);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, provider_event_id)
);

-- Radiology metadata: patient-linked DICOM studies. Binary objects remain in private storage.
create table if not exists public.radiology_studies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  study_instance_uid text not null,
  accession_number text,
  modality text,
  study_description text,
  study_date date,
  patient_external_id text,
  status text not null default 'received' check (status in ('received','processing','ready','reported','archived','error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(clinic_id, study_instance_uid)
);

create table if not exists public.radiology_series (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.radiology_studies(id) on delete cascade,
  series_instance_uid text not null,
  modality text,
  series_number integer,
  description text,
  instance_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(study_id, series_instance_uid)
);

create table if not exists public.radiology_instances (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.radiology_series(id) on delete cascade,
  sop_instance_uid text not null,
  sop_class_uid text,
  instance_number integer,
  storage_path text not null,
  byte_size bigint not null default 0,
  checksum_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(series_id, sop_instance_uid)
);

create or replace function public.df_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='trg_billing_plans_touch') then
    create trigger trg_billing_plans_touch before update on public.billing_plans for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_professional_accounts_touch') then
    create trigger trg_professional_accounts_touch before update on public.professional_accounts for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_company_sessions_touch') then
    create trigger trg_company_sessions_touch before update on public.company_sessions for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_account_subscriptions_touch') then
    create trigger trg_account_subscriptions_touch before update on public.account_subscriptions for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_checkout_intents_touch') then
    create trigger trg_checkout_intents_touch before update on public.checkout_intents for each row execute function public.df_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_radiology_studies_touch') then
    create trigger trg_radiology_studies_touch before update on public.radiology_studies for each row execute function public.df_touch_updated_at();
  end if;
end $$;

create or replace function public.subscription_access_mode(
  _status text,
  _period_end timestamptz,
  _grace_until timestamptz
) returns text
language sql stable as $$
  select case
    when _status in ('active','trialing') then 'full'
    when _status in ('past_due','grace') and coalesce(_grace_until, now()) >= now() then 'full'
    when _status = 'canceled' and coalesce(_period_end, now() - interval '1 second') >= now() then 'full'
    when _status in ('suspended','canceled','past_due','grace') then 'read_only'
    else 'billing_only'
  end
$$;

create or replace function public.company_subscription_snapshot(_clinic_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  allowed boolean;
begin
  select exists (
    select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid()
  ) or exists (
    select 1 from public.clinic_members m where m.clinic_id=_clinic_id and m.user_id=auth.uid() and m.status='accepted'
  ) or exists (
    select 1 from public.profiles pr where pr.id=auth.uid() and pr.clinic_id=_clinic_id
  ) into allowed;
  if not allowed then return null; end if;

  select * into s from public.account_subscriptions
   where clinic_id=_clinic_id and status <> 'canceled'
   order by created_at desc limit 1;
  if s.id is null then
    select * into s from public.account_subscriptions
     where clinic_id=_clinic_id order by created_at desc limit 1;
  end if;
  if s.id is null then return null; end if;
  select * into p from public.billing_plans where code=s.plan_code;

  return jsonb_build_object(
    'subscription_id',s.id,'scope','company','plan_code',p.code,'plan_name',p.name,
    'status',s.status,'access_mode',public.subscription_access_mode(s.status,s.current_period_end,s.grace_until),
    'billing_day',s.billing_day,'current_period_end',s.current_period_end,'grace_until',s.grace_until,
    'monthly_price_cents',p.monthly_price_cents,'currency',p.currency,
    'max_sessions',p.max_sessions,'max_members',p.max_members,'storage_bytes',p.storage_bytes,'features',p.features,
    'sessions',coalesce((select jsonb_agg(cs.session_type order by cs.session_type) from public.company_sessions cs where cs.clinic_id=_clinic_id and cs.status='active'),'[]'::jsonb)
  );
end $$;

create or replace function public.my_subscription_context()
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  pr public.profiles%rowtype;
  pa public.professional_accounts%rowtype;
  ps public.account_subscriptions%rowtype;
  pp public.billing_plans%rowtype;
  company_ctx jsonb;
  professional_ctx jsonb;
  effective text;
begin
  if auth.uid() is null then return null; end if;
  select * into pr from public.profiles where id=auth.uid();

  if coalesce(pr.account_type,'')='professional' then
    select * into pa from public.professional_accounts where user_id=auth.uid();
    select * into ps from public.account_subscriptions where user_id=auth.uid() order by created_at desc limit 1;
    if ps.id is not null then
      select * into pp from public.billing_plans where code=ps.plan_code;
      professional_ctx := jsonb_build_object(
        'subscription_id',ps.id,'plan_code',pp.code,'plan_name',pp.name,'status',ps.status,
        'access_mode',public.subscription_access_mode(ps.status,ps.current_period_end,ps.grace_until),
        'monthly_price_cents',pp.monthly_price_cents,'max_company_links',pp.max_company_links,
        'profession_type',pa.profession_type
      );
    end if;
    if pr.clinic_id is not null then company_ctx := public.company_subscription_snapshot(pr.clinic_id); end if;
    effective := coalesce(professional_ctx->>'access_mode','billing_only');
    if pr.clinic_id is null and effective='full' then effective := 'needs_company_link'; end if;
    if company_ctx is not null and (company_ctx->>'access_mode') <> 'full' then effective := company_ctx->>'access_mode'; end if;
    return jsonb_build_object('account_type','professional','effective_access',effective,'professional',professional_ctx,'company',company_ctx,'active_clinic_id',pr.clinic_id);
  end if;

  if pr.clinic_id is not null then
    company_ctx := public.company_subscription_snapshot(pr.clinic_id);
    return jsonb_build_object('account_type',coalesce(pr.account_type,'company_member'),'effective_access',coalesce(company_ctx->>'access_mode','billing_only'),'company',company_ctx,'active_clinic_id',pr.clinic_id);
  end if;
  return jsonb_build_object('account_type',coalesce(pr.account_type,'unclassified'),'effective_access','billing_only');
end $$;

create or replace function public.sync_company_session_modules()
returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  cid := coalesce(new.clinic_id, old.clinic_id);
  update public.clinics c
  set modules_enabled = (
    select array(
      select distinct x from (
        select unnest(coalesce(c.modules_enabled,'{}'::text[])) x
        union all select 'laboratory' where exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='laboratory' and s.status='active')
        union all select 'clinical' where exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='clinic' and s.status='active')
        union all select 'radiology' where exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='radiology' and s.status='active')
      ) q where x not in ('laboratory','clinical','radiology')
         or (x='laboratory' and exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='laboratory' and s.status='active'))
         or (x='clinical' and exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='clinic' and s.status='active'))
         or (x='radiology' and exists(select 1 from public.company_sessions s where s.clinic_id=cid and s.session_type='radiology' and s.status='active'))
    )
  ), updated_at=now()
  where c.id=cid;
  return coalesce(new,old);
end $$;

drop trigger if exists trg_sync_company_session_modules on public.company_sessions;
create trigger trg_sync_company_session_modules after insert or update or delete on public.company_sessions
for each row execute function public.sync_company_session_modules();

create or replace function public.configure_company_sessions(p_clinic_id uuid, p_session_types text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  max_allowed integer;
  normalized text[];
  is_manager boolean;
begin
  select exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.status='accepted' and upper(m.role) in ('CEO','ADMIN'))
    into is_manager;
  if not is_manager then raise exception 'Sem permissão para configurar os ambientes.'; end if;

  select bp.max_sessions into max_allowed
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=p_clinic_id and s.status <> 'canceled'
  order by s.created_at desc limit 1;
  if max_allowed is null then raise exception 'Plano empresarial não encontrado.'; end if;

  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into normalized from unnest(coalesce(p_session_types,'{}'::text[])) x where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(normalized)=0 then raise exception 'Selecione ao menos um ambiente.'; end if;
  if cardinality(normalized)>max_allowed then raise exception 'Seu plano permite no máximo % ambiente(s).',max_allowed; end if;

  update public.company_sessions set status='disabled' where clinic_id=p_clinic_id and not(session_type=any(normalized));
  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select p_clinic_id,x,'active',case when max_allowed>1 then 'company' else 'isolated' end from unnest(normalized) x
  on conflict(clinic_id,session_type) do update set status='active',sharing_mode=excluded.sharing_mode,updated_at=now();
  return public.company_subscription_snapshot(p_clinic_id);
end $$;

create or replace function public.create_checkout_intent(p_plan_code text, p_clinic_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  plan public.billing_plans%rowtype;
  sub public.account_subscriptions%rowtype;
  intent public.checkout_intents%rowtype;
  scope text;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  select * into plan from public.billing_plans where code=p_plan_code and is_active;
  if plan.code is null then raise exception 'Plano inválido.'; end if;
  scope := plan.account_scope;

  if scope='company' then
    if p_clinic_id is null or not exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid()) then raise exception 'Empresa inválida.'; end if;
    select * into sub from public.account_subscriptions where clinic_id=p_clinic_id and status <> 'canceled' order by created_at desc limit 1;
    if sub.id is null then
      insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
      values('company',p_clinic_id,p_plan_code,'pending_checkout',least(28,extract(day from now())::int)) returning * into sub;
    else
      update public.account_subscriptions set plan_code=p_plan_code,status=case when status='pending_checkout' then status else status end where id=sub.id returning * into sub;
    end if;
  else
    if p_clinic_id is not null then raise exception 'Plano profissional não pertence a empresa.'; end if;
    select * into sub from public.account_subscriptions where user_id=auth.uid() and status <> 'canceled' order by created_at desc limit 1;
    if sub.id is null then
      insert into public.account_subscriptions(scope_type,user_id,plan_code,status,billing_day)
      values('professional',auth.uid(),p_plan_code,'pending_checkout',least(28,extract(day from now())::int)) returning * into sub;
    else
      update public.account_subscriptions set plan_code=p_plan_code where id=sub.id returning * into sub;
    end if;
  end if;

  insert into public.checkout_intents(user_id,clinic_id,subscription_id,plan_code,amount_cents,currency,status)
  values(auth.uid(),p_clinic_id,sub.id,p_plan_code,plan.monthly_price_cents,plan.currency,'pending') returning * into intent;
  return jsonb_build_object('checkout_intent_id',intent.id,'subscription_id',sub.id,'plan_code',plan.code,'plan_name',plan.name,'amount_cents',plan.monthly_price_cents,'currency',plan.currency,'status',intent.status);
end $$;

create or replace function public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text,
  p_plan_code text default 'company_initial',
  p_session_types text[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  plan public.billing_plans%rowtype;
  sessions text[];
  sub_id uuid;
  checkout jsonb;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_name,'')))<2 then return jsonb_build_object('success',false,'error','Informe o nome da empresa.'); end if;
  select * into plan from public.billing_plans where code=p_plan_code and account_scope='company' and is_active;
  if plan.code is null then return jsonb_build_object('success',false,'error','Plano empresarial inválido.'); end if;
  if exists(select 1 from public.clinics where owner_id=uid) then return jsonb_build_object('success',false,'error','Esta conta já possui uma empresa.'); end if;

  sessions := coalesce(p_session_types, array[case when lower(coalesce(p_kind,'')) in ('consultorio','clinica','clinic') then 'clinic' when lower(coalesce(p_kind,'')) in ('radiologia','radiology') then 'radiology' else 'laboratory' end]);
  select array_agg(distinct lower(x)) into sessions from unnest(sessions) x where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(sessions)=0 or cardinality(sessions)>plan.max_sessions then return jsonb_build_object('success',false,'error','Quantidade de ambientes incompatível com o plano.'); end if;

  insert into public.clinics(name,kind,company_type,owner_id,modules_enabled)
  values(trim(p_name),lower(coalesce(p_kind,'empresa')),'IPO',uid,'{}'::text[]) returning id into cid;

  insert into public.profiles(id,full_name,role,account_subtype,account_type,is_default_admin,clinic_id)
  values(uid,nullif(trim(p_full_name),''),'CEO','CEO','company_admin',true,cid)
  on conflict(id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),role='CEO',account_subtype='CEO',account_type='company_admin',is_default_admin=true,clinic_id=cid,updated_at=now();

  insert into public.clinic_members(clinic_id,user_id,role,status,decided_by,decided_at,access_source)
  values(cid,uid,'CEO','accepted',uid,now(),'company_seat')
  on conflict do nothing;

  insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
  values('company',cid,plan.code,'pending_checkout',least(28,extract(day from now())::int)) returning id into sub_id;

  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select cid,x,'active',case when plan.max_sessions>1 then 'company' else 'isolated' end from unnest(sessions) x;

  checkout := public.create_checkout_intent(plan.code,cid);
  return jsonb_build_object('success',true,'clinic_id',cid,'plan_code',plan.code,'checkout',checkout);
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

create or replace function public.create_professional_account(p_full_name text, p_profession_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  checkout jsonb;
  allowed text[]:=array['DENTISTA','CADISTA','PROTETICO','ATENDIMENTO','RADIOLOGISTA','OUTRO'];
  profession text:=upper(trim(coalesce(p_profession_type,'OUTRO')));
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if not(profession=any(allowed)) then profession:='OUTRO'; end if;
  insert into public.profiles(id,full_name,role,account_subtype,account_type,profession_type,is_default_admin)
  values(uid,nullif(trim(p_full_name),''),profession,profession,'professional',profession,false)
  on conflict(id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),role=profession,account_subtype=profession,account_type='professional',profession_type=profession,is_default_admin=false,updated_at=now();
  insert into public.professional_accounts(user_id,profession_type,status) values(uid,profession,'pending_checkout')
  on conflict(user_id) do update set profession_type=excluded.profession_type,updated_at=now();
  checkout:=public.create_checkout_intent('professional',null);
  return jsonb_build_object('success',true,'plan_code','professional','checkout',checkout);
exception when others then return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

create or replace function public.switch_company_context(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare acc text;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if not exists(select 1 from public.clinic_members where clinic_id=p_clinic_id and user_id=auth.uid() and status='accepted')
     and not exists(select 1 from public.clinics where id=p_clinic_id and owner_id=auth.uid()) then raise exception 'Você não pertence a esta empresa.'; end if;
  update public.profiles set clinic_id=p_clinic_id,updated_at=now() where id=auth.uid();
  return public.my_subscription_context();
end $$;

create or replace function public.enforce_membership_plan_limits()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  company_limit integer;
  company_count integer;
  link_limit integer;
  link_count integer;
  acct_type text;
begin
  if new.status <> 'accepted' then return new; end if;
  select bp.max_members into company_limit
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=new.clinic_id and s.status <> 'canceled' order by s.created_at desc limit 1;
  if company_limit is not null and company_limit>0 then
    select count(*) into company_count from public.clinic_members m where m.clinic_id=new.clinic_id and m.status='accepted' and m.id<>new.id;
    if company_count>=company_limit then raise exception 'Limite de membros do plano atingido (%).',company_limit; end if;
  end if;

  select account_type into acct_type from public.profiles where id=new.user_id;
  if acct_type='professional' and new.access_source='professional_subscription' then
    select bp.max_company_links into link_limit
    from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
    where s.user_id=new.user_id and s.status <> 'canceled' order by s.created_at desc limit 1;
    if link_limit is null or link_limit=0 then raise exception 'Plano profissional inativo ou sem vínculos disponíveis.'; end if;
    select count(*) into link_count from public.clinic_members m where m.user_id=new.user_id and m.status='accepted' and m.access_source='professional_subscription' and m.id<>new.id;
    if link_count>=link_limit then raise exception 'Seu plano profissional permite vínculo com até % empresas.',link_limit; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_membership_plan_limits on public.clinic_members;
create trigger trg_enforce_membership_plan_limits before insert or update of status,access_source on public.clinic_members
for each row execute function public.enforce_membership_plan_limits();

-- Future payment provider/edge-function entry point. Never callable from the client.
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
    status=p_status,current_period_start=coalesce(p_period_start,current_period_start),current_period_end=coalesce(p_period_end,current_period_end),
    grace_until=p_grace_until,billing_provider=coalesce(p_provider,billing_provider),external_customer_id=coalesce(p_external_customer_id,external_customer_id),
    external_subscription_id=coalesce(p_external_subscription_id,external_subscription_id),canceled_at=case when p_status='canceled' then now() else canceled_at end
  where id=p_subscription_id returning * into s;
  if s.id is null then raise exception 'Assinatura não encontrada.'; end if;
  if s.scope_type='professional' then update public.professional_accounts set status=case when p_status in ('active','trialing','past_due','grace') then 'active' when p_status='pending_checkout' then 'pending_checkout' else 'suspended' end where user_id=s.user_id; end if;
  if s.scope_type='company' and p_status in ('active','trialing','past_due','grace') then
    update public.clinics c set storage_limit_bytes=(select storage_bytes from public.billing_plans where code=s.plan_code) where c.id=s.clinic_id;
  end if;
  return jsonb_build_object('subscription_id',s.id,'status',s.status,'access_mode',public.subscription_access_mode(s.status,s.current_period_end,s.grace_until));
end $$;

revoke all on function public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text) to service_role;

-- Seed existing accounts without disrupting production. IPO is permanently internal Advanced.
update public.profiles set account_type=case when is_default_admin or upper(coalesce(role,'')) in ('CEO','ADMIN') then 'company_admin' else 'company_member' end
where clinic_id is not null and account_type is null;

insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
select c.id,x,'active','company'
from public.clinics c cross join lateral unnest(array[
  case when 'laboratory'=any(c.modules_enabled) then 'laboratory' end,
  case when 'clinical'=any(c.modules_enabled) then 'clinic' end,
  case when 'radiology'=any(c.modules_enabled) then 'radiology' end
]) x
where x is not null
on conflict(clinic_id,session_type) do update set status='active';

insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,metadata)
select 'company',c.id,
  case when c.company_type='IPO' or c.name ilike '%Instituto Praia%' then 'company_advanced' else 'company_advanced' end,
  'active',least(28,extract(day from c.created_at)::int),now(),
  case when c.company_type='IPO' or c.name ilike '%Instituto Praia%' then '2099-12-31 23:59:59+00'::timestamptz else now()+interval '30 days' end,
  case when c.company_type='IPO' or c.name ilike '%Instituto Praia%' then 'internal_override' else 'migration_grace' end,
  jsonb_build_object('migrated_in','0.3.2','grandfathered',true)
from public.clinics c
where not exists(select 1 from public.account_subscriptions s where s.clinic_id=c.id and s.status<>'canceled');

-- IPO always has the complete three-session plan.
insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
select c.id,s,'active','company' from public.clinics c cross join unnest(array['laboratory','clinic','radiology']) s
where c.company_type='IPO' or c.name ilike '%Instituto Praia%'
on conflict(clinic_id,session_type) do update set status='active',sharing_mode='company';

update public.clinics c set storage_limit_bytes=536870912000
where c.company_type='IPO' or c.name ilike '%Instituto Praia%';

-- RLS for new billing/session/DICOM structures.
alter table public.billing_plans enable row level security;
alter table public.professional_accounts enable row level security;
alter table public.company_sessions enable row level security;
alter table public.account_subscriptions enable row level security;
alter table public.checkout_intents enable row level security;
alter table public.billing_events enable row level security;
alter table public.radiology_studies enable row level security;
alter table public.radiology_series enable row level security;
alter table public.radiology_instances enable row level security;

drop policy if exists billing_plans_public_read on public.billing_plans;
create policy billing_plans_public_read on public.billing_plans for select using (is_active=true);

drop policy if exists professional_accounts_self_read on public.professional_accounts;
create policy professional_accounts_self_read on public.professional_accounts for select to authenticated using (user_id=auth.uid());

drop policy if exists company_sessions_member_read on public.company_sessions;
create policy company_sessions_member_read on public.company_sessions for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid()) or
  exists(select 1 from public.clinic_members m where m.clinic_id=company_sessions.clinic_id and m.user_id=auth.uid() and m.status='accepted') or
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=company_sessions.clinic_id)
);

drop policy if exists subscriptions_scope_read on public.account_subscriptions;
create policy subscriptions_scope_read on public.account_subscriptions for select to authenticated using (
  user_id=auth.uid() or
  (clinic_id is not null and (
    exists(select 1 from public.clinics c where c.id=account_subscriptions.clinic_id and c.owner_id=auth.uid()) or
    exists(select 1 from public.clinic_members m where m.clinic_id=account_subscriptions.clinic_id and m.user_id=auth.uid() and m.status='accepted')
  ))
);

drop policy if exists checkout_intents_self_read on public.checkout_intents;
create policy checkout_intents_self_read on public.checkout_intents for select to authenticated using (user_id=auth.uid());

-- billing_events intentionally has no client policies.

drop policy if exists radiology_studies_member_read on public.radiology_studies;
create policy radiology_studies_member_read on public.radiology_studies for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid()) or
  exists(select 1 from public.clinic_members m where m.clinic_id=radiology_studies.clinic_id and m.user_id=auth.uid() and m.status='accepted')
);
drop policy if exists radiology_studies_member_write on public.radiology_studies;
create policy radiology_studies_member_write on public.radiology_studies for all to authenticated using (
  exists(select 1 from public.company_sessions s where s.clinic_id=radiology_studies.clinic_id and s.session_type='radiology' and s.status='active') and
  (exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid()) or exists(select 1 from public.clinic_members m where m.clinic_id=radiology_studies.clinic_id and m.user_id=auth.uid() and m.status='accepted'))
) with check (
  exists(select 1 from public.company_sessions s where s.clinic_id=radiology_studies.clinic_id and s.session_type='radiology' and s.status='active') and
  (exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid()) or exists(select 1 from public.clinic_members m where m.clinic_id=radiology_studies.clinic_id and m.user_id=auth.uid() and m.status='accepted'))
);

drop policy if exists radiology_series_member_read on public.radiology_series;
create policy radiology_series_member_read on public.radiology_series for select to authenticated using (exists(select 1 from public.radiology_studies st where st.id=study_id));
drop policy if exists radiology_instances_member_read on public.radiology_instances;
create policy radiology_instances_member_read on public.radiology_instances for select to authenticated using (exists(select 1 from public.radiology_series se join public.radiology_studies st on st.id=se.study_id where se.id=series_id));

grant select on public.billing_plans to anon, authenticated;
grant select on public.professional_accounts,public.company_sessions,public.account_subscriptions,public.checkout_intents,public.radiology_studies,public.radiology_series,public.radiology_instances to authenticated;
grant execute on function public.company_subscription_snapshot(uuid),public.my_subscription_context(),public.configure_company_sessions(uuid,text[]),public.create_checkout_intent(text,uuid),public.create_company_account(text,text,text,text,text[]),public.create_professional_account(text,text),public.switch_company_context(uuid) to authenticated;

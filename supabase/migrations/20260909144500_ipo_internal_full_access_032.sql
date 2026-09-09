-- DentalFlow 0.3.2 — IPO internal account compatibility and full-access invariants.
--
-- Goals:
-- 1. Preserve the existing IPO company, users, roles and operational data.
-- 2. Make IPO permanently equivalent to the most complete company plan.
-- 3. Ensure ordinary companies can never inherit the internal IPO entitlement.
-- 4. Keep legacy modules_enabled in sync with the new company_sessions model.

alter table public.clinics
  add column if not exists billing_exempt boolean not null default false;

-- Only the pre-existing Instituto Praia account is promoted to internal full access.
-- New companies must never receive this flag automatically.
update public.clinics
set billing_exempt = true,
    company_type = 'IPO'
where company_type = 'IPO'
  and name ilike '%Instituto Praia%';

-- Defensive cleanup for any ordinary company accidentally created as IPO by an
-- intermediate 0.3.2 function before this migration is applied.
update public.clinics
set company_type = 'COMPANY'
where company_type = 'IPO'
  and billing_exempt = false;

create or replace function public.is_internal_full_access_company(_clinic_id uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.clinics c
    where c.id=_clinic_id and c.billing_exempt=true
  )
$$;

create or replace function public.company_has_operational_access(_clinic_id uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_internal_full_access_company(_clinic_id)
    or coalesce((
      select public.subscription_access_mode(s.status,s.current_period_end,s.grace_until)='full'
      from public.account_subscriptions s
      where s.clinic_id=_clinic_id
      order by (s.status<>'canceled') desc,s.created_at desc
      limit 1
    ),false)
$$;

-- Compatibility bridge: company_sessions is authoritative for the new Hub, but
-- existing routes still read clinics.modules_enabled. Preserve unrelated legacy
-- modules (e.g. financial) while mirroring Laboratory/Clinic/Radiology sessions.
create or replace function public.sync_company_legacy_modules(_clinic_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
declare
  extras text[];
  session_modules text[];
begin
  select coalesce(array_agg(distinct lower(m)),'{}'::text[])
    into extras
  from public.clinics c
  cross join lateral unnest(coalesce(c.modules_enabled,'{}'::text[])) m
  where c.id=_clinic_id
    and lower(m) not in ('laboratory','laboratorio','laboratório','lab','clinical','clinic','clinica','clínica','radiology','radiologia','imaging','image');

  select coalesce(array_agg(distinct case s.session_type
      when 'laboratory' then 'laboratory'
      when 'clinic' then 'clinical'
      when 'radiology' then 'radiology'
      else null end) filter (where s.status='active'),'{}'::text[])
    into session_modules
  from public.company_sessions s
  where s.clinic_id=_clinic_id;

  update public.clinics
  set modules_enabled=(
    select coalesce(array_agg(distinct x order by x),'{}'::text[])
    from unnest(coalesce(extras,'{}'::text[]) || coalesce(session_modules,'{}'::text[])) x
    where x is not null and x<>''
  )
  where id=_clinic_id;
end $$;

-- Preserve the legacy IPO member identities. No password/account is recreated;
-- missing company membership rows are simply backfilled around the existing users.
update public.profiles p
set account_type=case
      when coalesce(p.is_default_admin,false) or upper(coalesce(p.role,'')) in ('CEO','ADMIN') then 'company_admin'
      else 'company_member'
    end,
    profession_type=coalesce(p.profession_type,p.account_subtype,p.role),
    updated_at=now()
from public.clinics c
where p.clinic_id=c.id and c.billing_exempt=true;

insert into public.clinic_members(
  clinic_id,user_id,role,status,invited_by,decided_by,decided_at,access_source
)
select p.clinic_id,p.id,coalesce(p.role,'USER'),'active',c.owner_id,c.owner_id,now(),'company_seat'
from public.profiles p
join public.clinics c on c.id=p.clinic_id
where c.billing_exempt=true
on conflict(clinic_id,user_id) do update set
  access_source='company_seat';

-- IPO always owns the complete session set. Existing non-session modules stay intact.
insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
select c.id,s,'active','company'
from public.clinics c
cross join unnest(array['laboratory','clinic','radiology']::text[]) s
where c.billing_exempt=true
on conflict(clinic_id,session_type) do update set
  status='active',sharing_mode='company',updated_at=now();

-- Normalize/create the IPO subscription without touching patient/case/file data.
update public.account_subscriptions s
set scope_type='company',
    user_id=null,
    plan_code='company_advanced',
    status='active',
    current_period_start=coalesce(s.current_period_start,now()),
    current_period_end='9999-12-31 23:59:59+00'::timestamptz,
    grace_until=null,
    canceled_at=null,
    billing_provider='internal_override',
    metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object('internal_full_access',true,'account','IPO','version','0.3.2'),
    updated_at=now()
from public.clinics c
where s.clinic_id=c.id and c.billing_exempt=true and s.status<>'canceled';

insert into public.account_subscriptions(
  scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,metadata
)
select 'company',c.id,'company_advanced','active',1,now(),'9999-12-31 23:59:59+00'::timestamptz,'internal_override',
       jsonb_build_object('internal_full_access',true,'account','IPO','version','0.3.2')
from public.clinics c
where c.billing_exempt=true
  and not exists(select 1 from public.account_subscriptions s where s.clinic_id=c.id and s.status<>'canceled');

update public.clinics
set storage_limit_bytes=greatest(storage_limit_bytes,536870912000)
where billing_exempt=true;

select public.sync_company_legacy_modules(c.id)
from public.clinics c
where c.billing_exempt=true;

-- Even service-side billing state updates cannot accidentally downgrade an
-- internal account. This trigger is intentionally narrow: it only acts when the
-- company has billing_exempt=true.
create or replace function public.protect_internal_subscription()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  protected_clinic uuid;
begin
  protected_clinic:=coalesce(new.clinic_id,old.clinic_id);
  if public.is_internal_full_access_company(protected_clinic) then
    if tg_op='UPDATE' then new.clinic_id:=old.clinic_id; end if;
    new.scope_type:='company';
    new.user_id:=null;
    new.plan_code:='company_advanced';
    new.status:='active';
    new.current_period_start:=coalesce(old.current_period_start,new.current_period_start,now());
    new.current_period_end:='9999-12-31 23:59:59+00'::timestamptz;
    new.grace_until:=null;
    new.canceled_at:=null;
    new.billing_provider:='internal_override';
    new.metadata:=coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('internal_full_access',true,'account','IPO');
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_internal_subscription on public.account_subscriptions;
create trigger trg_protect_internal_subscription
before insert or update on public.account_subscriptions
for each row execute function public.protect_internal_subscription();

create or replace function public.prevent_internal_subscription_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.is_internal_full_access_company(old.clinic_id) then return null; end if;
  return old;
end $$;

drop trigger if exists trg_prevent_internal_subscription_delete on public.account_subscriptions;
create trigger trg_prevent_internal_subscription_delete
before delete on public.account_subscriptions
for each row execute function public.prevent_internal_subscription_delete();

-- Protect the internal company marker, complete modules and minimum storage from
-- ordinary clinic updates. Existing name/kind/settings remain editable.
create or replace function public.protect_internal_company_entitlements()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.billing_exempt=true then
    new.billing_exempt:=true;
    new.company_type:='IPO';
    new.storage_limit_bytes:=greatest(coalesce(new.storage_limit_bytes,0),536870912000);
    new.modules_enabled:=(
      select array_agg(distinct x order by x)
      from unnest(coalesce(new.modules_enabled,'{}'::text[]) || array['laboratory','clinical','radiology']::text[]) x
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_internal_company_entitlements on public.clinics;
create trigger trg_protect_internal_company_entitlements
before update on public.clinics
for each row execute function public.protect_internal_company_entitlements();

-- Snapshot reports the permanent full entitlement for IPO but keeps the exact
-- same JSON shape consumed by Web/Desktop clients.
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
    'monthly_price_cents',p.monthly_price_cents,'currency',p.currency,
    'max_sessions',p.max_sessions,'max_members',p.max_members,'storage_bytes',p.storage_bytes,'features',p.features,
    'internal_full_access',internal,
    'sessions',coalesce((select jsonb_agg(cs.session_type order by cs.session_type) from public.company_sessions cs where cs.clinic_id=_clinic_id and cs.status='active'),'[]'::jsonb)
  );
end $$;

-- IPO session selection is immutable/full; ordinary companies keep plan limits.
create or replace function public.configure_company_sessions(p_clinic_id uuid,p_session_types text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  max_allowed integer;
  normalized text[];
  is_manager boolean;
begin
  select exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid())
      or exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.status in ('active','accepted') and upper(m.role) in ('CEO','ADMIN'))
    into is_manager;
  if not is_manager then raise exception 'Sem permissão para configurar os ambientes.'; end if;

  if public.is_internal_full_access_company(p_clinic_id) then
    insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
    select p_clinic_id,x,'active','company' from unnest(array['laboratory','clinic','radiology']::text[]) x
    on conflict(clinic_id,session_type) do update set status='active',sharing_mode='company',updated_at=now();
    perform public.sync_company_legacy_modules(p_clinic_id);
    return public.company_subscription_snapshot(p_clinic_id);
  end if;

  select bp.max_sessions into max_allowed
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=p_clinic_id and s.status<>'canceled'
  order by s.created_at desc limit 1;
  if max_allowed is null then raise exception 'Plano empresarial não encontrado.'; end if;

  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into normalized
  from unnest(coalesce(p_session_types,'{}'::text[])) x
  where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(normalized)=0 then raise exception 'Selecione ao menos um ambiente.'; end if;
  if cardinality(normalized)>max_allowed then raise exception 'Seu plano permite no máximo % ambiente(s).',max_allowed; end if;

  update public.company_sessions set status='disabled' where clinic_id=p_clinic_id and not(session_type=any(normalized));
  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select p_clinic_id,x,'active',case when max_allowed>1 then 'company' else 'isolated' end from unnest(normalized) x
  on conflict(clinic_id,session_type) do update set status='active',sharing_mode=excluded.sharing_mode,updated_at=now();
  perform public.sync_company_legacy_modules(p_clinic_id);
  return public.company_subscription_snapshot(p_clinic_id);
end $$;

-- Correct the intermediate function that tagged every new company as IPO.
create or replace function public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text,
  p_plan_code text default 'company_initial',
  p_session_types text[] default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
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

  sessions:=coalesce(p_session_types,array[case when lower(coalesce(p_kind,'')) in ('consultorio','clinica','clinic') then 'clinic' when lower(coalesce(p_kind,'')) in ('radiologia','radiology') then 'radiology' else 'laboratory' end]);
  select coalesce(array_agg(distinct lower(x)),'{}'::text[]) into sessions
  from unnest(sessions) x where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(sessions)=0 or cardinality(sessions)>plan.max_sessions then
    return jsonb_build_object('success',false,'error','Quantidade de ambientes incompatível com o plano.');
  end if;

  insert into public.clinics(name,kind,company_type,owner_id,modules_enabled,billing_exempt)
  values(trim(p_name),lower(coalesce(p_kind,'empresa')),'COMPANY',uid,'{}'::text[],false)
  returning id into cid;

  insert into public.profiles(id,full_name,role,account_subtype,account_type,is_default_admin,clinic_id)
  values(uid,nullif(trim(p_full_name),''),'CEO','CEO','company_admin',true,cid)
  on conflict(id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),role='CEO',account_subtype='CEO',account_type='company_admin',is_default_admin=true,clinic_id=cid,updated_at=now();

  insert into public.clinic_members(clinic_id,user_id,role,status,invited_by,decided_by,decided_at,access_source)
  values(cid,uid,'CEO','active',uid,uid,now(),'company_seat')
  on conflict(clinic_id,user_id) do nothing;

  insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
  values('company',cid,plan.code,'pending_checkout',least(28,extract(day from now())::int)) returning id into sub_id;

  insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
  select cid,x,'active',case when plan.max_sessions>1 then 'company' else 'isolated' end from unnest(sessions) x;
  perform public.sync_company_legacy_modules(cid);

  checkout:=public.create_checkout_intent(plan.code,cid,sessions);
  return jsonb_build_object('success',true,'clinic_id',cid,'plan_code',plan.code,'checkout',checkout);
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

-- Sandbox non-payment must never suspend IPO.
create or replace function public.billing_test_simulate_nonpayment(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare allowed boolean; sub_id uuid;
begin
  select exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()) into allowed;
  if not allowed then return jsonb_build_object('success',false,'error','Modo de teste não autorizado.'); end if;
  if not exists(select 1 from public.clinics c where c.id=p_clinic_id and c.owner_id=auth.uid()) then
    return jsonb_build_object('success',false,'error','Somente o administrador da empresa pode simular cobrança.');
  end if;
  if public.is_internal_full_access_company(p_clinic_id) then
    return jsonb_build_object('success',false,'error','A conta interna IPO possui acesso permanente e não pode ser suspensa pelo sandbox.');
  end if;
  select id into sub_id from public.account_subscriptions where clinic_id=p_clinic_id and status<>'canceled' order by created_at desc limit 1;
  if sub_id is null then return jsonb_build_object('success',false,'error','Assinatura não encontrada.'); end if;
  update public.account_subscriptions set status='past_due',current_period_end=now()-interval '1 second',grace_until=null,updated_at=now() where id=sub_id;
  return jsonb_build_object('success',true,'context',public.my_subscription_context());
exception when others then return jsonb_build_object('success',false,'error',sqlerrm); end $$;

grant execute on function public.is_internal_full_access_company(uuid),public.company_has_operational_access(uuid),public.sync_company_legacy_modules(uuid),public.configure_company_sessions(uuid,text[]),public.create_company_account(text,text,text,text,text[]),public.billing_test_simulate_nonpayment(uuid) to authenticated;

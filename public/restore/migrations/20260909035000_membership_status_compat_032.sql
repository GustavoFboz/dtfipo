-- DentalFlow 0.3.2 — compatibility with the existing membership lifecycle.
-- Production uses `active` for accepted members; older/newer flows may also use `accepted`.

create or replace function public.active_company_member(_clinic_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.clinic_members m
    where m.clinic_id=_clinic_id and m.user_id=_user_id and m.status in ('active','accepted')
  )
$$;

create or replace function public.company_subscription_snapshot(_clinic_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  allowed boolean;
begin
  select exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or public.active_company_member(_clinic_id,auth.uid())
      or exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.clinic_id=_clinic_id)
    into allowed;
  if not allowed then return null; end if;

  select * into s from public.account_subscriptions where clinic_id=_clinic_id and status <> 'canceled' order by created_at desc limit 1;
  if s.id is null then select * into s from public.account_subscriptions where clinic_id=_clinic_id order by created_at desc limit 1; end if;
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

create or replace function public.configure_company_sessions(p_clinic_id uuid, p_session_types text[])
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

  select bp.max_sessions into max_allowed
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=p_clinic_id and s.status <> 'canceled'
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
  return public.company_subscription_snapshot(p_clinic_id);
end $$;

create or replace function public.switch_company_context(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if not public.active_company_member(p_clinic_id,auth.uid())
     and not exists(select 1 from public.clinics where id=p_clinic_id and owner_id=auth.uid()) then
    raise exception 'Você não pertence a esta empresa.';
  end if;
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
  if new.status not in ('active','accepted') then return new; end if;

  select bp.max_members into company_limit
  from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
  where s.clinic_id=new.clinic_id and s.status <> 'canceled' order by s.created_at desc limit 1;
  if company_limit is not null and company_limit>0 then
    select count(*) into company_count
    from public.clinic_members m
    where m.clinic_id=new.clinic_id and m.status in ('active','accepted') and m.id<>new.id;
    if company_count>=company_limit then raise exception 'Limite de membros do plano atingido (%).',company_limit; end if;
  end if;

  select account_type into acct_type from public.profiles where id=new.user_id;
  if acct_type='professional' and new.access_source='professional_subscription' then
    select bp.max_company_links into link_limit
    from public.account_subscriptions s join public.billing_plans bp on bp.code=s.plan_code
    where s.user_id=new.user_id and s.status <> 'canceled' order by s.created_at desc limit 1;
    if link_limit is null or link_limit=0 then raise exception 'Plano profissional inativo ou sem vínculos disponíveis.'; end if;
    select count(*) into link_count
    from public.clinic_members m
    where m.user_id=new.user_id and m.status in ('active','accepted') and m.access_source='professional_subscription' and m.id<>new.id;
    if link_count>=link_limit then raise exception 'Seu plano profissional permite vínculo com até % empresas.',link_limit; end if;
  end if;
  return new;
end $$;

create or replace function public.user_can_use_company_session(_clinic_id uuid, _session_type text)
returns boolean
language sql stable security definer set search_path=public as $$
  select
    public.company_has_operational_access(_clinic_id)
    and exists(select 1 from public.company_sessions s where s.clinic_id=_clinic_id and s.session_type=_session_type and s.status='active')
    and (
      exists(select 1 from public.clinics c where c.id=_clinic_id and c.owner_id=auth.uid())
      or public.active_company_member(_clinic_id,auth.uid())
      or exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=_clinic_id)
    )
$$;

-- Company creation now follows the status value already used by the product.
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

  sessions := coalesce(p_session_types,array[case when lower(coalesce(p_kind,'')) in ('consultorio','clinica','clinic') then 'clinic' when lower(coalesce(p_kind,'')) in ('radiologia','radiology') then 'radiology' else 'laboratory' end]);
  select array_agg(distinct lower(x)) into sessions from unnest(sessions) x where lower(x) in ('laboratory','clinic','radiology');
  if cardinality(sessions)=0 or cardinality(sessions)>plan.max_sessions then return jsonb_build_object('success',false,'error','Quantidade de ambientes incompatível com o plano.'); end if;

  insert into public.clinics(name,kind,company_type,owner_id,modules_enabled)
  values(trim(p_name),lower(coalesce(p_kind,'empresa')),'IPO',uid,'{}'::text[]) returning id into cid;

  insert into public.profiles(id,full_name,role,account_subtype,account_type,is_default_admin,clinic_id)
  values(uid,nullif(trim(p_full_name),''),'CEO','CEO','company_admin',true,cid)
  on conflict(id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),role='CEO',account_subtype='CEO',account_type='company_admin',is_default_admin=true,clinic_id=cid,updated_at=now();

  insert into public.clinic_members(clinic_id,user_id,role,status,decided_by,decided_at,access_source)
  values(cid,uid,'CEO','active',uid,now(),'company_seat')
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

-- Refresh new-table read policies to recognize both membership states.
drop policy if exists company_sessions_member_read on public.company_sessions;
create policy company_sessions_member_read on public.company_sessions for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid())
  or public.active_company_member(company_sessions.clinic_id,auth.uid())
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.clinic_id=company_sessions.clinic_id)
);

drop policy if exists subscriptions_scope_read on public.account_subscriptions;
create policy subscriptions_scope_read on public.account_subscriptions for select to authenticated using (
  user_id=auth.uid() or
  (clinic_id is not null and (
    exists(select 1 from public.clinics c where c.id=account_subscriptions.clinic_id and c.owner_id=auth.uid())
    or public.active_company_member(account_subscriptions.clinic_id,auth.uid())
  ))
);

drop policy if exists radiology_studies_member_read on public.radiology_studies;
create policy radiology_studies_member_read on public.radiology_studies for select to authenticated using (
  exists(select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid())
  or public.active_company_member(radiology_studies.clinic_id,auth.uid())
);

grant execute on function public.active_company_member(uuid,uuid) to authenticated;

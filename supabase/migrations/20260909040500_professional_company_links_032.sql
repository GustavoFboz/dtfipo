-- DentalFlow 0.3.2 — Professional accounts join companies through a private invite code.
-- A professional subscription pays for mobility (max company links); the company plan pays for seats/sessions.

create or replace function public.my_professional_company_links()
returns table(
  clinic_id uuid,
  clinic_name text,
  membership_role text,
  membership_status text,
  access_source text,
  is_current boolean,
  company_plan_code text,
  company_plan_name text,
  company_access_mode text,
  sessions text[]
)
language sql stable security definer set search_path=public as $$
  select
    c.id,
    c.name,
    m.role,
    m.status,
    m.access_source,
    (p.clinic_id=c.id),
    bp.code,
    bp.name,
    public.subscription_access_mode(s.status,s.current_period_end,s.grace_until),
    coalesce(array(
      select cs.session_type
      from public.company_sessions cs
      where cs.clinic_id=c.id and cs.status='active'
      order by cs.session_type
    ),'{}'::text[])
  from public.clinic_members m
  join public.clinics c on c.id=m.clinic_id
  join public.profiles p on p.id=auth.uid()
  left join lateral (
    select sx.* from public.account_subscriptions sx
    where sx.clinic_id=c.id order by (sx.status<>'canceled') desc,sx.created_at desc limit 1
  ) s on true
  left join public.billing_plans bp on bp.code=s.plan_code
  where m.user_id=auth.uid()
    and m.access_source='professional_subscription'
  order by (m.status in ('active','accepted')) desc,c.name
$$;

create or replace function public.link_professional_company(p_invite_code text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  target public.clinics%rowtype;
  profession text;
  member_role text;
  prof_sub public.account_subscriptions%rowtype;
  prof_plan public.billing_plans%rowtype;
  company_sub public.account_subscriptions%rowtype;
  company_plan public.billing_plans%rowtype;
  existing public.clinic_members%rowtype;
  current_links integer;
  current_members integer;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_invite_code,'')))<4 then return jsonb_build_object('success',false,'error','Informe um código de empresa válido.'); end if;

  select coalesce(pa.profession_type,p.profession_type,p.account_subtype,p.role,'OUTRO')
  into profession
  from public.profiles p left join public.professional_accounts pa on pa.user_id=p.id
  where p.id=uid and p.account_type='professional';
  if profession is null then return jsonb_build_object('success',false,'error','Esta conta não é uma conta profissional.'); end if;

  select * into prof_sub from public.account_subscriptions
  where user_id=uid and status<>'canceled' order by created_at desc limit 1;
  if prof_sub.id is null then return jsonb_build_object('success',false,'error','Ative o plano Profissional antes de vincular uma empresa.'); end if;
  select * into prof_plan from public.billing_plans where code=prof_sub.plan_code and account_scope='professional';
  if public.subscription_access_mode(prof_sub.status,prof_sub.current_period_end,prof_sub.grace_until)<>'full' then
    return jsonb_build_object('success',false,'error','Seu plano Profissional precisa estar ativo para criar novos vínculos.');
  end if;

  select * into target from public.clinics
  where upper(trim(invite_code))=upper(trim(p_invite_code)) limit 1;
  if target.id is null then return jsonb_build_object('success',false,'error','Código de empresa não encontrado.'); end if;

  select * into company_sub from public.account_subscriptions
  where clinic_id=target.id and status<>'canceled' order by created_at desc limit 1;
  if company_sub.id is null then return jsonb_build_object('success',false,'error','A empresa ainda não possui um plano DentalFlow ativo.'); end if;
  select * into company_plan from public.billing_plans where code=company_sub.plan_code;
  if public.subscription_access_mode(company_sub.status,company_sub.current_period_end,company_sub.grace_until)<>'full' then
    return jsonb_build_object('success',false,'error','A assinatura desta empresa precisa ser regularizada antes de aceitar novos vínculos.');
  end if;

  select * into existing from public.clinic_members where clinic_id=target.id and user_id=uid;
  if existing.id is not null and existing.status in ('active','accepted') then
    update public.profiles set clinic_id=target.id,updated_at=now() where id=uid;
    return jsonb_build_object('success',true,'clinic_id',target.id,'clinic_name',target.name,'already_linked',true,'context',public.my_subscription_context());
  end if;

  select count(*) into current_links from public.clinic_members
  where user_id=uid and access_source='professional_subscription' and status in ('active','accepted');
  if current_links>=coalesce(prof_plan.max_company_links,0) then
    return jsonb_build_object('success',false,'error',format('Seu plano Profissional permite vínculo com até %s empresas.',prof_plan.max_company_links));
  end if;

  select count(*) into current_members from public.clinic_members
  where clinic_id=target.id and status in ('active','accepted');
  if coalesce(company_plan.max_members,0)>0 and current_members>=company_plan.max_members then
    return jsonb_build_object('success',false,'error','A empresa atingiu o limite de membros do plano atual.');
  end if;

  member_role:=case upper(profession)
    when 'DENTISTA' then 'DR'
    when 'CADISTA' then 'CADISTA'
    when 'PROTETICO' then 'PROTETICO'
    when 'ATENDIMENTO' then 'ATENDIMENTO'
    when 'RADIOLOGISTA' then 'USER'
    else 'USER'
  end;

  insert into public.clinic_members(clinic_id,user_id,role,status,decided_by,decided_at,invited_by,access_source)
  values(target.id,uid,member_role,'active',uid,now(),null,'professional_subscription')
  on conflict(clinic_id,user_id) do update set
    role=excluded.role,status='active',decided_by=uid,decided_at=now(),access_source='professional_subscription';

  update public.profiles set clinic_id=target.id,updated_at=now() where id=uid;
  return jsonb_build_object('success',true,'clinic_id',target.id,'clinic_name',target.name,'already_linked',false,'context',public.my_subscription_context());
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

create or replace function public.unlink_professional_company(p_clinic_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); next_clinic uuid;
begin
  if uid is null then raise exception 'Sessão inválida.'; end if;
  if not exists(select 1 from public.profiles where id=uid and account_type='professional') then raise exception 'Conta profissional necessária.'; end if;
  delete from public.clinic_members where clinic_id=p_clinic_id and user_id=uid and access_source='professional_subscription';
  select m.clinic_id into next_clinic from public.clinic_members m
  where m.user_id=uid and m.access_source='professional_subscription' and m.status in ('active','accepted')
  order by m.created_at limit 1;
  update public.profiles set clinic_id=next_clinic,updated_at=now() where id=uid;
  return public.my_subscription_context();
end $$;

grant execute on function public.my_professional_company_links(),public.link_professional_company(text),public.unlink_professional_company(uuid) to authenticated;

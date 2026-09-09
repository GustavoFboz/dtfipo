-- DentalFlow 0.3.2 — IPO never enters a commercial checkout lifecycle.
-- Ordinary companies keep the same provider-agnostic checkout contract.

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
  if public.is_internal_full_access_company(p_clinic_id) then
    raise exception 'A conta interna IPO possui acesso completo permanente e não participa da cobrança.';
  end if;

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
  if cardinality(requested)>plan.max_sessions then
    raise exception 'O plano selecionado permite no máximo % ambiente(s).',plan.max_sessions;
  end if;

  select * into sub from public.account_subscriptions
  where clinic_id=p_clinic_id and status<>'canceled'
  order by created_at desc limit 1;

  if sub.id is null then
    insert into public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day)
    values('company',p_clinic_id,p_plan_code,'pending_checkout',least(28,extract(day from now())::int))
    returning * into sub;
  elsif sub.status='pending_checkout' then
    update public.account_subscriptions set plan_code=p_plan_code,updated_at=now()
    where id=sub.id returning * into sub;
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

drop function if exists public.create_checkout_intent(text,uuid);
create function public.create_checkout_intent(p_plan_code text,p_clinic_id uuid)
returns jsonb language sql security definer set search_path=public as $$
  select public.create_checkout_intent(p_plan_code,p_clinic_id,null::text[])
$$;

grant execute on function public.create_checkout_intent(text,uuid,text[]) to authenticated;
grant execute on function public.create_checkout_intent(text,uuid) to authenticated;

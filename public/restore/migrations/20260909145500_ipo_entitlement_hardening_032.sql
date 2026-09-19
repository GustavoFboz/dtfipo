-- DentalFlow 0.3.2 — harden the permanent IPO entitlement against every billing path.

-- Safe for both INSERT and UPDATE; never dereference OLD during INSERT.
create or replace function public.protect_internal_subscription()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  protected_clinic uuid;
  previous_start timestamptz;
begin
  if tg_op='INSERT' then
    protected_clinic:=new.clinic_id;
    previous_start:=null;
  else
    protected_clinic:=coalesce(new.clinic_id,old.clinic_id);
    previous_start:=old.current_period_start;
  end if;

  if public.is_internal_full_access_company(protected_clinic) then
    if tg_op='UPDATE' then new.clinic_id:=old.clinic_id; end if;
    new.scope_type:='company';
    new.user_id:=null;
    new.plan_code:='company_advanced';
    new.status:='active';
    new.current_period_start:=coalesce(previous_start,new.current_period_start,now());
    new.current_period_end:='9999-12-31 23:59:59+00'::timestamptz;
    new.grace_until:=null;
    new.canceled_at:=null;
    new.billing_provider:='internal_override';
    new.metadata:=coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('internal_full_access',true,'account','IPO');
  end if;
  return new;
end $$;

-- Billing-provider code updates company_sessions directly after payment. These
-- triggers ensure no checkout, downgrade or sandbox call can disable an IPO area.
create or replace function public.protect_internal_company_session()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  target_clinic uuid;
begin
  if tg_op='INSERT' then target_clinic:=new.clinic_id;
  else target_clinic:=coalesce(new.clinic_id,old.clinic_id);
  end if;

  if public.is_internal_full_access_company(target_clinic) then
    if tg_op='UPDATE' then
      new.clinic_id:=old.clinic_id;
      new.session_type:=old.session_type;
    end if;
    new.status:='active';
    new.sharing_mode:='company';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_internal_company_session on public.company_sessions;
create trigger trg_protect_internal_company_session
before insert or update on public.company_sessions
for each row execute function public.protect_internal_company_session();

create or replace function public.prevent_internal_company_session_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.is_internal_full_access_company(old.clinic_id) then return null; end if;
  return old;
end $$;

drop trigger if exists trg_prevent_internal_company_session_delete on public.company_sessions;
create trigger trg_prevent_internal_company_session_delete
before delete on public.company_sessions
for each row execute function public.prevent_internal_company_session_delete();

-- Re-assert all three sessions after trigger installation.
insert into public.company_sessions(clinic_id,session_type,status,sharing_mode)
select c.id,s,'active','company'
from public.clinics c
cross join unnest(array['laboratory','clinic','radiology']::text[]) s
where c.billing_exempt=true
on conflict(clinic_id,session_type) do update set
  status='active',sharing_mode='company',updated_at=now();

-- Test checkout approval is explicitly denied for internal accounts. The normal
-- product never shows the checkout to IPO, but this closes the direct RPC path too.
create or replace function public.billing_test_mark_checkout_paid(p_checkout_intent_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  allowed boolean;
  intent public.checkout_intents%rowtype;
  result jsonb;
begin
  select exists(select 1 from public.billing_test_access t where t.user_id=auth.uid() and t.enabled_until>now()) into allowed;
  if not allowed then return jsonb_build_object('success',false,'error','Modo de teste não autorizado.'); end if;

  select * into intent from public.checkout_intents where id=p_checkout_intent_id and user_id=auth.uid();
  if intent.id is null then return jsonb_build_object('success',false,'error','Checkout não encontrado.'); end if;
  if public.is_internal_full_access_company(intent.clinic_id) then
    return jsonb_build_object('success',false,'error','A conta interna IPO já possui acesso completo permanente e não participa da cobrança.');
  end if;

  result:=public.billing_apply_checkout_paid(
    intent.id,'sandbox','sandbox-'||intent.id::text,null,'sandbox-sub-'||intent.subscription_id::text,
    now(),now()+interval '30 days'
  );
  return jsonb_build_object(
    'success',true,
    'subscription_id',intent.subscription_id,
    'current_period_end',result->>'current_period_end',
    'context',public.my_subscription_context()
  );
exception when others then
  return jsonb_build_object('success',false,'error',sqlerrm);
end $$;

grant execute on function public.billing_test_mark_checkout_paid(uuid) to authenticated;

-- Diagnostic used during rollout and future migrations. It never mutates data.
create or replace function public.ipo_internal_invariant_report()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'clinic_id',c.id,
    'name',c.name,
    'billing_exempt',c.billing_exempt,
    'storage_ok',c.storage_limit_bytes>=536870912000,
    'subscription_ok',exists(
      select 1 from public.account_subscriptions s
      where s.clinic_id=c.id and s.status='active' and s.plan_code='company_advanced'
        and s.current_period_end>now()+interval '10 years'
    ),
    'sessions_ok',(select count(*) from public.company_sessions cs where cs.clinic_id=c.id and cs.status='active' and cs.session_type in ('laboratory','clinic','radiology'))=3,
    'legacy_modules_ok',c.modules_enabled@>array['laboratory','clinical','radiology']::text[],
    'profiles',(select count(*) from public.profiles p where p.clinic_id=c.id),
    'members',(select count(*) from public.clinic_members m where m.clinic_id=c.id and m.status in ('active','accepted'))
  )),'[]'::jsonb)
  from public.clinics c
  where c.billing_exempt=true
$$;

revoke all on function public.ipo_internal_invariant_report() from public,anon,authenticated;
grant execute on function public.ipo_internal_invariant_report() to service_role;

-- Disposable restore only. All fixtures and quota changes are rolled back.
begin;
do $$
declare
  v_company uuid;
  v_pending uuid;
  v_limit bigint;
  v_plan bigint := 26843545600;
  v_addon bigint := 10737418240;
begin
  insert into public.clinics (name, slug)
  values ('Stage06 paid company', 'stage06-paid-company')
  returning id into v_company;
  insert into public.account_subscriptions
    (scope_type, clinic_id, plan_code, status, billing_day,
     current_period_start, current_period_end, billing_provider,
     provider_environment, external_customer_id, external_subscription_id)
  values
    ('company', v_company, 'company_initial', 'active', 28,
     now(), now() + interval '1 month', 'asaas',
     'sandbox', 'cus_Stage06', 'sub_Stage06');

  v_limit := public.recalculate_clinic_storage_limit(v_company);
  if v_limit <> v_plan or
    (select storage_limit_bytes from public.clinics where id = v_company) <> v_plan then
    raise exception 'Paid plan allowance was not materialized';
  end if;

  -- Legacy included quota/courtesy must not be added twice to a larger plan.
  insert into public.clinic_storage_entitlements
    (clinic_id, entitlement_key, entitlement_type, bytes)
  values (v_company, 'base_included', 'base', 1073741824),
         (v_company, 'legacy_courtesy', 'courtesy', 9663676416);
  if (select storage_limit_bytes from public.clinics where id = v_company) <> v_plan then
    raise exception 'Legacy included storage inflated the paid plan';
  end if;

  insert into public.clinic_storage_entitlements
    (clinic_id, entitlement_key, entitlement_type, bytes)
  values (v_company, 'purchased_10gb', 'purchase', v_addon);
  if (select storage_limit_bytes from public.clinics where id = v_company) <> v_plan + v_addon then
    raise exception 'Purchase did not add to the paid plan allowance';
  end if;
  update public.clinic_storage_entitlements set status = 'cancelled'
  where clinic_id = v_company and entitlement_key = 'purchased_10gb';
  if (select storage_limit_bytes from public.clinics where id = v_company) <> v_plan then
    raise exception 'Cancelling an add-on did not preserve the paid plan';
  end if;

  insert into public.clinics (name, slug)
  values ('Stage06 pending company', 'stage06-pending-company')
  returning id into v_pending;
  insert into public.account_subscriptions
    (scope_type, clinic_id, plan_code, status, billing_day)
  values ('company', v_pending, 'company_advanced', 'pending_checkout', 28);
  if public.recalculate_clinic_storage_limit(v_pending) <> 1073741824 then
    raise exception 'Unpaid plan received a paid storage allowance';
  end if;
end $$;
rollback;

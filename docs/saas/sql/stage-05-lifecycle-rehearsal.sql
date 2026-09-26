-- Execute only against a disposable clean restore. Every fixture is rolled back.
begin;
do $$
declare
  v_clinic uuid;
  v_sub uuid;
  v_event public.billing_events%rowtype;
  v_start date := current_date - 1;
  v_end timestamptz := (current_date - 1 + interval '1 month')::timestamptz;
  v_result jsonb;
begin
  insert into public.clinics (name, slug)
  values ('Stage05 test only', 'stage05-rehearsal-only')
  returning id into v_clinic;
  insert into public.account_subscriptions (
    scope_type, clinic_id, plan_code, status, billing_day,
    current_period_start, current_period_end,
    billing_provider, provider_environment, external_customer_id,
    external_subscription_id
  ) values (
    'company', v_clinic, 'company_initial', 'active', 26,
    (v_start - interval '1 month')::timestamptz, v_start::timestamptz,
    'asaas', 'sandbox', 'cus_Stage05', 'sub_Stage05'
  ) returning id into v_sub;
  insert into public.billing_payments (
    subscription_id, clinic_id, amount_cents, currency, status,
    provider, provider_environment, provider_payment_id,
    paid_at, period_start, period_end
  ) values (
    v_sub, v_clinic, 24900, 'BRL', 'paid',
    'asaas', 'sandbox', 'pay_Stage05First',
    now(), (v_start - interval '1 month')::timestamptz, v_start::timestamptz
  );

  perform public.billing_receive_asaas_event(
    'sandbox','evt_Stage05Overdue','PAYMENT_OVERDUE',
    '{"paymentId":"pay_Stage05Next"}'::jsonb
  );
  perform * from public.billing_claim_asaas_events('sandbox', 10);
  select * into v_event from public.billing_events
  where provider_event_id = 'evt_Stage05Overdue';
  v_result := public.billing_apply_asaas_payment_lifecycle(
    v_event.id, v_event.lease_token, 'pay_Stage05Next',
    'cus_Stage05','sub_Stage05',24900,v_start,'OVERDUE'
  );
  if v_result->>'effect' <> 'overdue'
    or (select status from public.account_subscriptions where id = v_sub) <> 'past_due'
    or (select count(*) from public.billing_payments
        where subscription_id = v_sub and status = 'pending') <> 1 then
    raise exception 'Overdue must start grace without creating a paid invoice';
  end if;

  -- A wrong customer may not end grace or alter the company entitlement.
  update public.account_subscriptions set grace_until = now() - interval '1 second'
  where id = v_sub;
  if public.billing_suspend_asaas_expired_grace(
    v_sub,'sandbox','pay_Stage05Next','cus_Other','sub_Stage05','OVERDUE'
  ) then
    raise exception 'Wrong customer suspended a company';
  end if;
  if not public.billing_suspend_asaas_expired_grace(
    v_sub,'sandbox','pay_Stage05Next','cus_Stage05','sub_Stage05','OVERDUE'
  ) or (select status from public.account_subscriptions where id = v_sub) <> 'suspended' then
    raise exception 'Verified overdue invoice did not suspend after grace';
  end if;

  perform public.billing_receive_asaas_event(
    'sandbox','evt_Stage05Paid','PAYMENT_CONFIRMED',
    '{"paymentId":"pay_Stage05Next"}'::jsonb
  );
  perform * from public.billing_claim_asaas_events('sandbox', 10);
  select * into v_event from public.billing_events
  where provider_event_id = 'evt_Stage05Paid';
  begin
    perform public.billing_apply_asaas_payment_lifecycle(
      v_event.id, v_event.lease_token, 'pay_Stage05Next',
      'cus_Other','sub_Stage05',24900,v_start,'CONFIRMED'
    );
    raise exception 'Wrong customer unexpectedly changed entitlement';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'BILLING_LIFECYCLE_OWNERSHIP_MISMATCH' then
      raise;
    end if;
  end;
  if (select status from public.account_subscriptions where id = v_sub) <> 'suspended'
    or (select status from public.billing_payments
        where provider_payment_id = 'pay_Stage05Next') <> 'pending' then
    raise exception 'Failed reconciliation mutated paid state';
  end if;
  v_result := public.billing_apply_asaas_payment_lifecycle(
    v_event.id, v_event.lease_token, 'pay_Stage05Next',
    'cus_Stage05','sub_Stage05',24900,v_start,'CONFIRMED'
  );
  if v_result->>'effect' <> 'paid'
    or (select status from public.account_subscriptions where id = v_sub) <> 'active'
    or (select current_period_end from public.account_subscriptions where id = v_sub)
      is distinct from v_end
    or (select count(*) from public.billing_payments
        where subscription_id = v_sub and status = 'paid') <> 2 then
    raise exception 'Verified late payment must reactivate exactly once';
  end if;

  perform public.billing_receive_asaas_event(
    'sandbox','evt_Stage05Duplicate','PAYMENT_RECEIVED',
    '{"paymentId":"pay_Stage05Next"}'::jsonb
  );
  perform * from public.billing_claim_asaas_events('sandbox', 10);
  select * into v_event from public.billing_events
  where provider_event_id = 'evt_Stage05Duplicate';
  perform public.billing_apply_asaas_payment_lifecycle(
    v_event.id, v_event.lease_token, 'pay_Stage05Next',
    'cus_Stage05','sub_Stage05',24900,v_start,'RECEIVED'
  );
  if (select count(*) from public.billing_payments
      where subscription_id = v_sub and provider_payment_id = 'pay_Stage05Next') <> 1 then
    raise exception 'Duplicate payment event created duplicate ledger entry';
  end if;

  perform public.billing_receive_asaas_event(
    'sandbox','evt_Stage05Cancel','SUBSCRIPTION_INACTIVATED',
    '{"subscriptionId":"sub_Stage05"}'::jsonb
  );
  perform * from public.billing_claim_asaas_events('sandbox', 10);
  select * into v_event from public.billing_events
  where provider_event_id = 'evt_Stage05Cancel';
  perform public.billing_apply_asaas_subscription_lifecycle(
    v_event.id, v_event.lease_token, 'sub_Stage05', 'cus_Stage05',
    'dentalflow:subscription:' || v_sub::text, 24900, 'MONTHLY', 'INACTIVE'
  );
  if (select status from public.account_subscriptions where id = v_sub) <> 'canceled'
    or (select current_period_end from public.account_subscriptions where id = v_sub)
      is distinct from v_end then
    raise exception 'Cancellation must preserve the already paid period';
  end if;

  perform public.billing_receive_asaas_event(
    'sandbox','evt_Stage05Refund','PAYMENT_REFUNDED',
    '{"paymentId":"pay_Stage05Next"}'::jsonb
  );
  perform * from public.billing_claim_asaas_events('sandbox', 10);
  select * into v_event from public.billing_events
  where provider_event_id = 'evt_Stage05Refund';
  perform public.billing_apply_asaas_payment_lifecycle(
    v_event.id, v_event.lease_token, 'pay_Stage05Next',
    'cus_Stage05','sub_Stage05',24900,v_start,'REFUNDED'
  );
  if (select status from public.billing_payments
      where provider_payment_id = 'pay_Stage05Next') <> 'refunded'
    or (select current_period_end from public.account_subscriptions where id = v_sub)
      is distinct from v_start::timestamptz
    or (select public.subscription_access_mode(
      status, current_period_end, grace_until
    ) from public.account_subscriptions where id = v_sub) <> 'billing_only' then
    raise exception 'Refund must revoke the reversed period without deleting data';
  end if;
end $$;
select 'passed' as stage_05_lifecycle_rehearsal;
rollback;

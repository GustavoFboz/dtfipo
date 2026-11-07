-- Disposable clean restore only; all rows and events are rolled back.
begin;
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('70000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'price-rehearsal@test.invalid', '', now(), now());
insert into public.clinics (id, name, slug, owner_id)
values ('70000000-0000-4000-8000-000000000002', 'Old price only',
        'price-rehearsal-old', '70000000-0000-4000-8000-000000000001'),
       ('70000000-0000-4000-8000-000000000003', 'New price only',
        'price-rehearsal-new', '70000000-0000-4000-8000-000000000001'),
       ('70000000-0000-4000-8000-000000000006', 'Historical R1 only',
        'price-rehearsal-r1', '70000000-0000-4000-8000-000000000001');
insert into public.account_subscriptions
  (id, scope_type, clinic_id, plan_code, status, billing_day,
   current_period_start, current_period_end, billing_provider,
   provider_environment, external_customer_id, external_subscription_id)
values ('70000000-0000-4000-8000-000000000004', 'company',
        '70000000-0000-4000-8000-000000000002', 'company_initial', 'active', 28,
        now(), now() + interval '1 month', 'asaas', 'sandbox', 'cus_OldPrice', 'sub_OldPrice'),
       ('70000000-0000-4000-8000-000000000007', 'company',
        '70000000-0000-4000-8000-000000000006', 'company_initial', 'active', 28,
        now(), now() + interval '1 month', 'asaas', 'sandbox', 'cus_OldR1', 'sub_OldR1');
insert into public.account_subscriptions
  (id, scope_type, clinic_id, plan_code, status, billing_day)
values ('70000000-0000-4000-8000-000000000005', 'company',
        '70000000-0000-4000-8000-000000000003', 'company_initial', 'pending_checkout', 28);
insert into public.checkout_intents
  (user_id, clinic_id, subscription_id, plan_code, amount_cents, currency,
   status, billing_provider, provider_environment)
values ('70000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000002',
        '70000000-0000-4000-8000-000000000004', 'company_initial', 24900,
        'BRL', 'paid', 'asaas', 'sandbox'),
       ('70000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000003',
        '70000000-0000-4000-8000-000000000005', 'company_initial', 100,
        'BRL', 'pending', null, null),
       ('70000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000006',
        '70000000-0000-4000-8000-000000000007', 'company_initial', 100,
        'BRL', 'paid', 'asaas', 'sandbox');
do $$
begin
  if public.billing_subscription_contract_amount('70000000-0000-4000-8000-000000000004') <> 24900 then
    raise exception 'Existing subscription lost its R$ 249 contract';
  end if;
  if public.billing_subscription_contract_amount('70000000-0000-4000-8000-000000000007') <> 100 then
    raise exception 'Historical subscription lost its R$ 1 contract';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare v_checkout jsonb;
begin
  v_checkout := public.create_checkout_intent(
    'company_initial', '70000000-0000-4000-8000-000000000003', array['laboratory']);
  if (v_checkout->>'amount_cents')::integer <> 500
     or (select count(*) from public.checkout_intents
         where subscription_id='70000000-0000-4000-8000-000000000005'
           and status='canceled' and amount_cents=100) <> 1 then
    raise exception 'Old pending checkout was reused at the wrong price';
  end if;
  if (public.company_subscription_snapshot('70000000-0000-4000-8000-000000000002')
      ->>'monthly_price_cents')::integer <> 24900 then
    raise exception 'Existing company displays new price instead of original contract';
  end if;
  if (public.company_subscription_snapshot('70000000-0000-4000-8000-000000000003')
      ->>'monthly_price_cents')::integer <> 500 then
    raise exception 'New company does not display the R$ 5 checkout';
  end if;
  if (public.company_subscription_snapshot('70000000-0000-4000-8000-000000000006')
      ->>'monthly_price_cents')::integer <> 100 then
    raise exception 'Historical company no longer displays its R$ 1 contract';
  end if;
end $$;
reset role;
select 'passed' as price_snapshot_rehearsal;
rollback;

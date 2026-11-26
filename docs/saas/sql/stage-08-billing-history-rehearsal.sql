-- Clean restore only: manager history, member denial and private provider lookup.
begin;
insert into auth.users
 (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
 ('72000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','billing-owner@test.invalid','',now(),now()),
 ('72000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','billing-outsider@test.invalid','',now(),now());
insert into public.clinics(id,name,slug,owner_id)
values ('72000000-0000-4000-8000-000000000003','Billing history test','billing-history-test',
        '72000000-0000-4000-8000-000000000001');
insert into public.account_subscriptions
 (id,scope_type,clinic_id,plan_code,status,billing_day,billing_provider,
  provider_environment,external_customer_id,external_subscription_id)
values ('72000000-0000-4000-8000-000000000004','company',
 '72000000-0000-4000-8000-000000000003','company_initial','active',28,'asaas',
 'sandbox','cus_History','sub_History');
insert into public.billing_payments
 (id,subscription_id,clinic_id,amount_cents,currency,status,provider,
  provider_environment,provider_payment_id,paid_at)
values ('72000000-0000-4000-8000-000000000005',
 '72000000-0000-4000-8000-000000000004',
 '72000000-0000-4000-8000-000000000003',100,'BRL','paid','asaas',
 'sandbox','pay_History',now());

select set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',
 '{"sub":"72000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin
    perform public.billing_company_history('72000000-0000-4000-8000-000000000003');
    raise exception 'Outsider read billing history';
  exception when others then
    if sqlerrm <> 'BILLING_HISTORY_FORBIDDEN' then raise; end if;
  end;
  if exists(select 1 from public.billing_payments where id='72000000-0000-4000-8000-000000000005') then
    raise exception 'Outsider read billing payment directly';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',
 '{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if jsonb_array_length(public.billing_company_history(
     '72000000-0000-4000-8000-000000000003')->'payments') <> 1 then
    raise exception 'Company owner cannot read its ledger';
  end if;
  if not exists(select 1 from public.billing_payments where id='72000000-0000-4000-8000-000000000005') then
    raise exception 'Manager direct payment policy unexpectedly denied';
  end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('authenticated',
      'public.billing_get_asaas_payment_document_context(uuid,uuid,text)','execute') then
    raise exception 'Browser can call provider document context';
  end if;
  if has_table_privilege('authenticated','public.platform_operators','select')
    or has_table_privilege('authenticated','public.platform_operator_audit','select') then
    raise exception 'Restored Master tables have client grants';
  end if;
  if (public.billing_get_asaas_payment_document_context(
      '72000000-0000-4000-8000-000000000005',
      '72000000-0000-4000-8000-000000000001','sandbox')->>'payment_id') <> 'pay_History' then
    raise exception 'Private payment document context invalid';
  end if;
end $$;
select 'passed' as stage_08_billing_history;
rollback;

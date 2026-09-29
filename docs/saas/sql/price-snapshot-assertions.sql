-- Read only: safe on both disposable restores and the active Lovable database.
begin transaction read only;
do $$
begin
  if (select monthly_price_cents from public.billing_plans where code = 'company_initial') <> 100 then
    raise exception 'Initial plan is not R$ 1';
  end if;
  if to_regprocedure('public.billing_subscription_contract_amount(uuid)') is null
     or has_function_privilege('anon', 'public.billing_subscription_contract_amount(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.billing_subscription_contract_amount(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.billing_subscription_contract_amount(uuid)', 'execute') then
    raise exception 'Contract amount helper grant diagnostic: exists %, anon %, authenticated %, service %',
      to_regprocedure('public.billing_subscription_contract_amount(uuid)'),
      has_function_privilege('anon', 'public.billing_subscription_contract_amount(uuid)', 'execute'),
      has_function_privilege('authenticated', 'public.billing_subscription_contract_amount(uuid)', 'execute'),
      has_function_privilege('service_role', 'public.billing_subscription_contract_amount(uuid)', 'execute');
  end if;
  if exists (
    select 1 from public.account_subscriptions s
    where s.billing_provider = 'asaas' and s.external_subscription_id is not null
      and public.billing_subscription_contract_amount(s.id) is null
  ) then
    raise exception 'Linked subscription lacks an original amount';
  end if;
end $$;
select 'passed' as price_snapshot_contract;
rollback;

-- DentalFlow SaaS Stage 01 clean-restore assertions.
-- Run only against an isolated disposable database after public/restore.sql.

begin;

do $$
declare
  missing_columns text;
  missing_indexes text;
begin
  select string_agg(format('%I.%I', expected.table_name, expected.column_name), ', ')
    into missing_columns
  from (values
    ('account_subscriptions','provider_environment'),
    ('account_subscriptions','billing_cycle'),
    ('checkout_intents','provider_environment'),
    ('checkout_intents','provider_payment_id'),
    ('checkout_intents','provider_payment_url'),
    ('billing_payments','provider_environment'),
    ('billing_events','provider_environment'),
    ('company_billing_profiles','clinic_id'),
    ('company_billing_profiles','tax_id_digits'),
    ('billing_provider_customers','clinic_id'),
    ('billing_provider_customers','provider_environment'),
    ('billing_provider_customers','provider_customer_id')
  ) as expected(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns actual
    where actual.table_schema = 'public'
      and actual.table_name = expected.table_name
      and actual.column_name = expected.column_name
  );

  if missing_columns is not null then
    raise exception 'Missing restored Stage 01 columns: %', missing_columns;
  end if;

  select string_agg(expected.index_name, ', ')
    into missing_indexes
  from (values
    ('account_subscriptions_provider_subscription_uidx'),
    ('checkout_intents_provider_checkout_uidx'),
    ('checkout_intents_provider_payment_uidx'),
    ('billing_payments_provider_payment_uidx'),
    ('billing_events_provider_event_uidx'),
    ('billing_provider_customers_provider_customer_uidx')
  ) as expected(index_name)
  where not exists (
    select 1
    from pg_indexes actual
    where actual.schemaname = 'public'
      and actual.indexname = expected.index_name
  );

  if missing_indexes is not null then
    raise exception 'Missing restored Stage 01 indexes: %', missing_indexes;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_subscriptions'
      and column_name = 'billing_cycle'
      and is_nullable = 'NO'
      and column_default like '%MONTHLY%'
  ) then
    raise exception 'account_subscriptions.billing_cycle lost its MONTHLY non-null contract';
  end if;

  if not coalesce((
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'company_billing_profiles'
  ), false) then
    raise exception 'RLS is disabled on company_billing_profiles';
  end if;

  if not coalesce((
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'billing_provider_customers'
  ), false) then
    raise exception 'RLS is disabled on billing_provider_customers';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('company_billing_profiles', 'billing_provider_customers')
  ) then
    raise exception 'A client policy exposes a restricted Stage 01 table';
  end if;

  if has_table_privilege('anon', 'public.company_billing_profiles', 'select')
    or has_table_privilege('authenticated', 'public.company_billing_profiles', 'select')
    or has_table_privilege('authenticated', 'public.billing_provider_customers', 'select') then
    raise exception 'A client role can read a restricted Stage 01 table';
  end if;

  if not has_table_privilege('service_role', 'public.company_billing_profiles', 'select')
    or not has_table_privilege('service_role', 'public.billing_provider_customers', 'select') then
    raise exception 'service_role cannot read the restored Stage 01 tables';
  end if;

  if to_regprocedure('public.billing_get_company_profile(uuid)') is null
    or to_regprocedure('public.billing_upsert_company_profile(uuid,text,text,text,text,text,text,text,text,text,text,text)') is null
    or to_regprocedure('public.billing_bind_asaas_customer(uuid,text,text)') is null then
    raise exception 'A Stage 01 billing RPC is missing after restore';
  end if;

  if has_function_privilege('anon', 'public.billing_get_company_profile(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.billing_get_company_profile(uuid)', 'execute')
    or has_function_privilege('anon', 'public.billing_upsert_company_profile(uuid,text,text,text,text,text,text,text,text,text,text,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.billing_upsert_company_profile(uuid,text,text,text,text,text,text,text,text,text,text,text)', 'execute') then
    raise exception 'Restored profile RPC grants do not match the Stage 01 contract';
  end if;

  if has_function_privilege('anon', 'public.billing_bind_asaas_customer(uuid,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.billing_bind_asaas_customer(uuid,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.billing_bind_asaas_customer(uuid,text,text)', 'execute') then
    raise exception 'billing_bind_asaas_customer is not service_role-only after restore';
  end if;

  if has_function_privilege('anon', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'execute')
    or has_function_privilege('authenticated', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'execute')
    or not has_function_privilege('service_role', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'execute')
    or has_function_privilege('anon', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'execute') then
    raise exception 'A restored financial mutation is not service_role-only';
  end if;

  if to_regprocedure('public.__restore_exec(text)') is not null
    or to_regprocedure('_restore.exec_sql(text)') is not null
    or to_regnamespace('_restore') is not null then
    raise exception 'A privileged restore-only SQL executor survived the restore';
  end if;

  if exists (
    select 1 from public.account_subscriptions where billing_cycle <> 'MONTHLY'
  ) then
    raise exception 'A restored subscription violates the MONTHLY billing cycle';
  end if;
end
$$;

select jsonb_build_object(
  'rehearsal', 'dentalflow_saas_stage_01_clean_restore',
  'result', 'passed',
  'company_billing_profiles', to_regclass('public.company_billing_profiles') is not null,
  'billing_provider_customers', to_regclass('public.billing_provider_customers') is not null,
  'billing_cycle', 'MONTHLY',
  'restricted_tables', true,
  'service_role_mutations', true,
  'restore_helpers_removed', true
) as stage_01_restore_report;

rollback;

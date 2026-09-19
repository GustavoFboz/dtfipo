-- DentalFlow SaaS — Stage 01 live verification.
-- Read-only and sanitized: exports counts/booleans only, never fiscal values.

begin transaction read only;

with
expected_columns(table_name, column_name) as (
  values
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
),
column_report as (
  select e.table_name, e.column_name, (c.column_name is not null) as present
  from expected_columns e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = e.table_name
   and c.column_name = e.column_name
),
expected_indexes(index_name) as (
  values
    ('account_subscriptions_provider_subscription_uidx'),
    ('checkout_intents_provider_checkout_uidx'),
    ('checkout_intents_provider_payment_uidx'),
    ('billing_payments_provider_payment_uidx'),
    ('billing_events_provider_event_uidx'),
    ('billing_provider_customers_provider_customer_uidx')
),
index_report as (
  select e.index_name, (i.indexname is not null) as present
  from expected_indexes e
  left join pg_indexes i
    on i.schemaname = 'public' and i.indexname = e.index_name
),
profile_security as (
  select jsonb_build_object(
    'rls_enabled', coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'company_billing_profiles'
    ), false),
    'client_policy_count', (
      select count(*)
      from pg_policies
      where schemaname = 'public' and tablename = 'company_billing_profiles'
    ),
    'anon_select', has_table_privilege('anon', 'public.company_billing_profiles', 'select'),
    'authenticated_select', has_table_privilege('authenticated', 'public.company_billing_profiles', 'select'),
    'service_role_select', has_table_privilege('service_role', 'public.company_billing_profiles', 'select'),
    'provider_customers_rls_enabled', coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'billing_provider_customers'
    ), false),
    'provider_customers_authenticated_select', has_table_privilege(
      'authenticated', 'public.billing_provider_customers', 'select'
    ),
    'provider_customers_service_role_select', has_table_privilege(
      'service_role', 'public.billing_provider_customers', 'select'
    )
  ) as report
),
rpc_security as (
  select jsonb_build_object(
    'get_profile', jsonb_build_object(
      'anon', has_function_privilege('anon', 'public.billing_get_company_profile(uuid)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.billing_get_company_profile(uuid)', 'execute')
    ),
    'upsert_profile', jsonb_build_object(
      'anon', has_function_privilege(
        'anon',
        'public.billing_upsert_company_profile(uuid,text,text,text,text,text,text,text,text,text,text,text)',
        'execute'
      ),
      'authenticated', has_function_privilege(
        'authenticated',
        'public.billing_upsert_company_profile(uuid,text,text,text,text,text,text,text,text,text,text,text)',
        'execute'
      )
    ),
    'bind_asaas_customer', jsonb_build_object(
      'anon', has_function_privilege('anon', 'public.billing_bind_asaas_customer(uuid,text,text)', 'execute'),
      'authenticated', has_function_privilege('authenticated', 'public.billing_bind_asaas_customer(uuid,text,text)', 'execute'),
      'service_role', has_function_privilege('service_role', 'public.billing_bind_asaas_customer(uuid,text,text)', 'execute')
    )
  ) as report
),
integrity as (
  select jsonb_build_object(
    'profiles_total', (select count(*) from public.company_billing_profiles),
    'profiles_bound_sandbox', (
      select count(*) from public.billing_provider_customers
      where provider = 'asaas' and provider_environment = 'sandbox'
    ),
    'profiles_bound_production', (
      select count(*) from public.billing_provider_customers
      where provider = 'asaas' and provider_environment = 'production'
    ),
    'invalid_profile_provider_tuples', (
      select count(*) from public.billing_provider_customers
      where provider <> 'asaas'
         or provider_environment not in ('sandbox','production')
         or provider_customer_id is null
    ),
    'duplicate_provider_customers', (
      select count(*) from (
        select provider, provider_environment, provider_customer_id
        from public.billing_provider_customers
        group by provider, provider_environment, provider_customer_id
        having count(*) > 1
      ) d
    ),
    'duplicate_provider_subscriptions', (
      select count(*) from (
        select billing_provider, provider_environment, external_subscription_id
        from public.account_subscriptions
        where external_subscription_id is not null
        group by billing_provider, provider_environment, external_subscription_id
        having count(*) > 1
      ) d
    ),
    'duplicate_provider_payments', (
      select count(*) from (
        select provider, provider_environment, provider_payment_id
        from public.billing_payments
        where provider_payment_id is not null
        group by provider, provider_environment, provider_payment_id
        having count(*) > 1
      ) d
    ),
    'duplicate_provider_events', (
      select count(*) from (
        select provider, provider_environment, provider_event_id
        from public.billing_events
        group by provider, provider_environment, provider_event_id
        having count(*) > 1
      ) d
    ),
    'non_monthly_subscriptions', (
      select count(*) from public.account_subscriptions where billing_cycle <> 'MONTHLY'
    )
  ) as report
)
select jsonb_build_object(
  'audit', 'dentalflow_saas_stage_01',
  'generated_at', now(),
  'migration_present', exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'company_billing_profiles'
  ),
  'columns', (
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'column', column_name,
      'present', present
    ) order by table_name, column_name)
    from column_report
  ),
  'indexes', (
    select jsonb_agg(jsonb_build_object('index', index_name, 'present', present) order by index_name)
    from index_report
  ),
  'profile_security', (select report from profile_security),
  'rpc_security', (select report from rpc_security),
  'integrity', (select report from integrity)
) as stage_01_audit_report;

rollback;

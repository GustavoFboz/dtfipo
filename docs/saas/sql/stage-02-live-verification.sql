-- DentalFlow SaaS — Stage 02 live verification (read-only).
-- Safe to run in Lovable Cloud SQL editor. It does not mutate data.

with function_oids(check_name, function_oid) as (
  values
    (
      'claim_operation_function_exists',
      to_regprocedure(
        'public.billing_claim_provider_operation(text,text,text,text,text,integer)'
      )
    ),
    (
      'finish_operation_function_exists',
      to_regprocedure(
        'public.billing_finish_provider_operation(uuid,uuid,text,text,text)'
      )
    ),
    (
      'provisioning_context_function_exists',
      to_regprocedure(
        'public.billing_get_asaas_provisioning_context(uuid,uuid,text)'
      )
    ),
    (
      'bind_customer_function_exists',
      to_regprocedure(
        'public.billing_bind_asaas_customer(uuid,text,text)'
      )
    ),
    (
      'bind_subscription_function_exists',
      to_regprocedure(
        'public.billing_bind_asaas_subscription(uuid,text,text,text)'
      )
    )
),
operations_table as (
  select
    to_regclass('public.billing_provider_operations') as table_oid,
    coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'billing_provider_operations'
    ), false) as rls_enabled
),
checks(check_name, passed) as (
  select 'operations_table_exists', table_oid is not null
  from operations_table

  union all

  select 'operations_rls_enabled', rls_enabled
  from operations_table

  union all

  select
    'anon_cannot_read_operations',
    not coalesce(
      has_table_privilege('anon', table_oid, 'select'),
      false
    )
  from operations_table

  union all

  select
    'authenticated_cannot_read_operations',
    not coalesce(
      has_table_privilege('authenticated', table_oid, 'select'),
      false
    )
  from operations_table

  union all

  select
    'service_role_can_read_operations',
    coalesce(
      has_table_privilege('service_role', table_oid, 'select'),
      false
    )
  from operations_table

  union all

  select check_name, function_oid is not null
  from function_oids

  union all

  select
    check_name || '_not_executable_by_anon',
    not coalesce(
      has_function_privilege('anon', function_oid, 'execute'),
      false
    )
  from function_oids

  union all

  select
    check_name || '_not_executable_by_authenticated',
    not coalesce(
      has_function_privilege('authenticated', function_oid, 'execute'),
      false
    )
  from function_oids

  union all

  select
    check_name || '_executable_by_service_role',
    coalesce(
      has_function_privilege('service_role', function_oid, 'execute'),
      false
    )
  from function_oids
)
select jsonb_build_object(
  'stage', '02',
  'result', case when bool_and(passed) then 'passed' else 'failed' end,
  'checks', jsonb_object_agg(check_name, passed order by check_name)
) as stage_02_live_report
from checks;

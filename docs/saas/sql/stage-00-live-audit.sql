-- DentalFlow SaaS — Etapa 00
-- Auditoria SOMENTE LEITURA para executar no Lovable Cloud SQL editor.
-- Não copie dados pessoais para a PR; anexe apenas contagens e invariantes.

begin transaction read only;

-- 1. Presença do schema esperado.
select expected_object, to_regclass(expected_object) as live_object
from unnest(array[
  'public.billing_plans',
  'public.account_subscriptions',
  'public.checkout_intents',
  'public.billing_payments',
  'public.billing_events',
  'public.billing_test_tokens',
  'public.billing_test_access',
  'public.company_sessions',
  'public.clinic_storage_entitlements'
]) as expected(expected_object)
order by expected_object;

-- 2. Contrato de planos ativo.
select code, account_scope, name, monthly_price_cents, currency,
       max_sessions, max_members, storage_bytes, is_active, display_order
from public.billing_plans
order by display_order, code;

-- 3. Distribuição sem expor empresas ou usuários.
select status, count(*) as subscriptions
from public.account_subscriptions
group by status
order by status;

select status, count(*) as checkout_intents
from public.checkout_intents
group by status
order by status;

select status, count(*) as payments
from public.billing_payments
group by status
order by status;

select provider, status, count(*) as events,
       min(received_at) as oldest_event,
       max(received_at) as newest_event
from public.billing_events
group by provider, status
order by provider, status;

-- 4. Integridade referencial e estados que exigem investigação.
select count(*) as orphan_checkout_intents
from public.checkout_intents i
left join public.account_subscriptions s on s.id = i.subscription_id
where s.id is null;

select count(*) as orphan_payments
from public.billing_payments p
left join public.account_subscriptions s on s.id = p.subscription_id
where s.id is null;

select billing_provider, external_subscription_id, count(*) as duplicates
from public.account_subscriptions
where billing_provider is not null and external_subscription_id is not null
group by billing_provider, external_subscription_id
having count(*) > 1;

select provider, provider_payment_id, count(*) as duplicates
from public.billing_payments
where provider is not null and provider_payment_id is not null
group by provider, provider_payment_id
having count(*) > 1;

select count(*) as stale_pending_checkouts
from public.checkout_intents
where status in ('pending', 'provider_created') and expires_at < now();

select count(*) as expired_full_access_candidates
from public.account_subscriptions
where status in ('active', 'trialing')
  and current_period_end is not null
  and current_period_end < now();

-- 5. RLS deve estar habilitada em todas as tabelas financeiras.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'billing_plans','account_subscriptions','checkout_intents',
    'billing_payments','billing_events','billing_test_tokens',
    'billing_test_access','company_sessions'
  )
order by c.relname;

-- 6. As duas mutações financeiras não podem ser executáveis pelo cliente.
select
  to_regprocedure('public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)') as paid_rpc,
  has_function_privilege('anon', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'EXECUTE') as anon_can_apply_paid,
  has_function_privilege('authenticated', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'EXECUTE') as authenticated_can_apply_paid,
  has_function_privilege('service_role', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'EXECUTE') as service_can_apply_paid;

select
  to_regprocedure('public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)') as state_rpc,
  has_function_privilege('anon', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'EXECUTE') as anon_can_apply_state,
  has_function_privilege('authenticated', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'EXECUTE') as authenticated_can_apply_state,
  has_function_privilege('service_role', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'EXECUTE') as service_can_apply_state;

-- 7. Relatório consolidado. Este deve ser o último SELECT para que o editor do
-- Lovable mostre/exporte toda a auditoria em um único resultado, sem nomes,
-- UUIDs, e-mails ou dados clínicos.
with
schema_presence as (
  select jsonb_build_object(
    'all_present', bool_and(to_regclass(expected_object) is not null),
    'objects', jsonb_agg(jsonb_build_object(
      'object', expected_object,
      'present', to_regclass(expected_object) is not null
    ) order by expected_object)
  ) as data
  from unnest(array[
    'public.billing_plans',
    'public.account_subscriptions',
    'public.checkout_intents',
    'public.billing_payments',
    'public.billing_events',
    'public.billing_test_tokens',
    'public.billing_test_access',
    'public.company_sessions',
    'public.clinic_storage_entitlements'
  ]) as expected(expected_object)
),
plans as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code,
    'monthly_price_cents', monthly_price_cents,
    'currency', currency,
    'max_sessions', max_sessions,
    'max_members', max_members,
    'storage_bytes', storage_bytes,
    'is_active', is_active
  ) order by display_order, code), '[]'::jsonb) as data
  from public.billing_plans
),
subscription_counts as (
  select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) as data
  from (
    select status, count(*) as total
    from public.account_subscriptions
    group by status
  ) grouped
),
checkout_counts as (
  select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) as data
  from (
    select status, count(*) as total
    from public.checkout_intents
    group by status
  ) grouped
),
payment_counts as (
  select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) as data
  from (
    select status, count(*) as total
    from public.billing_payments
    group by status
  ) grouped
),
event_counts as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', provider,
    'status', status,
    'events', events,
    'oldest_event', oldest_event,
    'newest_event', newest_event
  ) order by provider, status), '[]'::jsonb) as data
  from (
    select provider, status, count(*) as events,
           min(received_at) as oldest_event,
           max(received_at) as newest_event
    from public.billing_events
    group by provider, status
  ) grouped
),
integrity as (
  select jsonb_build_object(
    'orphan_checkout_intents', (
      select count(*)
      from public.checkout_intents i
      left join public.account_subscriptions s on s.id = i.subscription_id
      where s.id is null
    ),
    'orphan_payments', (
      select count(*)
      from public.billing_payments p
      left join public.account_subscriptions s on s.id = p.subscription_id
      where s.id is null
    ),
    'duplicate_external_subscription_groups', (
      select count(*)
      from (
        select 1
        from public.account_subscriptions
        where billing_provider is not null
          and external_subscription_id is not null
        group by billing_provider, external_subscription_id
        having count(*) > 1
      ) duplicates
    ),
    'duplicate_provider_payment_groups', (
      select count(*)
      from (
        select 1
        from public.billing_payments
        where provider is not null and provider_payment_id is not null
        group by provider, provider_payment_id
        having count(*) > 1
      ) duplicates
    ),
    'stale_pending_checkouts', (
      select count(*)
      from public.checkout_intents
      where status in ('pending', 'provider_created') and expires_at < now()
    ),
    'expired_full_access_candidates', (
      select count(*)
      from public.account_subscriptions
      where status in ('active', 'trialing')
        and current_period_end is not null
        and current_period_end < now()
    )
  ) as data
),
rls as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'table', c.relname,
    'enabled', c.relrowsecurity,
    'forced', c.relforcerowsecurity
  ) order by c.relname), '[]'::jsonb) as data
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'billing_plans','account_subscriptions','checkout_intents',
      'billing_payments','billing_events','billing_test_tokens',
      'billing_test_access','company_sessions'
    )
),
rpc_privileges as (
  select jsonb_build_object(
    'paid_rpc_exists', to_regprocedure('public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)') is not null,
    'paid_anon_execute', has_function_privilege('anon', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'EXECUTE'),
    'paid_authenticated_execute', has_function_privilege('authenticated', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'EXECUTE'),
    'paid_service_execute', has_function_privilege('service_role', 'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)', 'EXECUTE'),
    'state_rpc_exists', to_regprocedure('public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)') is not null,
    'state_anon_execute', has_function_privilege('anon', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'EXECUTE'),
    'state_authenticated_execute', has_function_privilege('authenticated', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'EXECUTE'),
    'state_service_execute', has_function_privilege('service_role', 'public.billing_apply_subscription_state(uuid,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'EXECUTE')
  ) as data
),
ipo_rows as (
  select value as item
  from jsonb_array_elements(public.ipo_internal_invariant_report())
),
ipo_summary as (
  select jsonb_build_object(
    'records', count(*),
    'all_billing_exempt', coalesce(bool_and(coalesce((item->>'billing_exempt')::boolean, false)), false),
    'all_storage_ok', coalesce(bool_and(coalesce((item->>'storage_ok')::boolean, false)), false),
    'all_subscription_ok', coalesce(bool_and(coalesce((item->>'subscription_ok')::boolean, false)), false),
    'all_sessions_ok', coalesce(bool_and(coalesce((item->>'sessions_ok')::boolean, false)), false),
    'all_legacy_modules_ok', coalesce(bool_and(coalesce((item->>'legacy_modules_ok')::boolean, false)), false),
    'profiles', coalesce(sum((item->>'profiles')::bigint), 0),
    'members', coalesce(sum((item->>'members')::bigint), 0)
  ) as data
  from ipo_rows
)
select jsonb_pretty(jsonb_build_object(
  'generated_at', now(),
  'schema', schema_presence.data,
  'plans', plans.data,
  'subscriptions_by_status', subscription_counts.data,
  'checkout_intents_by_status', checkout_counts.data,
  'payments_by_status', payment_counts.data,
  'events', event_counts.data,
  'integrity', integrity.data,
  'rls', rls.data,
  'rpc_privileges', rpc_privileges.data,
  'ipo', ipo_summary.data
)) as stage_00_audit_report
from schema_presence, plans, subscription_counts, checkout_counts,
     payment_counts, event_counts, integrity, rls, rpc_privileges, ipo_summary;

rollback;

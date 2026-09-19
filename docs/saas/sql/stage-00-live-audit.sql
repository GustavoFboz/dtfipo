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

-- 7. Invariantes da conta interna, sem retornar dados clínicos.
select public.ipo_internal_invariant_report() as ipo_invariants;

rollback;


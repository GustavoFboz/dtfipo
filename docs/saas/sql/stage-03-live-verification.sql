-- DentalFlow SaaS — Stage 03 live verification.
-- Read-only and sanitized: returns booleans/counts only.

begin transaction read only;

with checks(check_name, passed) as (
  values
    (
      'checkout_context_exists',
      to_regprocedure(
        'public.billing_get_checkout_provisioning_context(uuid,uuid,text)'
      ) is not null
    ),
    (
      'checkout_ready_exists',
      to_regprocedure(
        'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)'
      ) is not null
    ),
    (
      'checkout_context_blocked_for_anon',
      not has_function_privilege(
        'anon',
        'public.billing_get_checkout_provisioning_context(uuid,uuid,text)',
        'execute'
      )
    ),
    (
      'checkout_context_blocked_for_authenticated',
      not has_function_privilege(
        'authenticated',
        'public.billing_get_checkout_provisioning_context(uuid,uuid,text)',
        'execute'
      )
    ),
    (
      'checkout_context_allowed_for_service_role',
      has_function_privilege(
        'service_role',
        'public.billing_get_checkout_provisioning_context(uuid,uuid,text)',
        'execute'
      )
    ),
    (
      'checkout_ready_blocked_for_anon',
      not has_function_privilege(
        'anon',
        'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)',
        'execute'
      )
    ),
    (
      'checkout_ready_blocked_for_authenticated',
      not has_function_privilege(
        'authenticated',
        'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)',
        'execute'
      )
    ),
    (
      'checkout_ready_allowed_for_service_role',
      has_function_privilege(
        'service_role',
        'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)',
        'execute'
      )
    ),
    (
      'payment_confirmation_blocked_for_authenticated',
      not has_function_privilege(
        'authenticated',
        'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)',
        'execute'
      )
    ),
    (
      'intent_available_to_authenticated',
      has_function_privilege(
        'authenticated',
        'public.create_checkout_intent(text,uuid,text[])',
        'execute'
      )
    )
), summary as (
  select
    count(*)::integer as checks_total,
    count(*) filter (where passed)::integer as checks_passed,
    bool_and(passed) as all_passed,
    jsonb_object_agg(check_name, passed order by check_name) as checks
  from checks
)
select jsonb_build_object(
  'result', case when all_passed then 'passed' else 'failed' end,
  'checks_total', checks_total,
  'checks_passed', checks_passed,
  'checks', checks
) as stage_03_verification
from summary;

rollback;

-- DentalFlow SaaS — Stage 03 live verification.
-- Read-only and sanitized: returns booleans/counts only.

begin transaction read only;

with function_oids as (
  select
    to_regprocedure(
      'public.billing_get_checkout_provisioning_context(uuid,uuid,text)'
    ) as checkout_context,
    to_regprocedure(
      'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)'
    ) as checkout_ready,
    to_regprocedure(
      'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)'
    ) as payment_confirmation,
    to_regprocedure(
      'public.create_checkout_intent(text,uuid,text[])'
    ) as checkout_intent
), checks(check_name, passed) as (
  select check_name, passed
  from function_oids
  cross join lateral (
    values
    (
      'checkout_context_exists',
      checkout_context is not null
    ),
    (
      'checkout_ready_exists',
      checkout_ready is not null
    ),
    (
      'checkout_context_blocked_for_anon',
      not coalesce(
        has_function_privilege('anon', checkout_context, 'execute'),
        false
      )
    ),
    (
      'checkout_context_blocked_for_authenticated',
      not coalesce(
        has_function_privilege('authenticated', checkout_context, 'execute'),
        false
      )
    ),
    (
      'checkout_context_allowed_for_service_role',
      coalesce(
        has_function_privilege('service_role', checkout_context, 'execute'),
        false
      )
    ),
    (
      'checkout_ready_blocked_for_anon',
      not coalesce(
        has_function_privilege('anon', checkout_ready, 'execute'),
        false
      )
    ),
    (
      'checkout_ready_blocked_for_authenticated',
      not coalesce(
        has_function_privilege('authenticated', checkout_ready, 'execute'),
        false
      )
    ),
    (
      'checkout_ready_allowed_for_service_role',
      coalesce(
        has_function_privilege('service_role', checkout_ready, 'execute'),
        false
      )
    ),
    (
      'payment_confirmation_blocked_for_authenticated',
      not coalesce(
        has_function_privilege('authenticated', payment_confirmation, 'execute'),
        false
      )
    ),
    (
      'intent_available_to_authenticated',
      coalesce(
        has_function_privilege('authenticated', checkout_intent, 'execute'),
        false
      )
    )
  ) as verification(check_name, passed)
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

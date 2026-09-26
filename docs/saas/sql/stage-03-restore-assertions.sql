-- DentalFlow SaaS — Stage 03 clean-restore assertions.
-- Read-only: aborts on any missing or over-permissive checkout boundary.

begin transaction read only;

do $$
begin
  if to_regprocedure(
    'public.billing_get_checkout_provisioning_context(uuid,uuid,text)'
  ) is null then
    raise exception 'Stage 03 checkout context function is missing';
  end if;
  if to_regprocedure(
    'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)'
  ) is null then
    raise exception 'Stage 03 checkout persistence function is missing';
  end if;

  if has_function_privilege(
       'anon',
       'public.billing_get_checkout_provisioning_context(uuid,uuid,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.billing_get_checkout_provisioning_context(uuid,uuid,text)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.billing_get_checkout_provisioning_context(uuid,uuid,text)',
       'execute'
     ) then
    raise exception 'Stage 03 checkout context privileges are unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.billing_mark_asaas_checkout_ready(uuid,uuid,text,text,text,text,text)',
       'execute'
     ) then
    raise exception 'Stage 03 checkout persistence privileges are unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.create_checkout_intent(text,uuid,text[])',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.create_checkout_intent(text,uuid,text[])',
       'execute'
     ) then
    raise exception 'Authenticated checkout intent privileges are invalid';
  end if;
end
$$;

select jsonb_build_object(
  'result', 'passed',
  'checkout_context_private', true,
  'checkout_ready_private', true,
  'authenticated_intent_available', true,
  'payment_confirmation_not_exposed',
    not has_function_privilege(
      'authenticated',
      'public.billing_apply_checkout_paid(uuid,text,text,text,text,timestamptz,timestamptz)',
      'execute'
    )
) as stage_03_restore;

rollback;

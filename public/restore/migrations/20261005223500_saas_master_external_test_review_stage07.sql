-- A reviewed external Sandbox test can leave the actionable queue without
-- replaying it. This never verifies a payment, edits a contract or grants access.
alter table public.platform_operator_audit
  drop constraint if exists platform_operator_audit_action_check;
alter table public.platform_operator_audit
  add constraint platform_operator_audit_action_check
  check (action in ('replay_asaas_event','close_external_sandbox_test'));

create or replace function public.platform_master_close_external_sandbox_test(
  p_environment text, p_event_id text, p_reason text,
  p_confirm_manual_external boolean default false
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_event public.billing_events%rowtype; v_payment_id text;
begin
  if auth.uid() is null or auth.role() <> 'authenticated'
     or not exists (select 1 from public.platform_operators o
                    where o.user_id = auth.uid() and o.enabled) then
    raise exception 'PLATFORM_MASTER_FORBIDDEN';
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then
    raise exception 'PLATFORM_MASTER_REAUTH_REQUIRED';
  end if;
  if p_environment is distinct from 'sandbox'
     or p_confirm_manual_external is distinct from true then
    raise exception 'PLATFORM_MASTER_EXTERNAL_TEST_CONFIRMATION_REQUIRED';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 16 and 300
     or p_reason ~ '[[:cntrl:]]' then
    raise exception 'PLATFORM_MASTER_REASON_REQUIRED';
  end if;
  if p_event_id is null or length(p_event_id) not between 5 and 200
     or p_event_id ~ '[[:cntrl:]]' then
    raise exception 'PLATFORM_MASTER_EXTERNAL_TEST_NOT_ELIGIBLE';
  end if;

  select * into v_event from public.billing_events
  where provider = 'asaas' and provider_environment = 'sandbox'
    and provider_event_id = p_event_id for update;
  if v_event.id is null then return false; end if;
  -- Retrying an ambiguous response does not duplicate the audit record.
  if v_event.status = 'ignored'
     and v_event.error_message = 'EXTERNAL_MANUAL_SANDBOX_TEST' then
    return true;
  end if;
  v_payment_id := v_event.payload->>'paymentId';
  -- Only the legacy payment-only snapshot is eligible. Reconciliation events,
  -- provider references and any known billing association remain in review.
  if v_event.status <> 'dead_letter'
     or v_event.event_type not in ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_OVERDUE')
     or v_event.lease_token is not null or v_event.lease_until is not null
     or jsonb_typeof(v_event.payload) is distinct from 'object'
     or (v_event.payload - 'paymentId') <> '{}'::jsonb
     or v_payment_id is null or v_payment_id !~ '^pay_[A-Za-z0-9]{1,90}$' then
    raise exception 'PLATFORM_MASTER_EXTERNAL_TEST_NOT_ELIGIBLE';
  end if;
  if exists (select 1 from public.billing_payments p
             where p.provider = 'asaas' and p.provider_environment = 'sandbox'
               and p.provider_payment_id = v_payment_id)
     or exists (select 1 from public.checkout_intents c
                where c.billing_provider = 'asaas' and c.provider_environment = 'sandbox'
                  and c.provider_payment_id = v_payment_id) then
    raise exception 'PLATFORM_MASTER_EXTERNAL_TEST_HAS_BILLING_LINK';
  end if;

  update public.billing_events set status = 'ignored', processed_at = now(),
    error_message = 'EXTERNAL_MANUAL_SANDBOX_TEST', lease_token = null, lease_until = null
  where id = v_event.id;
  insert into public.platform_operator_audit
    (user_id,action,reason,target_environment,target_ref)
  values (auth.uid(),'close_external_sandbox_test',btrim(p_reason),'sandbox',p_event_id);
  return true;
end $$;

revoke all on function public.platform_master_close_external_sandbox_test(text,text,text,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.platform_master_close_external_sandbox_test(text,text,text,boolean)
  to authenticated;

-- Stage 08: financial history belongs to a company billing manager only.
-- Existing team-wide payment reads are narrowed; no payment state is written.
create or replace function public.billing_current_user_can_manage_company(p_clinic_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select auth.uid() is not null
     and public.billing_user_can_manage_company(p_clinic_id, auth.uid());
$$;
revoke all on function public.billing_current_user_can_manage_company(uuid)
  from public, anon, authenticated;
grant execute on function public.billing_current_user_can_manage_company(uuid) to authenticated;

drop policy if exists billing_payments_company_read on public.billing_payments;
create policy billing_payments_company_read on public.billing_payments
for select to authenticated using (
  public.billing_current_user_can_manage_company(clinic_id)
);

create or replace function public.billing_company_history(p_clinic_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_result jsonb;
begin
  if auth.role() <> 'authenticated'
     or not public.billing_current_user_can_manage_company(p_clinic_id) then
    raise exception 'BILLING_HISTORY_FORBIDDEN';
  end if;
  select jsonb_build_object(
    'payments', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
      select b.id, b.status, b.amount_cents, b.currency, b.provider_environment,
             b.provider_payment_id is not null as document_available,
             b.paid_at, b.period_start, b.period_end, b.created_at
      from public.billing_payments b
      where b.clinic_id = p_clinic_id and b.provider = 'asaas'
      order by b.created_at desc limit 50
    ) t), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
      select s.id, s.plan_code, s.status, s.provider_environment,
             s.current_period_end, s.canceled_at, s.created_at
      from public.account_subscriptions s
      where s.clinic_id = p_clinic_id and s.scope_type = 'company'
      order by s.created_at desc limit 20
    ) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Service-role-only context for fetching one hosted invoice from Asaas. The
-- browser never supplies a company/customer/subscription identity as authority.
create or replace function public.billing_get_asaas_payment_document_context(
  p_payment_id uuid, p_actor_user_id uuid, p_environment text
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_payment public.billing_payments%rowtype;
declare v_subscription public.account_subscriptions%rowtype;
begin
  if p_environment not in ('sandbox','production') then
    raise exception 'BILLING_DOCUMENT_ENVIRONMENT_INVALID';
  end if;
  select * into v_payment from public.billing_payments
  where id = p_payment_id and provider = 'asaas'
    and provider_environment = p_environment;
  if v_payment.id is null or v_payment.provider_payment_id is null
     or not public.billing_user_can_manage_company(v_payment.clinic_id, p_actor_user_id) then
    raise exception 'BILLING_DOCUMENT_FORBIDDEN';
  end if;
  select * into v_subscription from public.account_subscriptions
  where id = v_payment.subscription_id and clinic_id = v_payment.clinic_id
    and billing_provider = 'asaas' and provider_environment = p_environment;
  if v_subscription.id is null or v_subscription.external_customer_id is null
     or v_subscription.external_subscription_id is null then
    raise exception 'BILLING_DOCUMENT_UNLINKED';
  end if;
  return jsonb_build_object(
    'payment_id', v_payment.provider_payment_id,
    'customer_id', v_subscription.external_customer_id,
    'subscription_id', v_subscription.external_subscription_id,
    'amount_cents', v_payment.amount_cents,
    'environment', p_environment
  );
end $$;

revoke all on function public.billing_company_history(uuid) from public, anon, authenticated;
grant execute on function public.billing_company_history(uuid) to authenticated;
revoke all on function public.billing_get_asaas_payment_document_context(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.billing_get_asaas_payment_document_context(uuid,uuid,text)
  to service_role;
notify pgrst, 'reload schema';

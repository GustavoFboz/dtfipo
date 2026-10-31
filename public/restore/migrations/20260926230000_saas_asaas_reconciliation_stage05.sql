-- Stage 05: bounded recovery when an Asaas webhook never reaches the inbox.
-- Claiming a candidate never changes paid access. The worker must consult
-- Asaas and enqueue a synthetic event for the existing verified processor.

alter table public.account_subscriptions
  add column if not exists reconciliation_checked_at timestamptz;

create index if not exists account_subscriptions_asaas_reconciliation_idx
  on public.account_subscriptions (provider_environment, reconciliation_checked_at, id)
  where billing_provider = 'asaas' and external_subscription_id is not null;

create or replace function public.billing_claim_asaas_reconciliation_candidates(
  p_environment text, p_limit integer default 1
) returns table (
  subscription_id uuid, provider_subscription_id text, customer_id text
)
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if p_environment not in ('sandbox','production') or p_limit not between 1 and 2 then
    raise exception 'BILLING_INVALID_WORKER_REQUEST';
  end if;

  return query
  with candidates as (
    select s.id
    from public.account_subscriptions s
    where s.scope_type = 'company' and s.clinic_id is not null
      and s.billing_provider = 'asaas'
      and s.provider_environment = p_environment
      and s.external_subscription_id ~ '^sub_[A-Za-z0-9]+$'
      and s.external_customer_id ~ '^cus_[A-Za-z0-9]+$'
      and s.status in ('pending_checkout','active','past_due','grace','suspended','canceled')
      and (s.created_at >= now() - interval '120 days'
           or s.current_period_end >= now() - interval '120 days')
      and s.created_at <= now() - interval '5 minutes'
      and (s.reconciliation_checked_at is null
           or s.reconciliation_checked_at <= now() - interval '1 hour')
      and not public.is_internal_full_access_company(s.clinic_id)
    order by s.reconciliation_checked_at nulls first, s.id
    limit p_limit for update of s skip locked
  )
  update public.account_subscriptions s
  set reconciliation_checked_at = clock_timestamp()
  from candidates c where s.id = c.id
  returning s.id, s.external_subscription_id, s.external_customer_id;
end;
$$;

revoke all on function public.billing_claim_asaas_reconciliation_candidates(text,integer)
  from public,anon,authenticated;
grant execute on function public.billing_claim_asaas_reconciliation_candidates(text,integer)
  to service_role;
notify pgrst, 'reload schema';

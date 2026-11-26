-- Stage 06 (part 1): the paid company plan is the included storage allowance.
-- Legacy base/courtesy entitlements may raise that allowance; purchases and
-- manual additions are extra. Recalculating an add-on must never reset a paid
-- company's plan allowance to the old one-gigabyte default.

create or replace function public.recalculate_clinic_storage_limit(_clinic_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_bytes bigint := 0;
  v_included_bytes bigint := 0;
  v_extra_bytes bigint := 0;
  v_limit bigint;
  v_internal boolean;
begin
  select c.billing_exempt into v_internal
  from public.clinics c where c.id = _clinic_id for update;
  if not found then raise exception 'STORAGE_CLINIC_NOT_FOUND'; end if;

  -- A pending checkout does not confer the chosen plan. Keep the most recent
  -- established plan while an account is suspended so its files remain intact.
  select p.storage_bytes into v_plan_bytes
  from public.account_subscriptions s
  join public.billing_plans p on p.code = s.plan_code and p.account_scope = 'company'
  where s.clinic_id = _clinic_id and s.scope_type = 'company'
    and s.status <> 'pending_checkout'
  order by (s.status <> 'canceled') desc, s.updated_at desc, s.created_at desc
  limit 1;

  select
    coalesce(sum(e.bytes) filter (where e.entitlement_type in ('base','courtesy')), 0),
    coalesce(sum(e.bytes) filter (where e.entitlement_type in ('purchase','manual')), 0)
  into v_included_bytes, v_extra_bytes
  from public.clinic_storage_entitlements e
  where e.clinic_id = _clinic_id and e.status = 'active'
    and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now());

  v_limit := greatest(
    coalesce(v_plan_bytes, 0), v_included_bytes, 1073741824::bigint,
    case when v_internal then 536870912000::bigint else 0::bigint end
  ) + v_extra_bytes;
  update public.clinics set storage_limit_bytes = v_limit
  where id = _clinic_id and storage_limit_bytes is distinct from v_limit;
  return v_limit;
end;
$$;

-- Only the existing entitlement trigger and the private billing/admin service
-- need to recalculate. Do not expose a SECURITY DEFINER write RPC to clients.
revoke all on function public.recalculate_clinic_storage_limit(uuid)
from public, anon, authenticated;
grant execute on function public.recalculate_clinic_storage_limit(uuid)
to service_role;

notify pgrst, 'reload schema';

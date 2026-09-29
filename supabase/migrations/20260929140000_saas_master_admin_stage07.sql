-- Stage 07: platform administration is independent of company CEO/admin roles.
-- No operator is enrolled by this migration. Enrolment is a deliberate,
-- separately audited service-role operation after verifying the auth user.
create table if not exists public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  enrolled_at timestamptz not null default now(),
  enrolled_by text not null check (length(btrim(enrolled_by)) between 3 and 120)
);
create table if not exists public.platform_operator_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  action text not null check (action in ('replay_asaas_event')),
  reason text not null check (length(btrim(reason)) between 16 and 300),
  target_environment text not null check (target_environment in ('sandbox','production')),
  target_ref text not null,
  performed_at timestamptz not null default now()
);
create index if not exists platform_operator_audit_recent_idx
  on public.platform_operator_audit (performed_at desc);
alter table public.platform_operators enable row level security;
alter table public.platform_operator_audit enable row level security;
revoke all on public.platform_operators, public.platform_operator_audit from public, anon, authenticated;
grant select, insert, update, delete on public.platform_operators to service_role;
grant select on public.platform_operator_audit to service_role;

create or replace function public.platform_master_dashboard(p_search text default '')
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
declare v_search text := btrim(coalesce(p_search,''));
declare v_result jsonb;
begin
  if auth.uid() is null or auth.role() <> 'authenticated'
     or not exists (select 1 from public.platform_operators o
                    where o.user_id = auth.uid() and o.enabled) then
    raise exception 'PLATFORM_MASTER_FORBIDDEN';
  end if;
  if length(v_search) > 80 then raise exception 'PLATFORM_MASTER_SEARCH_INVALID'; end if;

  select jsonb_build_object(
    'companies', coalesce((select jsonb_agg(to_jsonb(t) order by t.name) from (
      select c.id, c.name, coalesce(c.billing_exempt,false) as billing_exempt,
             s.id as subscription_id, s.status, s.plan_code,
             s.provider_environment, s.current_period_end,
             s.external_subscription_id is not null as provider_linked
      from public.clinics c
      left join lateral (
        select id, status, plan_code, provider_environment,
               current_period_end, external_subscription_id
        from public.account_subscriptions
        where clinic_id = c.id order by created_at desc limit 1
      ) s on true
      where v_search = '' or c.name ilike '%' || v_search || '%'
      order by c.name, c.id limit 50
    ) t), '[]'::jsonb),
    'queue', coalesce((select jsonb_object_agg(status, total) from (
      select status, count(*) as total from public.billing_events
      where provider = 'asaas' group by status
    ) q), '{}'::jsonb),
    'recent_payments', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
      select b.id, b.clinic_id, b.status, b.amount_cents, b.currency,
             b.provider_environment, b.created_at, b.paid_at
      from public.billing_payments b where b.provider = 'asaas'
      order by b.created_at desc limit 30
    ) t), '[]'::jsonb),
    'review_events', coalesce((select jsonb_agg(to_jsonb(t) order by t.received_at desc) from (
      select provider_event_id, event_type, provider_environment,
             status, attempt_count, received_at
      from public.billing_events where provider = 'asaas'
        and status in ('failed','dead_letter')
      order by received_at desc limit 30
    ) t), '[]'::jsonb),
    'generated_at', now()
  ) into v_result;
  return v_result;
end $$;

create or replace function public.platform_master_replay_asaas_event(
  p_environment text, p_event_id text, p_reason text
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_queued boolean;
begin
  if auth.uid() is null or auth.role() <> 'authenticated'
     or not exists (select 1 from public.platform_operators o
                    where o.user_id = auth.uid() and o.enabled) then
    raise exception 'PLATFORM_MASTER_FORBIDDEN';
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then
    raise exception 'PLATFORM_MASTER_REAUTH_REQUIRED';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 16 and 300
     or p_reason ~ '[[:cntrl:]]' then
    raise exception 'PLATFORM_MASTER_REASON_REQUIRED';
  end if;
  v_queued := public.billing_replay_asaas_event(
    p_environment, p_event_id, auth.uid()::text, btrim(p_reason));
  if v_queued then
    insert into public.platform_operator_audit
      (user_id, action, reason, target_environment, target_ref)
    values (auth.uid(), 'replay_asaas_event', btrim(p_reason), p_environment, p_event_id);
  end if;
  return v_queued;
end $$;

revoke all on function public.platform_master_dashboard(text) from public, anon, authenticated;
revoke all on function public.platform_master_replay_asaas_event(text,text,text) from public, anon, authenticated;
grant execute on function public.platform_master_dashboard(text) to authenticated;
grant execute on function public.platform_master_replay_asaas_event(text,text,text) to authenticated;
notify pgrst, 'reload schema';

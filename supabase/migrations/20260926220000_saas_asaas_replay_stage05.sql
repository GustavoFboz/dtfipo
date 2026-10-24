-- Stage 05: an operator can retry a reviewed dead letter without replacing
-- the provider event ID or bypassing the normal Asaas verification worker.
create table if not exists public.billing_event_replays (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.billing_events(id),
  provider_environment text not null check (provider_environment in ('sandbox','production')),
  provider_event_id text not null,
  previous_attempt_count integer not null,
  operator_ref text not null,
  reason text not null,
  requested_at timestamptz not null default now()
);
create index if not exists billing_event_replays_event_idx
  on public.billing_event_replays (event_id, requested_at);
alter table public.billing_event_replays enable row level security;
revoke all on table public.billing_event_replays from public, anon, authenticated, service_role;
grant select on table public.billing_event_replays to service_role;

create or replace function public.billing_replay_asaas_event(
  p_environment text, p_event_id text, p_operator_ref text, p_reason text
) returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_event public.billing_events%rowtype;
begin
  if p_environment is null or p_environment not in ('sandbox','production')
    or coalesce(p_event_id,'') !~ '^evt_[A-Za-z0-9&_-]{1,150}$'
    or coalesce(p_operator_ref,'') !~ '^[A-Za-z0-9_.-]{3,64}$'
    or p_reason is null or char_length(btrim(p_reason)) not between 16 and 300
    or p_reason ~ '[[:cntrl:]]' then
    raise exception 'BILLING_INVALID_REPLAY_REQUEST';
  end if;

  select * into v_event from public.billing_events
  where provider = 'asaas' and provider_environment = p_environment
    and provider_event_id = p_event_id for update;
  if not found or v_event.status <> 'dead_letter' then return false; end if;

  insert into public.billing_event_replays (
    event_id, provider_environment, provider_event_id,
    previous_attempt_count, operator_ref, reason
  ) values (
    v_event.id, p_environment, p_event_id,
    v_event.attempt_count, p_operator_ref, btrim(p_reason)
  );
  update public.billing_events set status = 'received', attempt_count = 0,
    next_attempt_at = now(), error_message = null, processed_at = null,
    lease_token = null, lease_until = null
  where id = v_event.id;
  return true;
end;
$$;
revoke all on function public.billing_replay_asaas_event(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.billing_replay_asaas_event(text,text,text,text)
  to service_role;
notify pgrst, 'reload schema';

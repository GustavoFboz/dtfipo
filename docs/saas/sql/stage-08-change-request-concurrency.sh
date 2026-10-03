#!/usr/bin/env bash
# DISPOSABLE clean Supabase only. Synthetic financial metadata, no provider.
set -euo pipefail
db_container="${RESTORE_DB_CONTAINER:?RESTORE_DB_CONTAINER is required}"
clinic_id='78000000-0000-4000-8000-000000000090'
user_id='78000000-0000-4000-8000-000000000091'
subscription_id='78000000-0000-4000-8000-000000000092'
race_dir="$(mktemp -d)"
first_pid=''
if command -v rg >/dev/null 2>&1; then log_search=(rg -q); else log_search=(grep -q); fi
psql_restore() { docker exec -i "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
  if [[ -n "$first_pid" ]] && kill -0 "$first_pid" 2>/dev/null; then
    kill "$first_pid" 2>/dev/null || true; wait "$first_pid" 2>/dev/null || true
  fi
  psql_restore >/dev/null 2>&1 <<SQL || true
delete from public.billing_change_request_events where request_id in (select id from public.billing_change_requests where clinic_id='$clinic_id');
delete from public.billing_change_requests where clinic_id='$clinic_id';
delete from public.billing_payments where subscription_id='$subscription_id';
delete from public.account_subscriptions where id='$subscription_id';
delete from public.clinics where id='$clinic_id';
delete from auth.users where id='$user_id';
SQL
  rm -rf "$race_dir"
}
trap cleanup EXIT
psql_restore >/dev/null <<SQL
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('$user_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage08-race@test.invalid','',now(),now());
insert into public.clinics(id,name,slug,owner_id) values ('$clinic_id','Stage08 request race','stage08-request-race','$user_id');
insert into public.account_subscriptions(id,scope_type,clinic_id,plan_code,status,billing_day,billing_provider,provider_environment,
  external_customer_id,external_subscription_id,current_period_start,current_period_end)
values ('$subscription_id','company','$clinic_id','company_advanced','active',28,'asaas','sandbox','cus_RequestRace','sub_RequestRace',now()-interval '1 day',now()+interval '29 days');
insert into public.billing_payments(subscription_id,clinic_id,amount_cents,currency,status,provider,provider_environment,
  provider_payment_id,paid_at,period_start,period_end)
select id,clinic_id,74900,'BRL','paid','asaas','sandbox','pay_RequestRace',now(),current_period_start,current_period_end
from public.account_subscriptions where id='$subscription_id';
SQL
cancel_quote="$(psql_restore -At -c "select public.billing_change_request_quote('$subscription_id','cancel',null)->>'quote_token'")"
plan_quote="$(psql_restore -At -c "select public.billing_change_request_quote('$subscription_id','change_plan','company_growth')->>'quote_token'")"
before_state="$(psql_restore -At -c "select md5(to_jsonb(s)::text) from public.account_subscriptions s where id='$subscription_id'")"
for mode in duplicate conflict; do
  psql_restore >"$race_dir/first-$mode.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claims','{"sub":"$user_id","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','$user_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.billing_submit_change_request('$clinic_id','$subscription_id','cancel',null,'$cancel_quote');
select 'REQUEST_LOCKED' as checkpoint;
select pg_sleep(3);
commit;
SQL
  first_pid=$!
  for _ in $(seq 1 100); do
    if "${log_search[@]}" REQUEST_LOCKED "$race_dir/first-$mode.log"; then break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then cat "$race_dir/first-$mode.log"; exit 1; fi
    sleep 0.1
  done
  if ! "${log_search[@]}" REQUEST_LOCKED "$race_dir/first-$mode.log"; then cat "$race_dir/first-$mode.log"; exit 1; fi
  kind='cancel'; target='null'; selected_quote="$cancel_quote"
  if [[ "$mode" == conflict ]]; then kind='change_plan'; target="'company_growth'"; selected_quote="$plan_quote"; fi
  second_ok=true
  psql_restore >"$race_dir/second-$mode.log" 2>&1 <<SQL || second_ok=false
set lock_timeout='8s';
select set_config('request.jwt.claims','{"sub":"$user_id","role":"authenticated"}',false);
select set_config('request.jwt.claim.sub','$user_id',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
select public.billing_submit_change_request('$clinic_id','$subscription_id','$kind',$target,'$selected_quote');
SQL
  wait "$first_pid"; first_pid=''
  if [[ "$mode" == duplicate && "$second_ok" != true ]]; then cat "$race_dir/second-$mode.log"; exit 1; fi
  if [[ "$mode" == conflict ]] && { [[ "$second_ok" == true ]] || ! "${log_search[@]}" BILLING_CHANGE_PENDING "$race_dir/second-$mode.log"; }; then cat "$race_dir/second-$mode.log"; exit 1; fi
  result="$(psql_restore -At -c "select (select count(*) from public.billing_change_requests where clinic_id='$clinic_id'), (select count(*) from public.billing_change_request_events e join public.billing_change_requests r on r.id=e.request_id where r.clinic_id='$clinic_id'), (select md5(to_jsonb(s)::text) from public.account_subscriptions s where id='$subscription_id')")"
  if [[ "$result" != "1|1|$before_state" ]]; then echo "Unexpected concurrent result: $result" >&2; exit 1; fi
  psql_restore >/dev/null <<SQL
delete from public.billing_change_request_events where request_id in (select id from public.billing_change_requests where clinic_id='$clinic_id');
delete from public.billing_change_requests where clinic_id='$clinic_id';
SQL
done
echo 'Stage 08 concurrent requests: passed (one audit/request for duplicates, conflicting selection refused, subscription unchanged).'

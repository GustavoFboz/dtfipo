#!/usr/bin/env bash
# Disposable clean Supabase database only. Exercise two concurrent reservations.
set -euo pipefail

db_container="${RESTORE_DB_CONTAINER:?RESTORE_DB_CONTAINER is required}"
clinic_id='60000000-0000-4000-8000-000000000070'
user_id='60000000-0000-4000-8000-000000000071'
scratch_dir="$(mktemp -d)"
first_pid=''

psql_restore() {
  docker exec -i "$db_container" psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 "$@"
}

cleanup() {
  if [[ -n "$first_pid" ]] && kill -0 "$first_pid" 2>/dev/null; then
    kill "$first_pid" 2>/dev/null || true
    wait "$first_pid" 2>/dev/null || true
  fi
  psql_restore >/dev/null 2>&1 <<SQL || true
delete from public.storage_files where clinic_id = '$clinic_id';
delete from auth.users where id = '$user_id';
delete from public.clinics where id = '$clinic_id';
SQL
  rm -rf "$scratch_dir"
}
trap cleanup EXIT

psql_restore >/dev/null <<SQL
insert into public.clinics (id, name, slug, storage_limit_bytes)
values ('$clinic_id', 'Concurrent storage rehearsal', 'stage06-concurrent-upload', 100);
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('$user_id', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'stage06-concurrent@test.invalid', '', now(), now());
insert into public.clinic_members (clinic_id, user_id, role, status)
values ('$clinic_id', '$user_id', 'CEO', 'active');
insert into public.profiles (id, clinic_id, role, account_subtype, is_default_admin)
values ('$user_id', '$clinic_id', 'CEO', 'CEO', true)
on conflict (id) do update set clinic_id = excluded.clinic_id, role = excluded.role,
  account_subtype = excluded.account_subtype, is_default_admin = excluded.is_default_admin;
SQL

psql_restore >"$scratch_dir/first.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claim.sub', '$user_id', true);
set local role authenticated;
select file_id from public.reserve_storage_upload(
  70, 'avatars', '$user_id/first.jpg', 'user_avatar');
select 'FIRST_RESERVED' as checkpoint;
select pg_sleep(3);
commit;
SQL
first_pid=$!

ready=false
for _ in $(seq 1 100); do
  if grep -q 'FIRST_RESERVED' "$scratch_dir/first.log"; then ready=true; break; fi
  if ! kill -0 "$first_pid" 2>/dev/null; then
    cat "$scratch_dir/first.log"
    exit 1
  fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then
  cat "$scratch_dir/first.log"
  echo 'First reservation did not reach the barrier.' >&2
  exit 1
fi

if psql_restore >"$scratch_dir/second.log" 2>&1 <<SQL
select set_config('request.jwt.claim.sub', '$user_id', false);
set role authenticated;
select file_id from public.reserve_storage_upload(
  70, 'avatars', '$user_id/second.jpg', 'user_avatar');
SQL
then
  cat "$scratch_dir/second.log"
  echo 'Concurrent reservation exceeded the company quota.' >&2
  exit 1
fi
if ! grep -q 'STORAGE_QUOTA_EXCEEDED' "$scratch_dir/second.log"; then
  cat "$scratch_dir/second.log"
  echo 'Second reservation failed for a reason other than the quota.' >&2
  exit 1
fi

wait "$first_pid"
first_pid=''
result="$(psql_restore -At -c "select coalesce(sum(size_bytes),0), count(*) from public.storage_files where clinic_id = '$clinic_id'")"
if [[ "$result" != '70|1' ]]; then
  echo "Expected one 70-byte reservation, got $result" >&2
  exit 1
fi
echo 'Stage 06 concurrent reservations: passed (one accepted, one quota-rejected).'

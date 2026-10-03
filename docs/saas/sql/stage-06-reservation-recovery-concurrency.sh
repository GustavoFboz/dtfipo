#!/usr/bin/env bash
# DISPOSABLE clean Supabase only. Metadata fixtures, never a live Storage API.
set -euo pipefail
db_container="${RESTORE_DB_CONTAINER:?RESTORE_DB_CONTAINER is required}"
clinic_id='60000000-0000-4000-8000-000000000120'
user_id='60000000-0000-4000-8000-000000000121'
upload_first='60000000-0000-4000-8000-000000000122'
release_first='60000000-0000-4000-8000-000000000123'
scratch_dir="$(mktemp -d)"
first_pid=''
psql_restore() { docker exec -i "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
  if [[ -n "$first_pid" ]] && kill -0 "$first_pid" 2>/dev/null; then
    kill "$first_pid" 2>/dev/null || true; wait "$first_pid" 2>/dev/null || true
  fi
  psql_restore >/dev/null 2>&1 <<SQL || true
delete from storage.objects where bucket_id='avatars' and name in ('$user_id/upload-first.jpg','$user_id/release-first.jpg');
delete from public.storage_files where clinic_id='$clinic_id';
delete from auth.users where id='$user_id';
delete from public.clinics where id='$clinic_id';
SQL
  rm -rf "$scratch_dir"
}
trap cleanup EXIT
wait_barrier() {
  local checkpoint="$1" log="$2"
  for _ in $(seq 1 100); do
    if rg -q "$checkpoint" "$log"; then return; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then cat "$log"; exit 1; fi
    sleep 0.1
  done
  cat "$log"; echo 'Concurrent recovery barrier timed out.' >&2; exit 1
}
psql_restore >/dev/null <<SQL
insert into storage.buckets (id,name,public) values ('avatars','avatars',false) on conflict (id) do nothing;
insert into public.clinics (id,name,slug,storage_limit_bytes) values ('$clinic_id','Recovery race','stage06-recovery-race',1000);
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values ('$user_id','00000000-0000-0000-0000-000000000000','authenticated','authenticated','recovery-race@test.invalid','',now(),now());
insert into public.clinic_members (clinic_id,user_id,role,status) values ('$clinic_id','$user_id','CEO','active');
insert into public.profiles (id,clinic_id,role,account_subtype,is_default_admin) values ('$user_id','$clinic_id','CEO','CEO',true)
on conflict (id) do update set clinic_id=excluded.clinic_id,role=excluded.role,account_subtype=excluded.account_subtype,is_default_admin=true;
insert into public.storage_files (id,clinic_id,bucket,object_path,source_type,original_name,size_bytes,status,uploaded_by,created_at)
values ('$upload_first','$clinic_id','avatars','$user_id/upload-first.jpg','user_avatar','upload-first.jpg',10,'reserved','$user_id',now()-interval '2 days'),
       ('$release_first','$clinic_id','avatars','$user_id/release-first.jpg','user_avatar','release-first.jpg',10,'reserved','$user_id',now()-interval '2 days');
SQL

# Object INSERT holds the shared reservation lock. Recovery must wait, then
# observe that the object exists; it cannot free the ten accounted bytes.
psql_restore >"$scratch_dir/upload.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claims','{"sub":"$user_id","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','$user_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
insert into storage.objects (bucket_id,name,metadata,owner_id) values ('avatars','$user_id/upload-first.jpg','{"size":10}','$user_id');
select 'OBJECT_LOCKED' as checkpoint;
select pg_sleep(3);
commit;
SQL
first_pid=$!
wait_barrier OBJECT_LOCKED "$scratch_dir/upload.log"
if psql_restore >"$scratch_dir/release-blocked.log" 2>&1 <<SQL
set lock_timeout='8s';
select set_config('request.jwt.claims','{"sub":"$user_id","role":"authenticated"}',false);
select set_config('request.jwt.claim.sub','$user_id',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
select public.release_storage_upload_reservation('$upload_first','$clinic_id');
SQL
then cat "$scratch_dir/release-blocked.log"; echo 'Recovery removed a reservation during upload.' >&2; exit 1; fi
if ! rg -q STORAGE_OBJECT_STILL_EXISTS "$scratch_dir/release-blocked.log"; then cat "$scratch_dir/release-blocked.log"; exit 1; fi
wait "$first_pid"; first_pid=''

# Recovery holds the exclusive lock. A late INSERT waits, then fails RLS because
# the deleted reservation no longer authorizes any object at that path.
psql_restore >"$scratch_dir/release.log" 2>&1 <<SQL &
begin;
select set_config('request.jwt.claims','{"sub":"$user_id","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','$user_id',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.release_storage_upload_reservation('$release_first','$clinic_id');
select 'RESERVATION_RELEASED' as checkpoint;
select pg_sleep(3);
commit;
SQL
first_pid=$!
wait_barrier RESERVATION_RELEASED "$scratch_dir/release.log"
if psql_restore >"$scratch_dir/upload-blocked.log" 2>&1 <<SQL
set lock_timeout='8s';
select set_config('request.jwt.claims','{"sub":"$user_id","role":"authenticated"}',false);
select set_config('request.jwt.claim.sub','$user_id',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
insert into storage.objects (bucket_id,name,metadata,owner_id) values ('avatars','$user_id/release-first.jpg','{"size":10}','$user_id');
SQL
then cat "$scratch_dir/upload-blocked.log"; echo 'Late upload used a released reservation.' >&2; exit 1; fi
if ! rg -q 'row-level security' "$scratch_dir/upload-blocked.log"; then cat "$scratch_dir/upload-blocked.log"; exit 1; fi
wait "$first_pid"; first_pid=''
result="$(psql_restore -At -c "select (select count(*) from public.storage_files where clinic_id='$clinic_id'), (select coalesce(sum(size_bytes),0) from public.storage_files where clinic_id='$clinic_id'), (select count(*) from storage.objects where bucket_id='avatars' and name in ('$user_id/upload-first.jpg','$user_id/release-first.jpg'))")"
if [[ "$result" != '1|10|1' ]]; then echo "Recovery race left unexpected quota/objects: $result" >&2; exit 1; fi
echo 'Stage 06 concurrent recovery: passed (upload-first preserved, release-first rejected late upload).'

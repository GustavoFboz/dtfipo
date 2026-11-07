#!/usr/bin/env bash
# Never supply private data to this script. Test uses invented records only.
set -euo pipefail
name="dentalflow-collision-synthetic-$$"
image="supabase/postgres:17.11.0.018"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker pull "$image" >/dev/null
uid="$(docker run --rm --network none --entrypoint id "$image" -u postgres)"
gid="$(docker run --rm --network none --entrypoint id "$image" -g postgres)"
docker run -d --name "$name" \
  --network none --user postgres \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 1g \
  --tmpfs "/var/lib/postgresql/data:rw,uid=$uid,gid=$gid,mode=0700,size=512m" \
  --tmpfs "/var/run/postgresql:rw,uid=$uid,gid=$gid,mode=0770,size=16m" \
  --tmpfs "/tmp:rw,mode=1777,size=64m" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  "$image" postgres -c config_file=/etc/postgresql/postgresql.conf >/dev/null
ready=0
for i in $(seq 1 45); do
  if docker exec "$name" pg_isready -U supabase_admin -d postgres >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "DF_SYNTHETIC_SUPABASE_DB_BOOT_FAILED"
  exit 1
fi
docker exec "$name" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -q -c \
  'CREATE TABLE public.dentalflow_synthetic_rehearsal(id integer primary key); INSERT INTO public.dentalflow_synthetic_rehearsal VALUES (7);'
docker exec "$name" pg_dump -Fc -U supabase_admin -d postgres -n public -f /tmp/dentalflow_fake_only.dump
# Intentionally rehearse exactly the collision seen with an initialized target.
if docker exec "$name" pg_restore --no-owner --no-privileges --exit-on-error \
      --single-transaction -U supabase_admin -d postgres /tmp/dentalflow_fake_only.dump \
      >/dev/null 2>&1; then
  echo "DF_SYNTHETIC_EXPECTED_DUPLICATE_NOT_DETECTED"
  exit 1
fi
echo "DF_SYNTHETIC_OBJECT_CONFLICT_REPRODUCED"
# Test safe alternative only on a disposable database; --single-transaction
# guarantees rollback of all changes if an SQL command fails.
docker exec "$name" pg_restore --clean --if-exists --no-owner --no-privileges \
  --exit-on-error --single-transaction \
  -U supabase_admin -d postgres /tmp/dentalflow_fake_only.dump >/dev/null
count="$(docker exec "$name" psql -At -U supabase_admin -d postgres -c \
 'SELECT count(*) FROM public.dentalflow_synthetic_rehearsal WHERE id=7;')"
if [ "$count" != "1" ]; then
  echo "DF_SYNTHETIC_CLEAN_RESTORE_DID_NOT_RECOVER_ROWS"
  exit 1
fi
mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$name")"
if [ "$mode" != "none" ]; then
  echo "DF_SYNTHETIC_NETWORK_ISOLATION_INVALID"
  exit 1
fi
echo "DF_SYNTHETIC_DISPOSABLE_CLEAN_RESTORE_RECOVERED_ROWS"

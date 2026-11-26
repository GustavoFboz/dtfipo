#!/bin/sh
# Synthetic preflight only: inspect official Supabase PostgreSQL 17 image
# with NO network, NO backup, NO database process and NO production secrets.
set -eu
required="pg_cron pg_net pg_stat_statements pgcrypto supabase_vault uuid-ossp"
share_dir="$(pg_config --sharedir)"
if [ -z "$share_dir" ] || [ ! -d "$share_dir/extension" ]; then
    echo "DF_SUPABASE_IMAGE_EXTENSION_DIRECTORY_MISSING"
    exit 1
fi
echo "SUPABASE_POSTGRES_EXTENSION_PREFLIGHT"
postgres --version
for extension in $required; do
    if [ -f "$share_dir/extension/$extension.control" ]; then
        echo "$extension: PRESENT"
    else
        echo "$extension: MISSING"
        exit 1
    fi
done
echo "DF_SUPABASE_IMAGE_CONTROL_FILES_6_OF_6"
echo "NO_BACKUP_USED_NO_DATABASE_STARTED_NO_RESTORE_TESTED"

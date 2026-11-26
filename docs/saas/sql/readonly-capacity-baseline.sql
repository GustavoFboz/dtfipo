-- DentalFlow 6.3: read-only, minimal PostgreSQL baseline.
-- Run only with SELECT permission. No direct tables, account IDs, logs,
-- backend secrets, patient content, writes, loops or artificial load.
SELECT
  count(*)::integer AS connections_total,
  count(*) FILTER (WHERE state = 'active')::integer AS connections_active,
  count(*) FILTER (WHERE state = 'idle')::integer AS connections_idle,
  count(*) FILTER (WHERE state = 'idle in transaction')::integer AS connections_idle_in_transaction
FROM pg_stat_activity;

SELECT
  numbackends::integer AS connections_current_database,
  xact_commit::bigint AS transactions_committed_cumulative,
  xact_rollback::bigint AS transactions_rolled_back_cumulative,
  deadlocks::bigint AS deadlocks_cumulative,
  blks_hit::bigint AS blocks_hit_cumulative,
  blks_read::bigint AS blocks_read_cumulative
FROM pg_stat_database WHERE datname=current_database();

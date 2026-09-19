-- Recreate _restore.exec_sql with search_path including public + extensions
DROP FUNCTION IF EXISTS _restore.exec_sql(text) CASCADE;
CREATE OR REPLACE FUNCTION _restore.exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN EXECUTE sql; END; $$;

REVOKE ALL ON FUNCTION _restore.exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _restore.exec_sql(text) TO authenticated, service_role;

-- Ensure pgcrypto available in public for gen_random_bytes, gen_random_uuid etc.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

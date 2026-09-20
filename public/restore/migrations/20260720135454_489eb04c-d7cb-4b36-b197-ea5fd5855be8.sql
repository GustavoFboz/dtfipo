CREATE SCHEMA IF NOT EXISTS _restore;
GRANT USAGE ON SCHEMA _restore TO PUBLIC;
CREATE OR REPLACE FUNCTION _restore.exec_sql(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$ BEGIN EXECUTE sql; END; $$;
GRANT EXECUTE ON FUNCTION _restore.exec_sql(text) TO PUBLIC;
DROP FUNCTION IF EXISTS public.__restore_exec(text);

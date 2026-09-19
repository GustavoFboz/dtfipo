CREATE OR REPLACE FUNCTION public.__restore_exec(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END; $$;
GRANT EXECUTE ON FUNCTION public.__restore_exec(text) TO PUBLIC;

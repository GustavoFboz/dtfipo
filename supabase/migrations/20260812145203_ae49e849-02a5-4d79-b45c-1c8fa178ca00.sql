CREATE OR REPLACE FUNCTION public.backend_schema_hash()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT md5(coalesce(string_agg(sig, E'\n' ORDER BY sig), '')) FROM (
    SELECT table_name || ':' || column_name || ':' || data_type AS sig
    FROM information_schema.columns
    WHERE table_schema = 'public'
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.export_backup()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  r record;
  out_text text := '';
  cols text;
  rows_text text;
  v_col_expr text;
BEGIN
  out_text := '-- DentalFlow backend backup' || E'\n'
    || '-- generated_at: ' || now()::text || E'\n'
    || '-- schema_hash: ' || public.backend_schema_hash() || E'\n\n';

  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = r.table_name;

    SELECT string_agg('quote_nullable(' || quote_ident(column_name) || '::text)', ' || '', '' || ')
      INTO v_col_expr
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = r.table_name;

    IF v_col_expr IS NOT NULL THEN
      EXECUTE format(
        'SELECT coalesce(string_agg(''INSERT INTO %I (%s) VALUES ('' || v || '');'', E''\n''), '''') FROM (SELECT (%s) AS v FROM public.%I) s',
        r.table_name, cols, v_col_expr, r.table_name
      ) INTO rows_text;

      out_text := out_text || '-- table: ' || r.table_name || E'\n' || coalesce(rows_text, '') || E'\n\n';
    END IF;
  END LOOP;

  RETURN out_text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backend_schema_hash() TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_backup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.backend_schema_hash() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_backup() TO service_role;

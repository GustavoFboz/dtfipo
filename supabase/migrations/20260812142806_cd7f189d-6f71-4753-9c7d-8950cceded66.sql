DROP FUNCTION IF EXISTS public.consume_case_stock(uuid, uuid);
DROP FUNCTION IF EXISTS public.reverse_case_stock(uuid, uuid);

CREATE OR REPLACE FUNCTION public.consume_case_stock(_case_id uuid, _user uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
BEGIN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_case_stock(_case_id uuid, _user uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
BEGIN
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_case_stock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_case_stock(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_case_stock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_case_stock(uuid, uuid) TO service_role;

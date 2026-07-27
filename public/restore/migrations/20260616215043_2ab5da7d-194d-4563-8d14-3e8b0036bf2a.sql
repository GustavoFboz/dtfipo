
CREATE OR REPLACE FUNCTION public.generate_user_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  code text;
  exists_count int;
BEGIN
  LOOP
    code := 'USR-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    SELECT count(*) INTO exists_count FROM public.profiles WHERE user_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END $$;

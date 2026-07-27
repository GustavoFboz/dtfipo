
-- 1) Backfill existing default-admin profile to CEO so sidebar exposes all sections
UPDATE public.profiles SET role = 'CEO' WHERE is_default_admin = true AND role = 'USER';

-- 2) Ensure the first user of any future restore/install becomes CEO automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_role TEXT; v_full_name TEXT; is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  v_role := COALESCE(new.raw_user_meta_data->>'role', CASE WHEN is_first THEN 'CEO' ELSE 'USER' END);
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  INSERT INTO public.profiles (id, full_name, email, role, is_default_admin)
    VALUES (new.id, v_full_name, new.email, v_role, is_first)
    ON CONFLICT (id) DO NOTHING;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  IF v_role = 'CADISTA' THEN
    INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id);
  END IF;
  RETURN new;
END $function$;

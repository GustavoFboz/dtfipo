-- Backfill admin role for CEOs/DRs missing user_roles entry
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::app_role FROM public.profiles p
WHERE p.role IN ('CEO','DR','admin') 
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='admin'::app_role);

-- Also grant dentista role to DR profiles
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'dentista'::app_role FROM public.profiles p
WHERE p.role = 'DR'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='dentista'::app_role);

-- Update handle_new_user to ensure user_roles is populated for CEO/DR/admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_role text; v_full_name text; is_first boolean; v_clinic uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  v_role := COALESCE(new.raw_user_meta_data->>'role', CASE WHEN is_first THEN 'CEO' ELSE 'USER' END);
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  v_clinic := CASE WHEN is_first OR v_role IN ('CEO','DR') THEN gen_random_uuid() ELSE NULL END;
  INSERT INTO public.profiles (id, full_name, email, role, is_default_admin, clinic_id)
    VALUES (new.id, v_full_name, new.email, v_role, is_first, v_clinic)
    ON CONFLICT (id) DO NOTHING;
  IF is_first OR v_role IN ('CEO','admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin'::app_role) ON CONFLICT DO NOTHING;
  END IF;
  IF v_role = 'DR' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin'::app_role) ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'dentista'::app_role) ON CONFLICT DO NOTHING;
  END IF;
  IF v_role = 'CADISTA' THEN
    INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id);
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'cadista'::app_role) ON CONFLICT DO NOTHING;
  END IF;
  RETURN new;
END $function$;
-- Ensure CEO owns a clinic_id and team members inherit it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_role TEXT; v_full_name TEXT; is_first BOOLEAN; v_clinic uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  v_role := COALESCE(new.raw_user_meta_data->>'role', CASE WHEN is_first THEN 'CEO' ELSE 'USER' END);
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  v_clinic := CASE WHEN is_first OR v_role = 'CEO' THEN gen_random_uuid() ELSE NULL END;
  INSERT INTO public.profiles (id, full_name, email, role, is_default_admin, clinic_id)
    VALUES (new.id, v_full_name, new.email, v_role, is_first, v_clinic)
    ON CONFLICT (id) DO NOTHING;
  IF is_first THEN INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING; END IF;
  IF v_role = 'CADISTA' THEN INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id); END IF;
  RETURN new;
END $function$;

-- Backfill: give existing CEO a clinic and attach members without a clinic to it.
DO $$
DECLARE v_ceo uuid; v_clinic uuid;
BEGIN
  SELECT id INTO v_ceo FROM public.profiles WHERE role = 'CEO' ORDER BY created_at ASC LIMIT 1;
  IF v_ceo IS NOT NULL THEN
    SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = v_ceo;
    IF v_clinic IS NULL THEN
      v_clinic := gen_random_uuid();
      UPDATE public.profiles SET clinic_id = v_clinic WHERE id = v_ceo;
    END IF;
    UPDATE public.profiles SET clinic_id = v_clinic WHERE clinic_id IS NULL AND id <> v_ceo;
  END IF;
END $$;
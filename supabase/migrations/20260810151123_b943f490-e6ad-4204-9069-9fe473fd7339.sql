-- Update update_team_member to handle multiple roles
CREATE OR REPLACE FUNCTION public.update_team_member(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text,
  p_category_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_additional_roles text[] DEFAULT ARRAY[]::text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_enum app_role;
  v_role_str text;
  v_cat_id uuid;
BEGIN
  -- Validate caller is admin (CEO or DR)
  IF NOT (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR'))) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Update profile (primary role)
  UPDATE public.profiles
  SET 
    full_name = p_full_name,
    email = p_email,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role,
    updated_at = now()
  WHERE id = p_user_id;

  -- Update clinic_members primary role
  UPDATE public.clinic_members
  SET role = p_role::text
  WHERE user_id = p_user_id;

  -- Clear and Rebuild user_roles
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  
  -- Insert primary role
  BEGIN
    v_role_enum := lower(p_role)::app_role;
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_role_enum)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN 
    -- Fallback for non-enum roles
  END;
  
  -- Insert additional roles
  FOREACH v_role_str IN ARRAY p_additional_roles LOOP
    BEGIN
      v_role_enum := lower(v_role_str)::app_role;
      INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_role_enum)
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- ignore
    END;
  END LOOP;

  -- Manage category access
  DELETE FROM public.user_stock_access WHERE user_id = p_user_id;
  FOREACH v_cat_id IN ARRAY p_category_ids LOOP
    INSERT INTO public.user_stock_access (user_id, category_id) VALUES (p_user_id, v_cat_id);
  END LOOP;

  -- Synchronize specialized tables
  -- A user can now be in multiple specialized tables simultaneously
  
  -- Handle Doctor
  IF p_role = 'DR' OR p_role = 'CEO' OR 'DR' = ANY(p_additional_roles) OR 'CEO' = ANY(p_additional_roles) THEN
    INSERT INTO public.doctors (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSE
    DELETE FROM public.doctors WHERE user_id = p_user_id;
  END IF;

  -- Handle Cadista
  IF p_role = 'CADISTA' OR 'CADISTA' = ANY(p_additional_roles) THEN
    INSERT INTO public.cadistas (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSE
    DELETE FROM public.cadistas WHERE user_id = p_user_id;
  END IF;

  -- Handle Protetico
  IF p_role = 'PROTETICO' OR 'PROTETICO' = ANY(p_additional_roles) THEN
    INSERT INTO public.proteticos (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSE
    DELETE FROM public.proteticos WHERE user_id = p_user_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- Update is_staff function to include cadista and handle uppercase roles from profiles
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role IN ('admin', 'dentista', 'recepcionista', 'auxiliar', 'protetico', 'cadista')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
    AND role IN ('CADISTA', 'CEO', 'admin')
  );
END;
$function$;

-- Update handle_new_user to sync with user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_role TEXT;
    v_full_name TEXT;
    v_app_role public.app_role;
BEGIN
    v_role := COALESCE(new.raw_user_meta_data->>'role', 'USER');
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);

    -- Insert into profiles
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new.id, v_full_name, new.email, v_role);

    -- Sync to user_roles if it's a known staff role
    BEGIN
        v_app_role := LOWER(v_role)::public.app_role;
        INSERT INTO public.user_roles (user_id, role)
        VALUES (new.id, v_app_role);
    EXCEPTION WHEN OTHERS THEN
        -- Role not in app_role enum, skip user_roles insertion
    END;

    -- If role is CADISTA, insert into cadistas
    IF v_role = 'CADISTA' THEN
        INSERT INTO public.cadistas (name, user_id)
        VALUES (v_full_name, new.id);
    END IF;

    RETURN new;
END;
$function$;

-- Populate user_roles for existing users
DO $$
DECLARE
    r RECORD;
    v_app_role public.app_role;
BEGIN
    FOR r IN SELECT id, role FROM public.profiles LOOP
        BEGIN
            v_app_role := LOWER(r.role)::public.app_role;
            INSERT INTO public.user_roles (user_id, role)
            VALUES (r.id, v_app_role)
            ON CONFLICT (user_id, role) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            -- Skip if role doesn't match enum
        END;
    END LOOP;
END $$;

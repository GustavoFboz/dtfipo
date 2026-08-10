-- 1. Specialist Tables Setup
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'doctors' AND column_name = 'user_id') THEN
        ALTER TABLE public.doctors ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'doctors' AND column_name = 'name') THEN
        ALTER TABLE public.doctors ADD COLUMN name text;
    END IF;
END $$;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cadistas' AND column_name = 'user_id') THEN
        ALTER TABLE public.cadistas ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.proteticos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proteticos TO authenticated;
GRANT ALL ON public.proteticos TO service_role;

ALTER TABLE public.proteticos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Proteticos readable by authenticated" ON public.proteticos
        FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.doctors ADD CONSTRAINT doctors_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.cadistas ADD CONSTRAINT cadistas_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Drop and Create the updated function
DROP FUNCTION IF EXISTS public.update_team_member(uuid,text,text,text,text,uuid[]);

CREATE OR REPLACE FUNCTION public.update_team_member(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text,
  p_category_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_enum app_role;
  v_cat_id uuid;
BEGIN
  -- Validate caller is admin
  IF NOT (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR'))) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET 
    full_name = p_full_name,
    email = p_email,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role,
    updated_at = now()
  WHERE id = p_user_id;

  -- Update clinic_members role
  UPDATE public.clinic_members
  SET role = p_role::text
  WHERE user_id = p_user_id;

  -- Sync user_roles
  BEGIN
    v_role_enum := lower(p_role)::app_role;
    DELETE FROM public.user_roles WHERE user_id = p_user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_role_enum);
  EXCEPTION WHEN OTHERS THEN
    -- Fallback
  END;

  -- Manage category access
  DELETE FROM public.user_stock_access WHERE user_id = p_user_id;
  FOREACH v_cat_id IN ARRAY p_category_ids LOOP
    INSERT INTO public.user_stock_access (user_id, category_id) VALUES (p_user_id, v_cat_id);
  END LOOP;

  -- Specialists sync
  IF p_role = 'DR' OR p_role = 'CEO' THEN
    INSERT INTO public.doctors (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSIF p_role = 'CADISTA' THEN
    INSERT INTO public.cadistas (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSIF p_role = 'PROTETICO' THEN
    INSERT INTO public.proteticos (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- 3. Specialist handling for Leandro
DO $$
DECLARE
    v_user_id uuid := '46f99471-deaf-47cb-b2cd-f013f69a6ce6';
BEGIN
    UPDATE public.profiles SET role = 'CEO', account_subtype = 'CEO' WHERE id = v_user_id;
    
    INSERT INTO public.doctors (name, user_id) 
    VALUES ('Leandro Praia', v_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
    
    DELETE FROM public.doctors WHERE name = 'Dr. Leandro' AND user_id IS NULL;
END $$;

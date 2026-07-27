-- Ensure the primary account is CEO
UPDATE public.profiles SET role = 'CEO' WHERE email = 'gustavovitorfa@gmail.com';

-- Logic to promote the first user to CEO if the table is nearly empty
CREATE OR REPLACE FUNCTION public.ensure_first_user_is_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) = 1 THEN
    UPDATE public.profiles SET role = 'CEO' WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ensure_first_user_is_admin ON public.profiles;
CREATE TRIGGER tr_ensure_first_user_is_admin
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_first_user_is_admin();

-- Fix the create_team_member function to be more robust with permission checks
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  new_user_id UUID;
  default_password TEXT := 'dentalflow@';
  v_requester_role TEXT;
BEGIN
  -- Get requester role directly
  SELECT role INTO v_requester_role FROM public.profiles WHERE id = auth.uid();

  -- Check if the requester is an admin (CEO or DR)
  IF v_requester_role NOT IN ('CEO', 'DR') OR v_requester_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: seu usuário (%) não possui privilégios de administrador.', v_requester_role;
  END IF;

  -- Create user in auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, crypt(default_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', format('{"full_name":"%s"}', p_full_name)::jsonb,
    now(), now(), '', '', '', ''
  )
  RETURNING id INTO new_user_id;

  -- Create identity
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), new_user_id, format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email', now(), now(), now()
  );

  -- Handle profile
  INSERT INTO public.profiles (id, email, full_name, phone, role, account_subtype)
  VALUES (new_user_id, p_email, p_full_name, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE 
  SET full_name = p_full_name, phone = p_phone, role = p_role, account_subtype = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
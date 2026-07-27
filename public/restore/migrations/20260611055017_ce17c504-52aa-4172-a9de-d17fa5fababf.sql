-- Update the create_team_member function to use the fixed default password
-- This keeps the password consistent and handled only at the database level
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
  default_password TEXT := 'dentalflow@'; -- Hardcoded confidential default password
BEGIN
  -- Check if the requester is an admin (CEO or DR)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar membros.';
  END IF;

  -- Create user in auth.users with the confidential default password
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(default_password, gen_salt('bf')),
    now(), -- Email confirmed immediately
    '{"provider":"email","providers":["email"]}',
    format('{"full_name":"%s"}', p_full_name)::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO new_user_id;

  -- Create identity for the user
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  -- Handle profile creation/update
  UPDATE public.profiles
  SET 
    full_name = p_full_name,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role
  WHERE id = new_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, email, full_name, phone, role, account_subtype)
    VALUES (new_user_id, p_email, p_full_name, p_phone, p_role, p_role);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', new_user_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
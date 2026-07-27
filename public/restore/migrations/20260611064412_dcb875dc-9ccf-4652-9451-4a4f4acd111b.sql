CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  default_pass_hash TEXT;
BEGIN
  -- Verificar se o usuário já existe na auth.users
  SELECT id INTO new_user_id FROM auth.users WHERE email = p_email;
  
  IF new_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  -- Gerar hash da senha padrão 'dentalflow@'
  -- Usamos a extensão pgcrypto que acabamos de garantir que existe
  default_pass_hash := crypt('dentalflow@', gen_salt('bf'));

  -- Criar o usuário no schema de autenticação
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
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
    default_pass_hash,
    now(), -- Confirma o e-mail imediatamente
    NULL,
    NULL,
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', p_role),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO new_user_id;

  -- Criar o perfil no schema public (o trigger handle_new_user pode já fazer isso, mas garantimos aqui)
  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role;

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
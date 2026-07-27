-- Primeiro, removemos as versões existentes para evitar conflitos de sobrecarga
DROP FUNCTION IF EXISTS public.create_team_member(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_team_member(TEXT, TEXT, TEXT, TEXT, TEXT);

-- Recria a função com a lógica correta de identidades e senha padrão
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Garante que pgcrypto esteja disponível
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- Gerar hash da senha padrão 'dentalflow@'
  default_pass_hash := crypt('dentalflow@', gen_salt('bf'));

  -- Criar o usuário no schema auth
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
    recovery_token,
    is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    default_pass_hash,
    now(), -- Confirma o e-mail imediatamente
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name, 'role', p_role),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false
  )
  RETURNING id INTO new_user_id;

  -- CRITICAL: Criar a identidade na auth.identities para que o login funcione
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

  -- Criar ou atualizar o perfil no schema public
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

GRANT EXECUTE ON FUNCTION public.create_team_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_member TO service_role;

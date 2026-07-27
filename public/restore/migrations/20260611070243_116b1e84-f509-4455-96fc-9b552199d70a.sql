-- Tabela de logs administrativos
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id),
    target_user_id UUID,
    action TEXT NOT NULL, -- 'DELETE_USER', 'UPDATE_ROLE'
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all logs" ON public.admin_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
        )
    );

CREATE POLICY "Admins can insert logs" ON public.admin_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
        )
    );

-- Função para deletar um membro (necessário permissão elevada)
CREATE OR REPLACE FUNCTION public.delete_team_member(
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Removido pelo administrador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_role TEXT;
  v_target_email TEXT;
BEGIN
  -- Verificar se o executor é admin
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  
  IF v_admin_role NOT IN ('CEO', 'DR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir membros.';
  END IF;

  SELECT email INTO v_target_email FROM auth.users WHERE id = p_user_id;

  -- Registrar o log antes de deletar
  INSERT INTO public.admin_logs (admin_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    p_user_id,
    'DELETE_USER',
    jsonb_build_object('reason', p_reason, 'target_email', v_target_email)
  );

  -- Deletar o perfil
  DELETE FROM public.profiles WHERE id = p_user_id;
  
  -- Deletar as identidades do usuário
  DELETE FROM auth.identities WHERE user_id = p_user_id;

  -- Deletar o usuário da auth.users
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_team_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_team_member TO service_role;

-- Atualizar a função create_team_member para incluir provider_id (que deve ser o email para o provider 'email')
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

  -- Criar a identidade na auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email',
    p_email, -- No Supabase, provider_id para email costuma ser o próprio email
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

-- Garantir que o email contalabpraia@gmail.com tenha identidade correta
DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'contalabpraia@gmail.com';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  
  IF v_user_id IS NOT NULL THEN
    -- Deletar identidades incorretas se houver
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    
    -- Criar identidade correta
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id, format('{"sub":"%s","email":"%s"}', v_user_id, v_email)::jsonb, 'email', v_email, now(), now(), now());
    
    -- Confirmar email
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user_id;
  END IF;
END $$;

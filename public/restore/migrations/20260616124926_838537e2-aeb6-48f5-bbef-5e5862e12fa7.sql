CREATE OR REPLACE FUNCTION public.create_team_member(p_email text, p_full_name text, p_phone text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  new_user_id UUID;
  random_pass TEXT;
  pass_hash   TEXT;
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas administradores podem criar membros.');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  random_pass := encode(extensions.gen_random_bytes(24), 'base64');
  pass_hash := extensions.crypt(random_pass, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, pass_hash, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', false
  ) RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, p_email)::jsonb,
    'email', p_email, now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name, phone = p_phone, role = p_role, account_subtype = p_role;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', new_user_id,
    'note', 'Envie um e-mail de redefinição de senha ao novo membro.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_team_member(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_member(text,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_company_account(p_name text, p_kind text, p_full_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_user_email text;
  v_clinic_id uuid;
  v_existing_clinic uuid;
  v_code text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  IF p_kind NOT IN ('consultorio','laboratorio') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo inválido');
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome da empresa inválido');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user;

  SELECT COALESCE(
    (SELECT p.clinic_id FROM public.profiles p WHERE p.id = v_user),
    (SELECT cm.clinic_id
       FROM public.clinic_members cm
      WHERE cm.user_id = v_user AND cm.status = 'active'
      ORDER BY (cm.role = 'CEO') DESC, cm.decided_at DESC NULLS LAST, cm.created_at DESC
      LIMIT 1)
  ) INTO v_existing_clinic;

  IF v_existing_clinic IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário já vinculado a uma empresa');
  END IF;

  v_code := public.generate_clinic_invite_code();

  INSERT INTO public.clinics (name, kind, owner_id, invite_code)
  VALUES (trim(p_name), p_kind, v_user, v_code)
  RETURNING id INTO v_clinic_id;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_clinic_id, v_user, 'CEO', 'active', v_user, v_user, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = 'CEO', decided_by = v_user, decided_at = now(), updated_at = now();

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    account_subtype,
    is_default_admin,
    user_code,
    clinic_id
  )
  VALUES (
    v_user,
    COALESCE(NULLIF(trim(p_full_name), ''), v_user_email),
    v_user_email,
    'CEO',
    'CEO',
    true,
    public.generate_user_code(),
    v_clinic_id
  )
  ON CONFLICT (id) DO UPDATE
    SET clinic_id = EXCLUDED.clinic_id,
        role = 'CEO',
        account_subtype = 'CEO',
        is_default_admin = true,
        full_name = COALESCE(NULLIF(trim(p_full_name), ''), public.profiles.full_name, v_user_email),
        email = COALESCE(public.profiles.email, v_user_email),
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id, 'invite_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END
$function$;

CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text,
  p_password text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  new_user_id uuid;
  pass_hash text;
  v_caller_role text;
  v_caller_clinic uuid;
  v_code text;
  v_enum_role public.app_role;
BEGIN
  SELECT role, clinic_id INTO v_caller_role, v_caller_clinic
    FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas administradores podem criar membros.');
  END IF;

  IF v_caller_clinic IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário sem clínica associada.');
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A senha deve ter pelo menos 8 caracteres.');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  v_enum_role := CASE p_role
    WHEN 'CEO' THEN 'admin'::public.app_role
    WHEN 'DR' THEN 'dentista'::public.app_role
    WHEN 'PROTETICO' THEN 'protetico'::public.app_role
    WHEN 'CADISTA' THEN 'cadista'::public.app_role
    WHEN 'ATENDIMENTO' THEN 'recepcionista'::public.app_role
    ELSE 'auxiliar'::public.app_role
  END;

  pass_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  v_code := public.generate_user_code();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(trim(p_email)), pass_hash, now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', false
  ) RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', lower(trim(p_email))),
    'email', lower(trim(p_email)), now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype, user_code, clinic_id)
  VALUES (new_user_id, p_full_name, lower(trim(p_email)), p_phone, p_role, p_role, v_code, v_caller_clinic)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name,
    email = lower(trim(p_email)),
    phone = p_phone,
    role = p_role,
    account_subtype = p_role,
    user_code = COALESCE(public.profiles.user_code, v_code),
    clinic_id = v_caller_clinic,
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, v_enum_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_caller_clinic, new_user_id, p_role, 'active', auth.uid(), auth.uid(), now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = p_role, decided_by = auth.uid(), decided_at = now(), updated_at = now();

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id, 'user_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END
$function$;

GRANT EXECUTE ON FUNCTION public.create_company_account(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, text, text) TO authenticated;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('CEO', 'DR')
  AND p.clinic_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.clinic_members (clinic_id, user_id, role, status, decided_by, decided_at)
SELECT p.clinic_id, p.id, p.role, 'active', p.id, now()
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('CEO', 'DR')
  AND p.clinic_id IS NOT NULL
ON CONFLICT (clinic_id, user_id) DO UPDATE
  SET status = 'active', role = EXCLUDED.role, decided_at = now(), updated_at = now();

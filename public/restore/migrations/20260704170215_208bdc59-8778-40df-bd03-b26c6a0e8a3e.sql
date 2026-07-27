-- Allow profile privilege fields to follow an already-approved active clinic membership
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_membership_role text;
BEGIN
  IF public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Não é permitido alterar o id do perfil.';
  END IF;

  SELECT cm.role
    INTO v_membership_role
  FROM public.clinic_members cm
  WHERE cm.user_id = NEW.id
    AND cm.clinic_id = NEW.clinic_id
    AND cm.status = 'active'
  ORDER BY (cm.role = 'CEO') DESC, cm.decided_at DESC NULLS LAST, cm.created_at DESC
  LIMIT 1;

  IF COALESCE(NEW.clinic_id::text, '') IS DISTINCT FROM COALESCE(OLD.clinic_id::text, '')
     AND v_membership_role IS NULL THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o consultório vinculado.';
  END IF;

  IF COALESCE(NEW.role, '') IS DISTINCT FROM COALESCE(OLD.role, '')
     AND (v_membership_role IS NULL OR NEW.role IS DISTINCT FROM v_membership_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o papel do usuário.';
  END IF;

  IF COALESCE(NEW.account_subtype, '') IS DISTINCT FROM COALESCE(OLD.account_subtype, '')
     AND NOT (v_membership_role = 'CEO' AND NEW.account_subtype = 'CEO') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o subtipo da conta.';
  END IF;

  IF COALESCE(NEW.is_default_admin, false) IS DISTINCT FROM COALESCE(OLD.is_default_admin, false)
     AND NOT (v_membership_role = 'CEO' AND NEW.is_default_admin = true) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o status de administrador padrão.';
  END IF;

  IF COALESCE(NEW.user_code, '') IS DISTINCT FROM COALESCE(OLD.user_code, '') THEN
    RAISE EXCEPTION 'Não é permitido alterar o código de usuário.';
  END IF;

  RETURN NEW;
END
$function$;

-- Sync profiles that already have an active clinic membership but no clinic on the profile
WITH active_memberships AS (
  SELECT DISTINCT ON (cm.user_id)
    cm.user_id,
    cm.clinic_id,
    cm.role
  FROM public.clinic_members cm
  WHERE cm.status = 'active'
  ORDER BY
    cm.user_id,
    (cm.role = 'CEO') DESC,
    cm.decided_at DESC NULLS LAST,
    cm.created_at DESC
)
UPDATE public.profiles p
SET
  clinic_id = am.clinic_id,
  role = CASE
    WHEN p.role IS NULL OR p.role = 'USER' OR am.role IN ('CEO', 'DR', 'PROTETICO', 'CADISTA', 'ATENDIMENTO') THEN am.role
    ELSE p.role
  END,
  account_subtype = CASE
    WHEN am.role = 'CEO' THEN 'CEO'
    ELSE p.account_subtype
  END,
  is_default_admin = CASE
    WHEN am.role = 'CEO' THEN true
    ELSE p.is_default_admin
  END,
  updated_at = now()
FROM active_memberships am
WHERE p.id = am.user_id
  AND p.clinic_id IS NULL;

-- Make company-account creation resilient to profile creation timing
CREATE OR REPLACE FUNCTION public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text
)
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

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id, 'invite_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END
$function$;
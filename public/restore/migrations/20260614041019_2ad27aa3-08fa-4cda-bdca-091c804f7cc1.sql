
-- 1) Force role 'USER' for self-signup; ignore client-supplied role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_full_name TEXT;
BEGIN
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);

    -- Always insert as basic USER; elevation must be performed by an admin afterwards.
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (new.id, v_full_name, new.email, 'USER');

    RETURN new;
END;
$function$;

-- 2) Remove hardcoded default password from create_team_member; use random password.
--    Admin must trigger a password reset email for the invitee after creation.
CREATE OR REPLACE FUNCTION public.create_team_member(p_email text, p_full_name text, p_phone text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_user_id UUID;
  random_pass TEXT;
  pass_hash   TEXT;
  v_caller_role TEXT;
BEGIN
  -- Only CEO/DR can create team members
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas administradores podem criar membros.');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- Strong random password (not returned, not stored in plain text).
  random_pass := encode(gen_random_bytes(24), 'base64');
  pass_hash := crypt(random_pass, gen_salt('bf'));

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

-- 3) Tighten notifications read policy: only direct recipient can read.
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (recipient_id = auth.uid());

-- 4) Tighten profiles UPDATE policy: prevent non-default-admins from setting is_default_admin = true,
--    and prevent non-admins from changing their own role. Use a SECURITY DEFINER helper to avoid
--    recursive policy evaluation on the profiles table.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('CEO','DR')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_default_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND COALESCE(is_default_admin, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.profile_role(_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT role FROM public.profiles WHERE id = _id $$;

CREATE OR REPLACE FUNCTION public.profile_is_default_admin(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT COALESCE(is_default_admin, false) FROM public.profiles WHERE id = _id $$;

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.current_user_is_admin())
WITH CHECK (
  -- Only an existing default admin can set or keep is_default_admin = true on any row,
  -- unless the target row was already a default admin (no-op change).
  (COALESCE(is_default_admin, false) = false
    OR public.current_user_is_default_admin()
    OR public.profile_is_default_admin(id) = true)
  AND
  -- Non-admins cannot change their own role.
  (
    public.current_user_is_admin()
    OR (id = auth.uid() AND role IS NOT DISTINCT FROM public.profile_role(auth.uid()))
  )
);

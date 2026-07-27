
-- 1. CLINICS table
CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view clinics" ON public.clinics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update their clinic" ON public.clinics
  FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can insert clinics" ON public.clinics
  FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());

CREATE TRIGGER trg_clinics_updated BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. CLINIC_MEMBERS table
CREATE TABLE public.clinic_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'USER',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_members TO authenticated;
GRANT ALL ON public.clinic_members TO service_role;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own memberships" ON public.clinic_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin());
CREATE POLICY "Users request membership" ON public.clinic_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "Admins manage memberships" ON public.clinic_members
  FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins delete memberships" ON public.clinic_members
  FOR DELETE TO authenticated USING (public.current_user_is_admin());

CREATE TRIGGER trg_clinic_members_updated BEFORE UPDATE ON public.clinic_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. PROFILES: add clinic_id + user_code
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_code text UNIQUE;

-- helper to generate code
CREATE OR REPLACE FUNCTION public.generate_user_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  code text;
  exists_count int;
BEGIN
  LOOP
    code := 'USR-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    SELECT count(*) INTO exists_count FROM public.profiles WHERE user_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END $$;

-- backfill codes for existing users
UPDATE public.profiles SET user_code = public.generate_user_code() WHERE user_code IS NULL;
ALTER TABLE public.profiles ALTER COLUMN user_code SET NOT NULL;

-- 4. Seed IPO clinic + memberships
DO $$
DECLARE
  v_ipo uuid;
  v_owner uuid;
BEGIN
  SELECT id INTO v_owner FROM public.profiles WHERE email = 'gustavovitorfa@gmail.com' LIMIT 1;

  INSERT INTO public.clinics (name, slug, created_by)
  VALUES ('IPO - Instituto Praia de Odontologia', 'ipo', v_owner)
  RETURNING id INTO v_ipo;

  -- Make every existing profile an active member of IPO
  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, decided_by, decided_at)
  SELECT v_ipo, p.id, p.role, 'active', v_owner, now()
  FROM public.profiles p
  ON CONFLICT (clinic_id, user_id) DO NOTHING;

  UPDATE public.profiles SET clinic_id = v_ipo WHERE clinic_id IS NULL;
END $$;

-- 5. current_user_clinic_id helper
CREATE OR REPLACE FUNCTION public.current_user_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 6. Update handle_new_user to assign user_code, no clinic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name text;
  v_code text;
BEGIN
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  v_code := public.generate_user_code();

  INSERT INTO public.profiles (id, full_name, email, role, user_code, clinic_id)
  VALUES (new.id, v_full_name, new.email, 'USER', v_code, NULL);

  RETURN new;
END $$;

-- 7. Join-clinic functions
CREATE OR REPLACE FUNCTION public.request_join_clinic(p_clinic_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_existing record;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_existing FROM public.clinic_members
   WHERE user_id = v_user AND clinic_id = p_clinic_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Você já é membro deste consultório');
    ELSIF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Solicitação já enviada, aguardando aprovação');
    ELSE
      -- rejected -> reopen
      UPDATE public.clinic_members
         SET status='pending', decided_by=NULL, decided_at=NULL, updated_at=now()
       WHERE id = v_existing.id;
      RETURN jsonb_build_object('success', true);
    END IF;
  END IF;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status)
  VALUES (p_clinic_id, v_user, 'USER', 'pending');
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.approve_join_request(p_member_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m record;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT * INTO v_m FROM public.clinic_members WHERE id = p_member_id;
  IF v_m.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;

  UPDATE public.clinic_members
     SET status='active', role=p_role, decided_by=auth.uid(), decided_at=now()
   WHERE id = p_member_id;

  UPDATE public.profiles
     SET clinic_id = v_m.clinic_id, role = p_role, account_subtype = p_role
   WHERE id = v_m.user_id;

  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.reject_join_request(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  UPDATE public.clinic_members
     SET status='rejected', decided_by=auth.uid(), decided_at=now()
   WHERE id = p_member_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- 8. create_team_member with admin-defined password + clinic assignment
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_email text, p_full_name text, p_phone text, p_role text, p_password text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions' AS $$
DECLARE
  new_user_id uuid;
  pass_to_use text;
  pass_hash text;
  v_caller_role text;
  v_caller_clinic uuid;
  v_code text;
BEGIN
  SELECT role, clinic_id INTO v_caller_role, v_caller_clinic
    FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado: apenas administradores podem criar membros.');
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este e-mail já está cadastrado no sistema.');
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A senha deve ter pelo menos 8 caracteres.');
  END IF;

  pass_to_use := p_password;
  pass_hash := extensions.crypt(pass_to_use, extensions.gen_salt('bf'));
  v_code := public.generate_user_code();

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

  INSERT INTO public.profiles (id, full_name, email, phone, role, account_subtype, user_code, clinic_id)
  VALUES (new_user_id, p_full_name, p_email, p_phone, p_role, p_role, v_code, v_caller_clinic)
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name, phone = p_phone, role = p_role,
    account_subtype = p_role, user_code = COALESCE(public.profiles.user_code, v_code),
    clinic_id = v_caller_clinic;

  -- Auto-add as active clinic member
  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_caller_clinic, new_user_id, p_role, 'active', auth.uid(), auth.uid(), now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status='active', role=p_role, decided_by=auth.uid(), decided_at=now();

  RETURN jsonb_build_object('success', true, 'user_id', new_user_id, 'user_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- 9. admin_set_member_password
CREATE OR REPLACE FUNCTION public.admin_set_member_password(p_user_id uuid, p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions' AS $$
DECLARE v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A senha deve ter pelo menos 8 caracteres.');
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

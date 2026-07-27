
-- current_user_is_admin
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
$$;

-- clinics
CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  kind text NOT NULL DEFAULT 'consultorio',
  owner_id uuid,
  invite_code text UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clinics' AND policyname='Authenticated can view clinics') THEN
    CREATE POLICY "Authenticated can view clinics" ON public.clinics FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clinics' AND policyname='Admins can update their clinic') THEN
    CREATE POLICY "Admins can update their clinic" ON public.clinics FOR UPDATE TO authenticated
      USING (public.current_user_is_admin() OR owner_id = auth.uid())
      WITH CHECK (public.current_user_is_admin() OR owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clinics' AND policyname='Authenticated can insert clinics') THEN
    CREATE POLICY "Authenticated can insert clinics" ON public.clinics FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_clinics_updated ON public.clinics;
CREATE TRIGGER trg_clinics_updated BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- generate_user_code
CREATE OR REPLACE FUNCTION public.generate_user_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE code text; c int;
BEGIN
  LOOP
    code := 'USR-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    SELECT count(*) INTO c FROM public.profiles WHERE user_code = code;
    EXIT WHEN c = 0;
  END LOOP;
  RETURN code;
END $$;

-- generate_clinic_invite_code
CREATE OR REPLACE FUNCTION public.generate_clinic_invite_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE code text; c int;
BEGIN
  LOOP
    code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    SELECT count(*) INTO c FROM public.clinics WHERE invite_code = code;
    EXIT WHEN c = 0;
  END LOOP;
  RETURN code;
END $$;

-- Ensure profiles has account_subtype (already present) - noop safety
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_subtype text;

-- create_company_account
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
    (SELECT cm.clinic_id FROM public.clinic_members cm
      WHERE cm.user_id = v_user AND cm.status = 'active'
      ORDER BY (cm.role = 'CEO') DESC, cm.decided_at DESC NULLS LAST, cm.created_at DESC
      LIMIT 1)
  ) INTO v_existing_clinic;

  IF v_existing_clinic IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário já vinculado a uma empresa');
  END IF;

  v_code := public.generate_clinic_invite_code();

  INSERT INTO public.clinics (name, kind, owner_id, invite_code, created_by)
  VALUES (trim(p_name), p_kind, v_user, v_code, v_user)
  RETURNING id INTO v_clinic_id;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_clinic_id, v_user, 'CEO', 'active', v_user, v_user, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = 'CEO', decided_by = v_user, decided_at = now(), updated_at = now();

  INSERT INTO public.profiles (id, full_name, email, role, account_subtype, is_default_admin, user_code, clinic_id)
  VALUES (v_user, COALESCE(NULLIF(trim(p_full_name), ''), v_user_email), v_user_email, 'CEO', 'CEO', true, public.generate_user_code(), v_clinic_id)
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

GRANT EXECUTE ON FUNCTION public.create_company_account(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_clinic_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_user_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

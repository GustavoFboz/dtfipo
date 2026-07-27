
-- 1. Extend clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'consultorio',
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS invite_code text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_kind_check') THEN
    ALTER TABLE public.clinics ADD CONSTRAINT clinics_kind_check CHECK (kind IN ('consultorio','laboratorio'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clinics_invite_code_key ON public.clinics(invite_code) WHERE invite_code IS NOT NULL;

-- Helper: generate opaque invite code
CREATE OR REPLACE FUNCTION public.generate_clinic_invite_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  code text;
  n int;
BEGIN
  LOOP
    code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
    SELECT count(*) INTO n FROM public.clinics WHERE invite_code = code;
    EXIT WHEN n = 0;
  END LOOP;
  RETURN code;
END $$;

-- Backfill existing clinics
UPDATE public.clinics
   SET invite_code = public.generate_clinic_invite_code()
 WHERE invite_code IS NULL;

UPDATE public.clinics c
   SET owner_id = (
     SELECT p.id FROM public.profiles p
      WHERE p.clinic_id = c.id AND p.role IN ('CEO','DR')
      ORDER BY p.created_at ASC NULLS LAST LIMIT 1
   )
 WHERE owner_id IS NULL;

-- 2. Create company account (called right after auth signup by the owner)
CREATE OR REPLACE FUNCTION public.create_company_account(
  p_name text,
  p_kind text,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
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

  SELECT clinic_id INTO v_existing_clinic FROM public.profiles WHERE id = v_user;
  IF v_existing_clinic IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário já vinculado a uma empresa');
  END IF;

  v_code := public.generate_clinic_invite_code();

  INSERT INTO public.clinics (name, kind, owner_id, invite_code)
  VALUES (trim(p_name), p_kind, v_user, v_code)
  RETURNING id INTO v_clinic_id;

  UPDATE public.profiles
     SET clinic_id = v_clinic_id,
         role = 'CEO',
         account_subtype = 'CEO',
         is_default_admin = true,
         full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
         updated_at = now()
   WHERE id = v_user;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_clinic_id, v_user, 'CEO', 'active', v_user, v_user, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = 'CEO', decided_by = v_user, decided_at = now();

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id, 'invite_code', v_code);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- 3. Join company using invite code (employee flow)
CREATE OR REPLACE FUNCTION public.join_company_with_code(
  p_invite_code text,
  p_role text DEFAULT 'USER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic RECORD;
  v_existing uuid;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT clinic_id INTO v_existing FROM public.profiles WHERE id = v_user;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário já vinculado a uma empresa');
  END IF;

  SELECT * INTO v_clinic FROM public.clinics WHERE invite_code = upper(trim(p_invite_code));
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código de convite inválido');
  END IF;

  v_role := COALESCE(NULLIF(p_role,''), 'USER');
  IF v_role NOT IN ('USER','ATENDIMENTO','PROTETICO','CADISTA','DR') THEN
    v_role := 'USER';
  END IF;

  UPDATE public.profiles
     SET clinic_id = v_clinic.id,
         role = v_role,
         account_subtype = v_role,
         updated_at = now()
   WHERE id = v_user;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, invited_by, decided_by, decided_at)
  VALUES (v_clinic.id, v_user, v_role, 'active', v_clinic.owner_id, v_clinic.owner_id, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status = 'active', role = v_role, decided_at = now();

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic.id, 'clinic_name', v_clinic.name);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

-- 4. Regenerate invite code (admin only)
CREATE OR REPLACE FUNCTION public.regenerate_company_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic_id uuid;
  v_new text;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  SELECT clinic_id INTO v_clinic_id FROM public.profiles WHERE id = v_user;
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem empresa vinculada');
  END IF;
  v_new := public.generate_clinic_invite_code();
  UPDATE public.clinics SET invite_code = v_new WHERE id = v_clinic_id;
  RETURN jsonb_build_object('success', true, 'invite_code', v_new);
END $$;

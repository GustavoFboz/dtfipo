-- Corrige perfil existente do fundador
UPDATE public.profiles SET role = 'CEO' WHERE email = 'gustavovitorfa@gmail.com';

-- Garante que ao criar empresa o perfil do criador vira CEO
DROP FUNCTION IF EXISTS public.create_company_account(text, text, text);
CREATE OR REPLACE FUNCTION public.create_company_account(
  p_full_name text,
  p_kind text,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.clinics (name, kind, owner_id, invite_code)
  VALUES (COALESCE(NULLIF(p_name,''), p_full_name || ' – ' || p_kind), p_kind, v_user, public.generate_clinic_invite_code())
  RETURNING id INTO v_clinic_id;

  UPDATE public.profiles
  SET role = 'CEO',
      full_name = COALESCE(NULLIF(p_full_name,''), full_name),
      clinic_id = v_clinic_id
  WHERE id = v_user;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_clinic_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company_account(text, text, text) TO authenticated;
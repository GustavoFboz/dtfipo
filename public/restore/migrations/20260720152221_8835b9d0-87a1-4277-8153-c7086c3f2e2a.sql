CREATE OR REPLACE FUNCTION public.current_user_has_clinic()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.clinic_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.clinics c WHERE c.owner_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_clinic() TO authenticated;

-- Heal profile.clinic_id if user owns a clinic (or has active membership) but profile is missing the link.
CREATE OR REPLACE FUNCTION public.heal_current_user_clinic_link()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic uuid;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;

  SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = v_user;
  IF v_clinic IS NOT NULL THEN RETURN v_clinic; END IF;

  SELECT id INTO v_clinic FROM public.clinics WHERE owner_id = v_user LIMIT 1;
  IF v_clinic IS NULL THEN
    SELECT clinic_id INTO v_clinic FROM public.clinic_members
      WHERE user_id = v_user AND status = 'active'
      ORDER BY decided_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF v_clinic IS NOT NULL THEN
    UPDATE public.profiles SET clinic_id = v_clinic, updated_at = now() WHERE id = v_user;
  END IF;
  RETURN v_clinic;
END;
$$;

GRANT EXECUTE ON FUNCTION public.heal_current_user_clinic_link() TO authenticated;

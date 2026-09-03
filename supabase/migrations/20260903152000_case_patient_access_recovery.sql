-- Ensure an authorized professional receives the patient's clinical identity
-- for the cases they legitimately belong to. This fixes partial/nulled case
-- rows for legacy specialists without widening access to unrelated patients.

CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type text;
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN RETURN false; END IF;

  SELECT public.effective_user_type(v_user), COALESCE(p.is_default_admin,false)
    INTO v_type,v_is_default_admin
  FROM public.profiles p
  WHERE p.id=v_user;

  IF v_is_default_admin OR v_type IN ('CEO','ADMIN','PROTETICO') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.patient_id=_patient_id
      AND public.can_access_case(c.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_patient(uuid) TO authenticated, service_role;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='patients'
      AND cmd IN ('SELECT','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.patients', p.policyname);
  END LOOP;
END $$;

CREATE POLICY patients_select_by_case_membership
ON public.patients
FOR SELECT TO authenticated
USING (public.can_access_patient(id));

-- Current assigned professionals need to resolve their own directory row even
-- in older installations where user_id was not populated consistently.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='cadistas'
  ) THEN
    DROP POLICY IF EXISTS cadistas_select_authenticated_directory ON public.cadistas;
    CREATE POLICY cadistas_select_authenticated_directory
    ON public.cadistas FOR SELECT TO authenticated
    USING (true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='doctors'
  ) THEN
    DROP POLICY IF EXISTS doctors_select_authenticated_directory ON public.doctors;
    CREATE POLICY doctors_select_authenticated_directory
    ON public.doctors FOR SELECT TO authenticated
    USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

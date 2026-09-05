-- Lovable Cloud recovery for partially-applied case/patient access migrations.
--
-- Some older Lovable Cloud databases can have the current frontend/schema but
-- miss the can_access_patient(uuid) helper. Patient attachment/storage RLS uses
-- that helper, so recreate it without widening patient visibility.

CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type text := '';
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    upper(
      COALESCE(
        NULLIF(trim(p.account_subtype), ''),
        NULLIF(trim(p.role), ''),
        ''
      )
    ),
    COALESCE(p.is_default_admin, false)
  INTO v_type, v_is_default_admin
  FROM public.profiles p
  WHERE p.id = v_user;

  -- Existing Dental Flow global patient access roles.
  IF v_is_default_admin OR v_type IN ('CEO', 'ADMIN', 'PROTETICO') THEN
    RETURN true;
  END IF;

  -- In a partially migrated database, fail closed for non-global users until
  -- can_access_case(uuid) is available rather than exposing unrelated patients.
  IF to_regprocedure('public.can_access_case(uuid)') IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.patient_id = _patient_id
      AND public.can_access_case(c.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_patient(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

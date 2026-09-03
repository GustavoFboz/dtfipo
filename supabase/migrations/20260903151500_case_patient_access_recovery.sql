-- Idempotent recovery for case/patient visibility.
-- Ensures legitimate assigned specialists see the complete case/patient while
-- unrelated users remain isolated.

CREATE OR REPLACE FUNCTION public.effective_user_type(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(
    COALESCE(
      NULLIF(trim(p.account_subtype), ''),
      NULLIF(trim(p.role), ''),
      ''
    )
  )
  FROM public.profiles p
  WHERE p.id = _user_id
$$;

REVOKE ALL ON FUNCTION public.effective_user_type(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_user_type(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_case(_case_id uuid)
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

  IF v_type='SOLICITANTE' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id=_case_id AND c.requested_by=v_user
    );
  END IF;

  IF v_type='CADISTA' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      LEFT JOIN public.cadistas cd ON cd.id=c.cadista_id
      WHERE c.id=_case_id
        AND c.status <> 'pendente'
        AND (cd.user_id=v_user OR cd.id=v_user)
    );
  END IF;

  IF v_type IN ('DR','DENTISTA') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      LEFT JOIN public.doctors d ON d.id=c.doctor_id
      WHERE c.id=_case_id
        AND c.status <> 'pendente'
        AND (d.user_id=v_user OR d.id=v_user)
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_modify_case(_case_id uuid)
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

  IF v_type='SOLICITANTE' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id=_case_id
        AND c.requested_by=v_user
        AND c.status='pendente'
    );
  END IF;

  IF v_type='CADISTA' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      LEFT JOIN public.cadistas cd ON cd.id=c.cadista_id
      WHERE c.id=_case_id
        AND c.status <> 'pendente'
        AND (cd.user_id=v_user OR cd.id=v_user)
    );
  END IF;

  IF v_type IN ('DR','DENTISTA') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      LEFT JOIN public.doctors d ON d.id=c.doctor_id
      WHERE c.id=_case_id
        AND c.status <> 'pendente'
        AND (d.user_id=v_user OR d.id=v_user)
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_case(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_modify_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_modify_case(uuid) TO authenticated, service_role;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='cases'
      AND cmd IN ('SELECT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.cases', p.policyname);
  END LOOP;
END $$;

CREATE POLICY cases_select_by_effective_membership
ON public.cases
FOR SELECT TO authenticated
USING (public.can_access_case(id));

CREATE POLICY cases_update_by_effective_membership
ON public.cases
FOR UPDATE TO authenticated
USING (public.can_modify_case(id))
WITH CHECK (public.can_modify_case(id));

CREATE POLICY cases_delete_by_effective_membership
ON public.cases
FOR DELETE TO authenticated
USING (public.can_modify_case(id));

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

CREATE POLICY patients_select_by_case_access
ON public.patients
FOR SELECT TO authenticated
USING (public.can_access_patient(id));

NOTIFY pgrst, 'reload schema';

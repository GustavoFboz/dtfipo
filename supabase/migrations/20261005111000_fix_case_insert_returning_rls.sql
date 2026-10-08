-- Hotfix for case creation after the Stage 07 company boundary.
--
-- INSERT ... RETURNING is also checked by SELECT RLS. The Stage 07 SELECT
-- policies called can_access_case(id), whose STABLE implementation re-queried
-- public.cases. A row inserted by the current statement is not a safe
-- authorization source for that RETURNING check, so legitimate inserts could
-- pass the INSERT boundary and then fail on cases_company_read_boundary.
--
-- Authorize the row that RLS is already evaluating instead. This preserves the
-- same company/requester/specialist rules without widening cross-company access.

CREATE OR REPLACE FUNCTION public.can_access_case_row(
  _patient_id uuid,
  _requested_by uuid,
  _cadista_id uuid,
  _doctor_id uuid,
  _status text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic uuid;
  v_type text;
  v_admin boolean;
  v_owner_clinic uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    p.clinic_id,
    upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(p.role), ''), '')),
    COALESCE(p.is_default_admin, false)
  INTO v_clinic, v_type, v_admin
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_clinic IS NULL OR NOT public.company_has_operational_access(v_clinic) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(
    (SELECT p.clinic_id FROM public.profiles p WHERE p.id = _requested_by),
    (SELECT p.clinic_id FROM public.patients p WHERE p.id = _patient_id),
    (SELECT p.clinic_id
       FROM public.cadistas cd
       JOIN public.profiles p ON p.id = cd.user_id
      WHERE cd.id = _cadista_id),
    (SELECT p.clinic_id
       FROM public.doctors d
       JOIN public.profiles p ON p.id = d.user_id
      WHERE d.id = _doctor_id)
  )
  INTO v_owner_clinic;

  RETURN
    (
      v_owner_clinic = v_clinic
      AND (
        v_admin
        OR v_type IN ('CEO','ADMIN','PROTETICO')
        OR (
          v_type NOT IN ('SOLICITANTE','CADISTA','DR','DENTISTA')
          AND public.is_staff(v_user)
        )
      )
    )
    OR _requested_by = v_user
    OR (
      COALESCE(_status, '') <> 'pendente'
      AND (
        (
          v_type = 'CADISTA'
          AND EXISTS (
            SELECT 1
            FROM public.cadistas cd
            WHERE cd.id = _cadista_id
              AND cd.user_id = v_user
          )
        )
        OR (
          v_type IN ('DR','DENTISTA')
          AND EXISTS (
            SELECT 1
            FROM public.doctors d
            WHERE d.id = _doctor_id
              AND d.user_id = v_user
          )
        )
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_case_row(uuid,uuid,uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_case_row(uuid,uuid,uuid,uuid,text)
  TO authenticated, service_role;

-- Keep the id-based helper for all existing callers, but delegate the actual
-- authorization to the row-aware predicate above.
CREATE OR REPLACE FUNCTION public.can_access_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = _case_id
      AND public.can_access_case_row(
        c.patient_id,
        c.requested_by,
        c.cadista_id,
        c.doctor_id,
        c.status::text
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid) TO authenticated, service_role;

-- Both sides matter for INSERT ... RETURNING:
-- 1) at least one permissive SELECT policy must accept the new row;
-- 2) every restrictive SELECT policy must also accept it.
DROP POLICY IF EXISTS cases_select_by_company_membership ON public.cases;
CREATE POLICY cases_select_by_company_membership
ON public.cases
FOR SELECT TO authenticated
USING (
  public.can_access_case_row(
    patient_id,
    requested_by,
    cadista_id,
    doctor_id,
    status::text
  )
);

DROP POLICY IF EXISTS cases_company_read_boundary ON public.cases;
CREATE POLICY cases_company_read_boundary
ON public.cases
AS RESTRICTIVE
FOR SELECT TO authenticated
USING (
  public.can_access_case_row(
    patient_id,
    requested_by,
    cadista_id,
    doctor_id,
    status::text
  )
);

NOTIFY pgrst, 'reload schema';

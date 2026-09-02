-- Dental Flow: authoritative case isolation by role and real membership
-- Security boundary:
--   CEO / ADMIN / PROTETICO -> all cases
--   SOLICITANTE            -> only cases requested by the current user
--   CADISTA                 -> only cases assigned to the current user's cadista record
--   DENTISTA / DR           -> only cases assigned to the current user's doctor record
--   everyone else           -> no case visibility
--
-- This migration intentionally replaces every permissive SELECT/UPDATE/DELETE
-- policy on public.cases. PostgreSQL ORs permissive RLS policies, so leaving a
-- legacy "staff can view" policy in place would keep the data leak open.

CREATE OR REPLACE FUNCTION public.can_access_case(_case_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_account_subtype text;
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    upper(COALESCE(p.role, '')),
    upper(COALESCE(p.account_subtype, '')),
    COALESCE(p.is_default_admin, false)
  INTO v_role, v_account_subtype, v_is_default_admin
  FROM public.profiles p
  WHERE p.id = v_user;

  -- Global visibility is intentionally limited to the three elevated roles.
  IF v_is_default_admin
     OR public.has_role(v_user, 'admin')
     OR public.has_role(v_user, 'protetico')
     OR v_role IN ('CEO', 'ADMIN', 'PROTETICO')
     OR v_account_subtype IN ('CEO', 'ADMIN', 'PROTETICO') THEN
    RETURN true;
  END IF;

  -- Requesters are isolated from all other cases.
  IF public.has_role(v_user, 'solicitante')
     OR v_role = 'SOLICITANTE'
     OR v_account_subtype = 'SOLICITANTE' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      WHERE c.id = _case_id
        AND c.requested_by = v_user
    );
  END IF;

  -- Specialists only see a case when they are the specialist assigned to it.
  RETURN EXISTS (
    SELECT 1
    FROM public.cases c
    LEFT JOIN public.cadistas cd ON cd.id = c.cadista_id
    LEFT JOIN public.doctors d ON d.id = c.doctor_id
    WHERE c.id = _case_id
      AND (cd.user_id = v_user OR d.user_id = v_user)
  );
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
  v_role text;
  v_account_subtype text;
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    upper(COALESCE(p.role, '')),
    upper(COALESCE(p.account_subtype, '')),
    COALESCE(p.is_default_admin, false)
  INTO v_role, v_account_subtype, v_is_default_admin
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_is_default_admin
     OR public.has_role(v_user, 'admin')
     OR public.has_role(v_user, 'protetico')
     OR v_role IN ('CEO', 'ADMIN', 'PROTETICO')
     OR v_account_subtype IN ('CEO', 'ADMIN', 'PROTETICO') THEN
    RETURN true;
  END IF;

  -- A requester may only edit/cancel their own request while it is pending.
  IF public.has_role(v_user, 'solicitante')
     OR v_role = 'SOLICITANTE'
     OR v_account_subtype = 'SOLICITANTE' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      WHERE c.id = _case_id
        AND c.requested_by = v_user
        AND c.status = 'pendente'
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cases c
    LEFT JOIN public.cadistas cd ON cd.id = c.cadista_id
    LEFT JOIN public.doctors d ON d.id = c.doctor_id
    WHERE c.id = _case_id
      AND (cd.user_id = v_user OR d.user_id = v_user)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_case(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_modify_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_modify_case(uuid) TO authenticated, service_role;

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cases'
      AND cmd IN ('SELECT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.cases', p.policyname);
  END LOOP;
END;
$$;

CREATE POLICY cases_select_by_role_and_membership
ON public.cases
FOR SELECT
TO authenticated
USING (public.can_access_case(id));

CREATE POLICY cases_update_by_role_and_membership
ON public.cases
FOR UPDATE
TO authenticated
USING (public.can_modify_case(id))
WITH CHECK (public.can_modify_case(id));

CREATE POLICY cases_delete_by_role_and_membership
ON public.cases
FOR DELETE
TO authenticated
USING (public.can_modify_case(id));

-- Supporting indexes keep access checks cheap as the case table grows.
CREATE INDEX IF NOT EXISTS idx_cadistas_user_id ON public.cadistas(user_id);
CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON public.doctors(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_requested_by ON public.cases(requested_by);

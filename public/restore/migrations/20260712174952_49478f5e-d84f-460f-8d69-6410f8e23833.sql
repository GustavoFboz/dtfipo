
-- =========================================================================
-- 1) SECURITY DEFINER hardening: remove EXECUTE from anon / PUBLIC on all
--    public functions. Keep authenticated for RPCs and RLS helper functions.
--    Explicitly revoke authenticated from a few functions that are only
--    invoked internally (as triggers or by other SECURITY DEFINER routines).
-- =========================================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- Internal / trigger-only helpers should not be callable by end users at all.
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT unnest(ARRAY[
      'add_implant_component(uuid,uuid,text,text,numeric,numeric,text)',
      'apply_stock_movement()',
      'apply_stock_rules_for_stage(uuid,uuid,uuid)',
      'consume_case_stock(uuid,uuid)',
      'eligible_teeth_for_rule(uuid,text)',
      'ensure_first_user_is_admin()',
      'handle_new_user()',
      'normalize_text(text)',
      'patients_set_unaccent()',
      'prevent_profile_privilege_escalation()',
      'prevent_unsafe_truncate()',
      'profile_is_default_admin(uuid)',
      'profile_role(uuid)',
      'reverse_case_stock(uuid,uuid)',
      'reverse_stock_rules_for_stage(uuid,uuid,uuid)',
      'sync_profile_to_team()',
      'touch_last_restocked()',
      'update_updated_at_column()',
      'validate_implant_components_for_stage(uuid,uuid)'
    ])
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', fn);
    EXCEPTION WHEN undefined_function OR insufficient_privilege THEN
      -- ignore; some signatures may not exist on this instance
      NULL;
    END;
  END LOOP;
END $$;

-- =========================================================================
-- 2) `can_access_case`: cadista must only reach cases assigned to them,
--    not every case via the `is_staff` shortcut.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.can_access_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.cases c
      JOIN public.cadistas cd ON cd.id = c.cadista_id
      WHERE c.id = _case_id AND cd.user_id = auth.uid()
    );
$$;

-- =========================================================================
-- 3) cases: cadista scoped access + WITH CHECK on update
-- =========================================================================
DROP POLICY IF EXISTS cases_staff_select ON public.cases;
CREATE POLICY cases_staff_select
ON public.cases
FOR SELECT
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    cadista_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.cadistas cd
       WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS cases_staff_update ON public.cases;
CREATE POLICY cases_staff_update
ON public.cases
FOR UPDATE
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    cadista_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.cadistas cd
       WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  -- Post-update row must still satisfy the same access rule; this stops a
  -- cadista from reassigning cadista_id to someone else, and stops any user
  -- from moving a row outside their permitted scope.
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    cadista_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.cadistas cd
       WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()
    )
  )
);

-- =========================================================================
-- 4) doctors: strip blanket cadista access; scope cadista to doctors of
--    cases they are assigned to.
-- =========================================================================
DROP POLICY IF EXISTS doctors_staff_select ON public.doctors;
CREATE POLICY doctors_staff_select
ON public.doctors
FOR SELECT
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.cadistas cd ON cd.id = c.cadista_id
    WHERE c.doctor_id = doctors.id AND cd.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS doctors_staff_update ON public.doctors;
CREATE POLICY doctors_staff_update
ON public.doctors
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()));

DROP POLICY IF EXISTS doctors_staff_insert ON public.doctors;
CREATE POLICY doctors_staff_insert
ON public.doctors
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()));

-- =========================================================================
-- 5) patients: same scoping. Cadista only sees patients tied to their cases.
-- =========================================================================
DROP POLICY IF EXISTS patients_staff_select ON public.patients;
CREATE POLICY patients_staff_select
ON public.patients
FOR SELECT
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.cadistas cd ON cd.id = c.cadista_id
    WHERE c.patient_id = patients.id AND cd.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS patients_staff_update ON public.patients;
CREATE POLICY patients_staff_update
ON public.patients
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()));

DROP POLICY IF EXISTS patients_staff_insert ON public.patients;
CREATE POLICY patients_staff_insert
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()));

-- =========================================================================
-- 6) storage.objects: scope avatar reads to the owner's folder OR members
--    of the same clinic. Removes the blanket "all authenticated" read.
-- =========================================================================
DROP POLICY IF EXISTS avatars_authenticated_read ON storage.objects;
CREATE POLICY avatars_authenticated_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles owner ON owner.id = ((storage.foldername(name))[1])::uuid
      WHERE me.id = auth.uid()
        AND me.clinic_id IS NOT NULL
        AND me.clinic_id = owner.clinic_id
    )
  )
);

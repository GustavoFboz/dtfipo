-- Patient identity and private files are scoped to their owning company.
-- Keep explicit cross-company case participation; staff status alone cannot
-- grant access to another company's patient or bypass old bucket policies.
CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_clinic uuid;
  v_type text;
  v_admin boolean;
BEGIN
  IF v_user IS NULL OR _patient_id IS NULL THEN RETURN false; END IF;
  SELECT p.clinic_id, public.effective_user_type(p.id), COALESCE(p.is_default_admin, false)
    INTO v_clinic, v_type, v_admin FROM public.profiles p WHERE p.id = v_user;
  IF v_clinic IS NULL OR NOT public.company_has_operational_access(v_clinic) THEN RETURN false; END IF;
  IF public.resolve_patient_clinic_id(_patient_id) = v_clinic THEN
    IF v_admin OR v_type IN ('CEO', 'ADMIN', 'PROTETICO') THEN RETURN true; END IF;
    RETURN EXISTS (SELECT 1 FROM public.cases c
      WHERE c.patient_id = _patient_id AND public.can_access_case(c.id));
  END IF;
  -- A requester may follow their own pending request. Assigned specialists
  -- receive another company's patient only after approval, as in the case flow.
  RETURN EXISTS (SELECT 1 FROM public.cases c WHERE c.patient_id = _patient_id AND (
    c.requested_by = v_user
    OR (c.status <> 'pendente' AND (
      (v_type = 'CADISTA' AND EXISTS (SELECT 1 FROM public.cadistas cd
        WHERE cd.id = c.cadista_id AND cd.user_id = v_user))
      OR (v_type IN ('DR', 'DENTISTA') AND EXISTS (SELECT 1 FROM public.doctors d
        WHERE d.id = c.doctor_id AND d.user_id = v_user))
    ))
  ));
END;
$$;
REVOKE ALL ON FUNCTION public.can_access_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_patient(uuid) TO authenticated, service_role;

-- Some live databases retained only the old staff SELECT policy. Keep the
-- authoritative case policy so assigned specialists can read patient identity.
DROP POLICY IF EXISTS patients_select_by_case_membership ON public.patients;
CREATE POLICY patients_select_by_case_membership ON public.patients
  FOR SELECT TO authenticated USING (public.can_access_patient(id));
DROP POLICY IF EXISTS patients_company_read_boundary ON public.patients;
CREATE POLICY patients_company_read_boundary ON public.patients AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.can_access_patient(id));
DROP POLICY IF EXISTS patients_company_update_boundary ON public.patients;
CREATE POLICY patients_company_update_boundary ON public.patients AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.can_access_patient(id))
  WITH CHECK (public.can_access_patient(id));
DROP POLICY IF EXISTS patients_company_delete_boundary ON public.patients;
CREATE POLICY patients_company_delete_boundary ON public.patients AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.can_access_patient(id));
DROP POLICY IF EXISTS patient_attachments_company_boundary ON public.patient_attachments;
CREATE POLICY patient_attachments_company_boundary ON public.patient_attachments AS RESTRICTIVE
  FOR ALL TO authenticated USING (public.can_access_patient(patient_id))
  WITH CHECK (public.can_access_patient(patient_id));

DROP POLICY IF EXISTS patient_storage_read_boundary ON storage.objects;
CREATE POLICY patient_storage_read_boundary ON storage.objects AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    bucket_id NOT IN ('patient-photos', 'patient-files')
    OR public.can_access_patient(public.patient_id_from_storage_path(name))
  );
DROP POLICY IF EXISTS patient_storage_delete_boundary ON storage.objects;
CREATE POLICY patient_storage_delete_boundary ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated USING (
    bucket_id NOT IN ('patient-photos', 'patient-files')
    OR public.can_access_patient(public.patient_id_from_storage_path(name))
  );

-- The company owner and legitimate case participants must not depend on an
-- unrelated legacy user_roles row to read the patient's photo.
DROP POLICY IF EXISTS patient_photos_select ON storage.objects;
CREATE POLICY patient_photos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-photos'
    AND public.can_access_patient(public.patient_id_from_storage_path(name)));
DROP POLICY IF EXISTS patient_photos_insert ON storage.objects;
CREATE POLICY patient_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-photos'
    AND public.can_access_patient(public.patient_id_from_storage_path(name)));
DROP POLICY IF EXISTS patient_photos_delete ON storage.objects;
CREATE POLICY patient_photos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'patient-photos'
    AND public.can_access_patient(public.patient_id_from_storage_path(name)));
-- INSERT still intersects the mandatory reservation; UPDATE remains denied
-- by managed_storage_no_update. No bytes, balances or records are changed.
NOTIFY pgrst, 'reload schema';

-- Scope legacy staff permissions to the case's company. A staff-created case
-- has no requester: use its patient's company before optional assignments.
CREATE OR REPLACE FUNCTION public.resolve_case_clinic_id(_case_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(requester.clinic_id, patient.clinic_id, cad_profile.clinic_id, doctor_profile.clinic_id)
  FROM public.cases c
  LEFT JOIN public.profiles requester ON requester.id = c.requested_by
  LEFT JOIN public.patients patient ON patient.id = c.patient_id
  LEFT JOIN public.cadistas cad ON cad.id = c.cadista_id
  LEFT JOIN public.profiles cad_profile ON cad_profile.id = cad.user_id
  LEFT JOIN public.doctors doc ON doc.id = c.doctor_id
  LEFT JOIN public.profiles doctor_profile ON doctor_profile.id = doc.user_id
  WHERE c.id = _case_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_access_case(_case_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_clinic uuid; v_type text; v_admin boolean;
BEGIN
  IF v_user IS NULL OR _case_id IS NULL THEN RETURN false; END IF;
  SELECT p.clinic_id, upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(p.role), ''), '')),
    COALESCE(p.is_default_admin, false) INTO v_clinic, v_type, v_admin
  FROM public.profiles p WHERE p.id = v_user;
  IF v_clinic IS NULL OR NOT public.company_has_operational_access(v_clinic) THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.cases c WHERE c.id = _case_id AND (
    (public.resolve_case_clinic_id(c.id) = v_clinic AND (v_admin OR v_type IN ('CEO','ADMIN','PROTETICO') OR (v_type NOT IN ('SOLICITANTE','CADISTA','DR','DENTISTA') AND public.is_staff(v_user))))
    OR c.requested_by = v_user
    OR (c.status <> 'pendente' AND (
      (v_type = 'CADISTA' AND EXISTS (SELECT 1 FROM public.cadistas cd WHERE cd.id = c.cadista_id AND cd.user_id = v_user))
      OR (v_type IN ('DR','DENTISTA') AND EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = c.doctor_id AND d.user_id = v_user))
    ))
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.can_modify_case(_case_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text;
BEGIN
  IF NOT public.can_access_case(_case_id) THEN RETURN false; END IF;
  SELECT upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(p.role), ''), '')) INTO v_type
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_type = 'SOLICITANTE' THEN
    RETURN EXISTS (SELECT 1 FROM public.cases c WHERE c.id = _case_id AND c.requested_by = auth.uid() AND c.status = 'pendente');
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_case_clinic_id(uuid), public.can_access_case(uuid), public.can_modify_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_case_clinic_id(uuid), public.can_access_case(uuid), public.can_modify_case(uuid) TO authenticated, service_role;

-- Explicit assigned specialists also need a permissive SELECT on databases
-- that retained only the legacy staff policies.
DROP POLICY IF EXISTS cases_select_by_company_membership ON public.cases;
CREATE POLICY cases_select_by_company_membership ON public.cases FOR SELECT TO authenticated USING (public.can_access_case(id));
-- Intersect permissive legacy policies instead of relying on their removal.
DROP POLICY IF EXISTS cases_company_read_boundary ON public.cases;
CREATE POLICY cases_company_read_boundary ON public.cases AS RESTRICTIVE FOR SELECT TO authenticated USING (public.can_access_case(id));
DROP POLICY IF EXISTS cases_company_update_boundary ON public.cases;
CREATE POLICY cases_company_update_boundary ON public.cases AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_modify_case(id)) WITH CHECK (public.can_modify_case(id));
DROP POLICY IF EXISTS cases_company_delete_boundary ON public.cases;
CREATE POLICY cases_company_delete_boundary ON public.cases AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_modify_case(id));
DROP POLICY IF EXISTS cases_company_insert_boundary ON public.cases;
CREATE POLICY cases_company_insert_boundary ON public.cases AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  public.can_access_patient(patient_id) AND (
    requested_by IS NULL OR requested_by = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles requester JOIN public.profiles actor ON actor.id = auth.uid()
      WHERE requester.id = requested_by AND requester.clinic_id = actor.clinic_id
    )
  )
);
DROP POLICY IF EXISTS case_attachments_company_boundary ON public.case_attachments;
CREATE POLICY case_attachments_company_boundary ON public.case_attachments AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));
DROP POLICY IF EXISTS case_storage_read_boundary ON storage.objects;
CREATE POLICY case_storage_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
  bucket_id <> 'case-files' OR CASE WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.can_access_case(split_part(name, '/', 1)::uuid) ELSE false END
);
DROP POLICY IF EXISTS case_storage_delete_boundary ON storage.objects;
CREATE POLICY case_storage_delete_boundary ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (
  bucket_id <> 'case-files' OR CASE WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.can_modify_case(split_part(name, '/', 1)::uuid) ELSE false END
);

-- WITH CHECK helpers see the existing row. Validate ownership-bearing fields
-- on NEW as well: explicit participants cannot forge their own authorization.
CREATE OR REPLACE FUNCTION public.guard_case_company_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid; v_type text; v_admin boolean; v_owner uuid; v_owner_staff boolean;
BEGIN
  -- Trusted restore/maintenance and service role operations are outside client
  -- RLS. current_setting('role') retains the caller role in SECURITY DEFINER.
  IF COALESCE(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  SELECT p.clinic_id, upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(p.role), ''), '')),
    COALESCE(p.is_default_admin, false) INTO v_clinic, v_type, v_admin
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_clinic IS NULL OR NOT public.company_has_operational_access(v_clinic) THEN
    RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT public.can_access_patient(NEW.patient_id) OR (
      NEW.requested_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.requested_by AND p.clinic_id = v_clinic)
    ) OR (NEW.requested_by IS NULL AND public.resolve_patient_clinic_id(NEW.patient_id) IS DISTINCT FROM v_clinic) THEN
      RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    IF v_type = 'SOLICITANTE' AND (NEW.requested_by IS DISTINCT FROM auth.uid() OR NEW.status IS DISTINCT FROM 'pendente') THEN
      RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_owner := public.resolve_case_clinic_id(OLD.id);
    v_owner_staff := v_owner = v_clinic AND (v_admin OR v_type IN ('CEO','ADMIN','PROTETICO') OR (v_type NOT IN ('SOLICITANTE','CADISTA','DR','DENTISTA') AND public.is_staff(auth.uid())));
    IF NEW.id IS DISTINCT FROM OLD.id OR NOT public.can_modify_case(OLD.id) THEN
      RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    IF NEW.requested_by IS DISTINCT FROM OLD.requested_by OR NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
      IF NOT v_owner_staff OR public.resolve_patient_clinic_id(NEW.patient_id) IS DISTINCT FROM v_owner
        OR (NEW.requested_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.requested_by AND p.clinic_id = v_owner)) THEN
        RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NOT v_owner_staff AND (NEW.cadista_id IS DISTINCT FROM OLD.cadista_id OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id) THEN
      RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    IF NOT v_owner_staff AND OLD.requested_by = auth.uid() AND OLD.status = 'pendente' AND (NEW.status IS NULL OR NEW.status NOT IN ('pendente','cancelado')) THEN
      RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_case_company_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_case_company_write ON public.cases;
CREATE TRIGGER trg_case_company_write BEFORE INSERT OR UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.guard_case_company_write();
NOTIFY pgrst, 'reload schema';

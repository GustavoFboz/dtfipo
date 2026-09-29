-- Stage 06: every managed Storage upload must have a serialized, scoped reservation.
-- Storage API remains responsible for the actual object bytes; SQL only reads its metadata.

REVOKE INSERT, UPDATE, DELETE ON public.storage_files FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS storage_files_admin_delete ON public.storage_files;

-- A patient can be photographed before their first case exists. Persist the
-- owning company at creation, then keep the original case-based fallback for
-- older records that were created before this column existed.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.patients
  ALTER COLUMN clinic_id SET DEFAULT public.storage_current_clinic_id();
UPDATE public.patients p SET clinic_id = public.resolve_patient_clinic_id(p.id)
  WHERE p.clinic_id IS NULL AND public.resolve_patient_clinic_id(p.id) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_patient_clinic_id(_patient_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid;
BEGIN
  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = _patient_id;
  IF v_clinic IS NOT NULL THEN RETURN v_clinic; END IF;
  SELECT public.resolve_case_clinic_id(c.id) INTO v_clinic
    FROM public.cases c WHERE c.patient_id = _patient_id
    ORDER BY c.created_at DESC NULLS LAST, c.id LIMIT 1;
  RETURN v_clinic;
END;
$$;

-- These fields feed the quota decision. Direct client writes could otherwise
-- inflate a limit, claim an IPO exemption, or move their own profile to a
-- different company's allowance. Trusted SECURITY DEFINER onboarding and
-- service-role billing operations still run as their owner.
CREATE OR REPLACE FUNCTION public.guard_saas_storage_clinic_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.storage_limit_bytes <> 1073741824 OR COALESCE(NEW.billing_exempt, false) THEN
        RAISE EXCEPTION 'STORAGE_LIMIT_MANAGED_BY_BILLING';
      END IF;
    ELSIF NEW.storage_limit_bytes IS DISTINCT FROM OLD.storage_limit_bytes
       OR NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt THEN
      RAISE EXCEPTION 'STORAGE_LIMIT_MANAGED_BY_BILLING';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_saas_storage_clinic_fields ON public.clinics;
CREATE TRIGGER trg_guard_saas_storage_clinic_fields
  BEFORE INSERT OR UPDATE OF storage_limit_bytes, billing_exempt ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.guard_saas_storage_clinic_fields();

CREATE OR REPLACE FUNCTION public.guard_saas_storage_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.id IS DISTINCT FROM auth.uid() OR NEW.clinic_id IS NOT NULL
        OR COALESCE(NEW.is_default_admin, false)
        OR COALESCE(NEW.role, 'USER') <> 'USER'
        OR NEW.account_subtype IS NOT NULL THEN
        RAISE EXCEPTION 'PROFILE_COMPANY_MANAGED_BY_BACKEND';
      END IF;
    ELSIF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.account_subtype IS DISTINCT FROM OLD.account_subtype
      OR NEW.is_default_admin IS DISTINCT FROM OLD.is_default_admin
      OR NEW.account_type IS DISTINCT FROM OLD.account_type THEN
      RAISE EXCEPTION 'PROFILE_COMPANY_MANAGED_BY_BACKEND';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_saas_storage_profile_fields ON public.profiles;
CREATE TRIGGER trg_guard_saas_storage_profile_fields
  BEFORE INSERT OR UPDATE OF clinic_id, role, account_subtype, is_default_admin, account_type
  ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_saas_storage_profile_fields();

CREATE OR REPLACE FUNCTION public.guard_saas_patient_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.clinic_id IS DISTINCT FROM public.storage_current_clinic_id()
        OR NEW.clinic_id IS NULL THEN
        RAISE EXCEPTION 'PATIENT_COMPANY_MISMATCH';
      END IF;
    ELSIF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
      RAISE EXCEPTION 'PATIENT_COMPANY_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_saas_patient_company ON public.patients;
CREATE TRIGGER trg_guard_saas_patient_company
  BEFORE INSERT OR UPDATE OF clinic_id ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.guard_saas_patient_company();

CREATE OR REPLACE FUNCTION public.reserve_storage_upload(
  _size_bytes bigint, _bucket text, _object_path text, _source_type text,
  _case_id uuid DEFAULT NULL, _patient_id uuid DEFAULT NULL,
  _original_name text DEFAULT 'arquivo', _mime_type text DEFAULT NULL
)
RETURNS TABLE (file_id uuid, used_bytes bigint, limit_bytes bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := public.storage_current_clinic_id();
  v_limit bigint;
  v_used bigint;
  v_file uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _size_bytes IS NULL OR _size_bytes < 0 OR _object_path IS NULL
     OR split_part(_object_path, '/', 2) = '' THEN
    RAISE EXCEPTION 'INVALID_STORAGE_RESERVATION';
  END IF;
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'STORAGE_CLINIC_NOT_FOUND'; END IF;

  IF NOT COALESCE((CASE
    WHEN _bucket = 'avatars' AND _source_type = 'user_avatar' THEN
      split_part(_object_path, '/', 1) = auth.uid()::text
      AND _case_id IS NULL AND _patient_id IS NULL
    WHEN _bucket = 'patient-photos' AND _source_type = 'patient_photo' THEN
      _patient_id IS NOT NULL AND split_part(_object_path, '/', 1) = _patient_id::text
      AND _case_id IS NULL AND public.can_access_patient(_patient_id)
      AND public.resolve_patient_clinic_id(_patient_id) = v_clinic
    WHEN _bucket = 'patient-files' AND _source_type = 'patient_attachment' THEN
      _patient_id IS NOT NULL AND split_part(_object_path, '/', 1) = _patient_id::text
      AND _case_id IS NULL AND public.can_access_patient(_patient_id)
      AND public.resolve_patient_clinic_id(_patient_id) = v_clinic
    WHEN _bucket = 'case-files' AND _source_type = 'case_attachment' THEN
      _case_id IS NOT NULL AND split_part(_object_path, '/', 1) = _case_id::text
      AND _patient_id IS NULL AND public.can_access_case(_case_id)
      AND EXISTS (
        SELECT 1 FROM public.cases c WHERE c.id = _case_id AND (
          public.resolve_case_clinic_id(c.id) = v_clinic OR c.requested_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.cadistas cd
                     WHERE cd.id = c.cadista_id AND cd.user_id = auth.uid())
        )
      )
    WHEN _bucket = 'dicom-files' AND _source_type = 'dicom_instance' THEN
      _case_id IS NULL AND split_part(_object_path, '/', 1) = v_clinic::text
      AND split_part(_object_path, '/', 4) <> ''
      AND (_patient_id IS NULL OR public.resolve_patient_clinic_id(_patient_id) = v_clinic)
      AND public.user_can_use_company_session(v_clinic, 'radiology')
      AND EXISTS (
        SELECT 1 FROM public.radiology_series se
        JOIN public.radiology_studies st ON st.id = se.study_id
        WHERE st.clinic_id = v_clinic
          AND st.id::text = split_part(_object_path, '/', 2)
          AND se.id::text = split_part(_object_path, '/', 3)
          AND (_patient_id IS NULL OR _patient_id = st.patient_id)
      )
    ELSE false
  END), false) THEN
    RAISE EXCEPTION 'STORAGE_RESERVATION_NOT_ALLOWED';
  END IF;

  -- All reservations for one company serialize on its limit row.
  SELECT c.storage_limit_bytes INTO v_limit
    FROM public.clinics c WHERE c.id = v_clinic FOR UPDATE;
  SELECT COALESCE(sum(sf.size_bytes), 0) INTO v_used
    FROM public.storage_files sf
    WHERE sf.clinic_id = v_clinic AND sf.status IN ('reserved', 'ready');
  IF v_used + _size_bytes > v_limit THEN RAISE EXCEPTION 'STORAGE_QUOTA_EXCEEDED'; END IF;

  -- Never re-reserve an existing object or shrink a ready ledger entry.
  INSERT INTO public.storage_files (
    clinic_id, bucket, object_path, source_type, case_id, patient_id,
    original_name, mime_type, size_bytes, uploaded_by, status
  ) VALUES (
    v_clinic, _bucket, _object_path, _source_type, _case_id, _patient_id,
    COALESCE(NULLIF(_original_name, ''), 'arquivo'), _mime_type,
    _size_bytes, auth.uid(), 'reserved'
  ) RETURNING id INTO v_file;
  RETURN QUERY SELECT v_file, v_used + _size_bytes, v_limit;
END;
$$;

-- Called from Storage's INSERT RLS check. The server-supplied metadata size must
-- match the reservation exactly; a stale or unrelated reservation cannot be used.
CREATE OR REPLACE FUNCTION public.storage_upload_has_reservation(
  _bucket text, _path text, _metadata jsonb
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE(_metadata->>'size', '') ~ '^[0-9]+$'
    AND EXISTS (
      SELECT 1 FROM public.storage_files sf
      WHERE sf.bucket = _bucket AND sf.object_path = _path
        AND sf.uploaded_by = auth.uid()
        AND sf.clinic_id = public.storage_current_clinic_id()
        AND sf.status = 'reserved'
        AND sf.size_bytes = CASE WHEN COALESCE(_metadata->>'size', '') ~ '^[0-9]{1,18}$'
          THEN (_metadata->>'size')::bigint ELSE -1 END
    );
$$;
REVOKE ALL ON FUNCTION public.storage_upload_has_reservation(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_upload_has_reservation(text,text,jsonb) TO authenticated, service_role;

-- RESTRICTIVE policies intersect *all* existing permissive bucket policies.
DROP POLICY IF EXISTS managed_storage_reserved_insert ON storage.objects;
CREATE POLICY managed_storage_reserved_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id NOT IN ('avatars', 'patient-photos', 'patient-files', 'case-files', 'dicom-files')
    OR public.storage_upload_has_reservation(bucket_id, name, metadata)
  );

-- New managed objects use unique paths; prevent overwrites and moves that
-- would change actual bytes without a new, serialized reservation.
DROP POLICY IF EXISTS managed_storage_no_update ON storage.objects;
CREATE POLICY managed_storage_no_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (bucket_id NOT IN ('avatars', 'patient-photos', 'patient-files', 'case-files', 'dicom-files'))
  WITH CHECK (bucket_id NOT IN ('avatars', 'patient-photos', 'patient-files', 'case-files', 'dicom-files'));

-- The old DICOM policies referenced clinics.name inside their subquery by
-- accident. Qualify the Storage object path, including the SELECT needed by
-- the Storage API to return metadata after a successful upload.
DROP POLICY IF EXISTS dicom_objects_read ON storage.objects;
CREATE POLICY dicom_objects_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dicom-files'
    AND public.user_can_use_company_session(
      public.patient_id_from_storage_path(storage.objects.name), 'radiology'));
DROP POLICY IF EXISTS dicom_objects_insert ON storage.objects;
CREATE POLICY dicom_objects_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dicom-files'
    AND public.user_can_use_company_session(
      public.patient_id_from_storage_path(storage.objects.name), 'radiology'));
DROP POLICY IF EXISTS dicom_objects_update ON storage.objects;
DROP POLICY IF EXISTS dicom_objects_delete ON storage.objects;
CREATE POLICY dicom_objects_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dicom-files'
    AND public.user_can_use_company_session(
      public.patient_id_from_storage_path(storage.objects.name), 'radiology'));

CREATE OR REPLACE FUNCTION public.complete_storage_upload(_file_id uuid, _source_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_file public.storage_files%ROWTYPE;
  v_size bigint;
BEGIN
  SELECT * INTO v_file FROM public.storage_files WHERE id = _file_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR
     NOT (v_file.uploaded_by = auth.uid() OR public.can_manage_clinic_storage(v_file.clinic_id)) THEN
    RAISE EXCEPTION 'STORAGE_RESERVATION_NOT_FOUND';
  END IF;
  SELECT CASE WHEN COALESCE(o.metadata->>'size', '') ~ '^[0-9]{1,18}$'
              THEN (o.metadata->>'size')::bigint ELSE NULL END INTO v_size
    FROM storage.objects o WHERE o.bucket_id = v_file.bucket AND o.name = v_file.object_path;
  IF v_size IS NULL OR v_size <> v_file.size_bytes THEN
    RAISE EXCEPTION 'STORAGE_OBJECT_SIZE_MISMATCH';
  END IF;
  IF NOT COALESCE((CASE v_file.source_type
    WHEN 'user_avatar' THEN _source_id = auth.uid()::text
    WHEN 'patient_photo' THEN _source_id = v_file.patient_id::text
    WHEN 'case_attachment' THEN EXISTS (
      SELECT 1 FROM public.case_attachments a WHERE a.id::text = _source_id
        AND a.storage_path = v_file.object_path AND a.case_id = v_file.case_id)
    WHEN 'patient_attachment' THEN EXISTS (
      SELECT 1 FROM public.patient_attachments a WHERE a.id::text = _source_id
        AND a.file_path = v_file.object_path AND a.patient_id = v_file.patient_id)
    WHEN 'dicom_instance' THEN EXISTS (
      SELECT 1 FROM public.radiology_instances i
      JOIN public.radiology_series se ON se.id = i.series_id
      JOIN public.radiology_studies st ON st.id = se.study_id
      WHERE i.id::text = _source_id AND i.storage_path = v_file.object_path
        AND st.clinic_id = v_file.clinic_id AND i.byte_size = v_size)
    ELSE false
  END), false) THEN RAISE EXCEPTION 'STORAGE_SOURCE_MISMATCH'; END IF;

  UPDATE public.storage_files SET status = 'ready', source_id = _source_id,
    updated_at = now() WHERE id = _file_id;
END;
$$;

-- Can also clear a ready entry after its object was removed by the Storage API.
-- A client can never free its quota while its object still exists.
CREATE OR REPLACE FUNCTION public.cancel_storage_upload(_file_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_file public.storage_files%ROWTYPE;
BEGIN
  SELECT * INTO v_file FROM public.storage_files WHERE id = _file_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT (
    v_file.uploaded_by = auth.uid() OR public.can_manage_clinic_storage(v_file.clinic_id)
  ) THEN RAISE EXCEPTION 'STORAGE_RESERVATION_NOT_ALLOWED'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects o
             WHERE o.bucket_id = v_file.bucket AND o.name = v_file.object_path) THEN
    RAISE EXCEPTION 'STORAGE_OBJECT_STILL_EXISTS';
  END IF;
  DELETE FROM public.storage_files WHERE id = _file_id;
END;
$$;

-- Source records can disappear during cascades; their bytes keep counting until
-- the actual object is removed through the Storage API.
CREATE OR REPLACE FUNCTION public.sync_case_attachment_storage_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_files sf
      WHERE sf.bucket = 'case-files' AND sf.object_path = OLD.storage_path
        AND NOT EXISTS (SELECT 1 FROM storage.objects o
                        WHERE o.bucket_id = sf.bucket AND o.name = sf.object_path);
    RETURN OLD;
  END IF;
  UPDATE public.storage_files sf SET source_id = NEW.id::text,
    status = 'ready', updated_at = now()
    WHERE sf.bucket = 'case-files' AND sf.object_path = NEW.storage_path
      AND sf.case_id = NEW.case_id AND sf.uploaded_by = auth.uid()
      AND EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = sf.bucket AND o.name = sf.object_path
          AND COALESCE(o.metadata->>'size', '') ~ '^[0-9]{1,18}$'
          AND (o.metadata->>'size')::bigint = sf.size_bytes);
  IF NOT FOUND THEN RAISE EXCEPTION 'STORAGE_RESERVATION_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_patient_attachment_storage_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_files sf
      WHERE sf.bucket = 'patient-files' AND sf.object_path = OLD.file_path
        AND NOT EXISTS (SELECT 1 FROM storage.objects o
                        WHERE o.bucket_id = sf.bucket AND o.name = sf.object_path);
    RETURN OLD;
  END IF;
  UPDATE public.storage_files sf SET source_id = NEW.id::text,
    status = 'ready', updated_at = now()
    WHERE sf.bucket = 'patient-files' AND sf.object_path = NEW.file_path
      AND sf.patient_id = NEW.patient_id AND sf.uploaded_by = auth.uid()
      AND EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = sf.bucket AND o.name = sf.object_path
          AND COALESCE(o.metadata->>'size', '') ~ '^[0-9]{1,18}$'
          AND (o.metadata->>'size')::bigint = sf.size_bytes);
  IF NOT FOUND THEN RAISE EXCEPTION 'STORAGE_RESERVATION_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_managed_storage_file(_file_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_file public.storage_files%ROWTYPE;
BEGIN
  SELECT * INTO v_file FROM public.storage_files WHERE id = _file_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.can_manage_clinic_storage(v_file.clinic_id) THEN
    RAISE EXCEPTION 'STORAGE_MANAGEMENT_NOT_ALLOWED';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects o
             WHERE o.bucket_id = v_file.bucket AND o.name = v_file.object_path) THEN
    RAISE EXCEPTION 'STORAGE_OBJECT_STILL_EXISTS';
  END IF;
  IF v_file.source_type = 'case_attachment' AND v_file.source_id IS NOT NULL THEN
    DELETE FROM public.case_attachments WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'patient_attachment' AND v_file.source_id IS NOT NULL THEN
    DELETE FROM public.patient_attachments WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'patient_photo' AND v_file.source_id IS NOT NULL THEN
    UPDATE public.patients SET photo_url = NULL WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'user_avatar' AND v_file.source_id IS NOT NULL THEN
    UPDATE public.profiles SET avatar_url = NULL WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'dicom_instance' AND v_file.source_id IS NOT NULL THEN
    DELETE FROM public.radiology_instances WHERE id::text = v_file.source_id;
  END IF;
  DELETE FROM public.storage_files WHERE id = _file_id;
  RETURN jsonb_build_object('id', v_file.id, 'bucket', v_file.bucket,
    'object_path', v_file.object_path, 'size_bytes', v_file.size_bytes,
    'source_type', v_file.source_type, 'source_id', v_file.source_id);
END;
$$;

-- Reconcile attributable historical objects without deleting unknown ones or
-- reducing old ledger entries. Unattributable objects need separate review.
INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, case_id,
  original_name, mime_type, size_bytes, status, created_at
)
SELECT public.resolve_case_clinic_id(c.id), o.bucket_id, o.name,
  'legacy_case_object', c.id, split_part(o.name, '/', 2),
  o.metadata->>'mimetype', (o.metadata->>'size')::bigint,
  'ready', COALESCE(o.created_at, now())
FROM storage.objects o JOIN public.cases c ON c.id::text = split_part(o.name, '/', 1)
WHERE o.bucket_id = 'case-files' AND o.metadata->>'size' ~ '^[0-9]{1,18}$'
  AND public.resolve_case_clinic_id(c.id) IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id,
  original_name, mime_type, size_bytes, status, created_at
)
SELECT st.clinic_id, o.bucket_id, o.name, 'legacy_dicom_object', i.id::text,
  split_part(o.name, '/', 4), o.metadata->>'mimetype',
  (o.metadata->>'size')::bigint, 'ready', COALESCE(o.created_at, now())
FROM storage.objects o JOIN public.radiology_instances i ON i.storage_path = o.name
JOIN public.radiology_series se ON se.id = i.series_id
JOIN public.radiology_studies st ON st.id = se.study_id
WHERE o.bucket_id = 'dicom-files' AND o.metadata->>'size' ~ '^[0-9]{1,18}$'
ON CONFLICT (bucket, object_path) DO NOTHING;

NOTIFY pgrst, 'reload schema';

REVOKE ALL ON FUNCTION public.reserve_storage_upload(bigint,text,text,text,uuid,uuid,text,text),
  public.complete_storage_upload(uuid,text), public.cancel_storage_upload(uuid),
  public.delete_managed_storage_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_storage_upload(bigint,text,text,text,uuid,uuid,text,text),
  public.complete_storage_upload(uuid,text), public.cancel_storage_upload(uuid),
  public.delete_managed_storage_file(uuid) TO authenticated, service_role;

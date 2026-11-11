-- Stage 06: manual recovery of abandoned reservations, without deleting files.
-- Only INSERT takes a reservation lock; the existing STABLE read helper stays
-- available for signed URLs and read-only requests.
CREATE OR REPLACE FUNCTION public.storage_upload_has_reservation_for_insert(
  _bucket text, _path text, _metadata jsonb
)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_file uuid;
  v_size bigint;
  v_metadata_size text := COALESCE(_metadata->>'size', '');
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  -- Storage may omit size during INSERT. Finalization still verifies the actual
  -- persisted size, preserving the 29/09 hotfix and old clients' upload flow.
  IF v_metadata_size <> '' THEN
    IF v_metadata_size !~ '^[0-9]{1,18}$' THEN RETURN false; END IF;
    v_size := v_metadata_size::bigint;
  END IF;
  SELECT sf.id INTO v_file FROM public.storage_files sf
    WHERE sf.bucket = _bucket AND sf.object_path = _path
      AND sf.uploaded_by = auth.uid()
      AND sf.clinic_id = public.storage_current_clinic_id()
      AND sf.status = 'reserved' AND (v_size IS NULL OR sf.size_bytes = v_size)
    FOR SHARE;
  -- Held until the Storage transaction ends. Recovery uses FOR UPDATE on the
  -- same row, so it cannot remove quota between authorization and object INSERT.
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_upload_has_reservation_for_insert(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_upload_has_reservation_for_insert(text,text,jsonb) TO authenticated, service_role;

DROP POLICY IF EXISTS managed_storage_reserved_insert ON storage.objects;
CREATE POLICY managed_storage_reserved_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id NOT IN ('avatars', 'patient-photos', 'patient-files', 'case-files', 'dicom-files')
    OR public.storage_upload_has_reservation_for_insert(bucket_id, name, metadata)
  );

CREATE OR REPLACE FUNCTION public.release_storage_upload_reservation(_file_id uuid, _clinic_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_file public.storage_files%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF _clinic_id IS NULL OR NOT public.can_manage_clinic_storage(_clinic_id) THEN
    RAISE EXCEPTION 'STORAGE_MANAGEMENT_NOT_ALLOWED';
  END IF;
  SELECT * INTO v_file FROM public.storage_files
    WHERE id = _file_id AND clinic_id = _clinic_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('id', _file_id, 'released', false, 'released_bytes', 0);
  END IF;
  IF v_file.status <> 'reserved' THEN RAISE EXCEPTION 'STORAGE_RESERVATION_NOT_PENDING'; END IF;
  -- Age makes a reservation reviewable; it is never an automatic expiry.
  IF v_file.created_at > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'STORAGE_RESERVATION_TOO_RECENT';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects o
             WHERE o.bucket_id = v_file.bucket AND o.name = v_file.object_path) THEN
    RAISE EXCEPTION 'STORAGE_OBJECT_STILL_EXISTS';
  END IF;
  IF v_file.source_id IS NOT NULL
    OR (v_file.bucket = 'case-files' AND EXISTS (
      SELECT 1 FROM public.case_attachments a WHERE a.storage_path = v_file.object_path))
    OR (v_file.bucket = 'patient-files' AND EXISTS (
      SELECT 1 FROM public.patient_attachments a WHERE a.file_path = v_file.object_path))
    OR (v_file.bucket = 'dicom-files' AND EXISTS (
      SELECT 1 FROM public.radiology_instances i WHERE i.storage_path = v_file.object_path))
    OR (v_file.bucket = 'avatars' AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE position(v_file.object_path in p.avatar_url) > 0))
    OR (v_file.bucket = 'patient-photos' AND EXISTS (
      SELECT 1 FROM public.patients p WHERE position(v_file.object_path in p.photo_url) > 0)) THEN
    RAISE EXCEPTION 'STORAGE_RESERVATION_HAS_SOURCE';
  END IF;
  DELETE FROM public.storage_files WHERE id = v_file.id AND clinic_id = _clinic_id;
  RETURN jsonb_build_object('id', v_file.id, 'released', true, 'released_bytes', v_file.size_bytes);
END;
$$;
REVOKE ALL ON FUNCTION public.release_storage_upload_reservation(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_storage_upload_reservation(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

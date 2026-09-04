-- Unified per-clinic storage management.
-- Each clinic starts with 1 GiB. Quota reservations are atomic so concurrent
-- uploads cannot oversubscribe the account.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS storage_limit_bytes bigint NOT NULL DEFAULT 1073741824;

ALTER TABLE public.patient_attachments
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- File retention is now controlled by clinic storage management, not a timer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'case_attachments' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.case_attachments ALTER COLUMN expires_at DROP NOT NULL;
    ALTER TABLE public.case_attachments ALTER COLUMN expires_at DROP DEFAULT;
    UPDATE public.case_attachments SET expires_at = NULL WHERE expired_at IS NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.storage_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  object_path text NOT NULL,
  source_type text NOT NULL DEFAULT 'other',
  source_id text,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('reserved', 'ready')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, object_path)
);

CREATE INDEX IF NOT EXISTS storage_files_clinic_created_idx
  ON public.storage_files (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS storage_files_clinic_status_idx
  ON public.storage_files (clinic_id, status);
CREATE INDEX IF NOT EXISTS storage_files_case_idx
  ON public.storage_files (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS storage_files_patient_idx
  ON public.storage_files (patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS storage_files_source_idx
  ON public.storage_files (source_type, source_id) WHERE source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.storage_current_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_clinic_storage(_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.clinic_id = _clinic_id
       AND (
         COALESCE(p.is_default_admin, false)
         OR upper(COALESCE(NULLIF(p.account_subtype, ''), p.role::text, '')) IN ('CEO', 'ADMIN')
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_case_clinic_id(_case_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(requester.clinic_id, cad_profile.clinic_id, doctor_profile.clinic_id)
    FROM public.cases c
    LEFT JOIN public.profiles requester ON requester.id = c.requested_by
    LEFT JOIN public.cadistas cad ON cad.id = c.cadista_id
    LEFT JOIN public.profiles cad_profile ON cad_profile.id = cad.user_id
    LEFT JOIN public.doctors doc ON doc.id = c.doctor_id
    LEFT JOIN public.profiles doctor_profile ON doctor_profile.id = doc.user_id
   WHERE c.id = _case_id
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_patient_clinic_id(_patient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_case_id uuid;
BEGIN
  SELECT c.id INTO v_case_id
    FROM public.cases c
   WHERE c.patient_id = _patient_id
   ORDER BY c.created_at DESC NULLS LAST, c.id
   LIMIT 1;
  IF v_case_id IS NOT NULL THEN
    v_clinic := public.resolve_case_clinic_id(v_case_id);
  END IF;
  RETURN v_clinic;
END;
$$;

ALTER TABLE public.storage_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_files_admin_select ON public.storage_files;
CREATE POLICY storage_files_admin_select
  ON public.storage_files FOR SELECT TO authenticated
  USING (public.can_manage_clinic_storage(clinic_id));

DROP POLICY IF EXISTS storage_files_admin_delete ON public.storage_files;
CREATE POLICY storage_files_admin_delete
  ON public.storage_files FOR DELETE TO authenticated
  USING (public.can_manage_clinic_storage(clinic_id));

-- Inserts/updates are intentionally only performed by the SECURITY DEFINER RPCs
-- and catalog triggers below. This prevents clients from forging their usage.

CREATE OR REPLACE FUNCTION public.get_storage_usage()
RETURNS TABLE (
  clinic_id uuid,
  clinic_name text,
  used_bytes bigint,
  limit_bytes bigint,
  available_bytes bigint,
  usage_ratio double precision,
  file_count bigint,
  almost_full boolean,
  full boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_name text;
  v_limit bigint;
  v_used bigint;
  v_count bigint;
BEGIN
  v_clinic := public.storage_current_clinic_id();
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'STORAGE_CLINIC_NOT_FOUND';
  END IF;

  SELECT c.name, c.storage_limit_bytes
    INTO v_name, v_limit
    FROM public.clinics c
   WHERE c.id = v_clinic;

  SELECT COALESCE(sum(sf.size_bytes), 0), count(*)
    INTO v_used, v_count
    FROM public.storage_files sf
   WHERE sf.clinic_id = v_clinic
     AND sf.status IN ('reserved', 'ready');

  RETURN QUERY SELECT
    v_clinic,
    v_name,
    v_used,
    v_limit,
    GREATEST(v_limit - v_used, 0::bigint),
    CASE WHEN v_limit > 0 THEN v_used::double precision / v_limit::double precision ELSE 1::double precision END,
    v_count,
    CASE WHEN v_limit > 0 THEN v_used::double precision / v_limit::double precision >= 0.85 ELSE true END,
    v_used >= v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_storage_upload(
  _size_bytes bigint,
  _bucket text,
  _object_path text,
  _source_type text,
  _case_id uuid DEFAULT NULL,
  _patient_id uuid DEFAULT NULL,
  _original_name text DEFAULT 'arquivo',
  _mime_type text DEFAULT NULL
)
RETURNS TABLE (file_id uuid, used_bytes bigint, limit_bytes bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_limit bigint;
  v_used bigint;
  v_file uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF COALESCE(_size_bytes, 0) < 0 THEN RAISE EXCEPTION 'INVALID_FILE_SIZE'; END IF;

  v_clinic := public.storage_current_clinic_id();
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'STORAGE_CLINIC_NOT_FOUND'; END IF;

  -- Lock the clinic row: all reservations for a clinic serialize here.
  SELECT c.storage_limit_bytes INTO v_limit
    FROM public.clinics c
   WHERE c.id = v_clinic
   FOR UPDATE;

  SELECT COALESCE(sum(sf.size_bytes), 0) INTO v_used
    FROM public.storage_files sf
   WHERE sf.clinic_id = v_clinic
     AND sf.status IN ('reserved', 'ready');

  IF v_used + COALESCE(_size_bytes, 0) > v_limit THEN
    RAISE EXCEPTION 'STORAGE_QUOTA_EXCEEDED';
  END IF;

  INSERT INTO public.storage_files (
    clinic_id, bucket, object_path, source_type, case_id, patient_id,
    original_name, mime_type, size_bytes, uploaded_by, status
  ) VALUES (
    v_clinic, _bucket, _object_path, COALESCE(NULLIF(_source_type, ''), 'other'), _case_id, _patient_id,
    COALESCE(NULLIF(_original_name, ''), 'arquivo'), _mime_type, COALESCE(_size_bytes, 0), auth.uid(), 'reserved'
  )
  ON CONFLICT (bucket, object_path) DO UPDATE SET
    size_bytes = EXCLUDED.size_bytes,
    original_name = EXCLUDED.original_name,
    mime_type = EXCLUDED.mime_type,
    uploaded_by = EXCLUDED.uploaded_by,
    status = 'reserved',
    updated_at = now()
  RETURNING id INTO v_file;

  RETURN QUERY SELECT v_file, v_used + COALESCE(_size_bytes, 0), v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_storage_upload(_file_id uuid, _source_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.storage_files sf
     SET status = 'ready',
         source_id = COALESCE(_source_id, sf.source_id),
         updated_at = now()
   WHERE sf.id = _file_id
     AND (sf.uploaded_by = auth.uid() OR public.can_manage_clinic_storage(sf.clinic_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_storage_upload(_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.storage_files sf
   WHERE sf.id = _file_id
     AND sf.status = 'reserved'
     AND (sf.uploaded_by = auth.uid() OR public.can_manage_clinic_storage(sf.clinic_id));
END;
$$;

-- Keep the catalog synchronized even when an older client inserts/deletes an
-- attachment without calling the new quota client first.
CREATE OR REPLACE FUNCTION public.sync_case_attachment_storage_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_files
     WHERE source_type = 'case_attachment' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;

  SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = NEW.uploaded_by;
  v_clinic := COALESCE(v_clinic, public.resolve_case_clinic_id(NEW.case_id));
  IF v_clinic IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.storage_files (
    clinic_id, bucket, object_path, source_type, source_id, case_id,
    original_name, mime_type, size_bytes, uploaded_by, status, created_at
  ) VALUES (
    v_clinic, 'case-files', NEW.storage_path, 'case_attachment', NEW.id::text, NEW.case_id,
    NEW.file_name, NEW.mime_type, COALESCE(NEW.size_bytes, 0), NEW.uploaded_by, 'ready', COALESCE(NEW.uploaded_at, now())
  )
  ON CONFLICT (bucket, object_path) DO UPDATE SET
    clinic_id = EXCLUDED.clinic_id,
    source_type = 'case_attachment',
    source_id = EXCLUDED.source_id,
    case_id = EXCLUDED.case_id,
    original_name = EXCLUDED.original_name,
    mime_type = EXCLUDED.mime_type,
    size_bytes = EXCLUDED.size_bytes,
    uploaded_by = EXCLUDED.uploaded_by,
    status = 'ready',
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_attachment_storage_catalog ON public.case_attachments;
CREATE TRIGGER trg_case_attachment_storage_catalog
AFTER INSERT OR DELETE ON public.case_attachments
FOR EACH ROW EXECUTE FUNCTION public.sync_case_attachment_storage_catalog();

CREATE OR REPLACE FUNCTION public.sync_patient_attachment_storage_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_files
     WHERE source_type = 'patient_attachment' AND source_id = OLD.id::text;
    RETURN OLD;
  END IF;

  v_clinic := NEW.clinic_id;
  IF v_clinic IS NULL AND NEW.uploaded_by IS NOT NULL THEN
    SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = NEW.uploaded_by;
  END IF;
  v_clinic := COALESCE(v_clinic, public.resolve_patient_clinic_id(NEW.patient_id));
  IF v_clinic IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.storage_files (
    clinic_id, bucket, object_path, source_type, source_id, patient_id,
    original_name, mime_type, size_bytes, uploaded_by, status, created_at
  ) VALUES (
    v_clinic, 'patient-files', NEW.file_path, 'patient_attachment', NEW.id::text, NEW.patient_id,
    COALESCE(NULLIF(NEW.title, ''), split_part(NEW.file_path, '/', 2), 'arquivo'), NEW.mime_type,
    COALESCE(NEW.size_bytes, 0), NEW.uploaded_by, 'ready', COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (bucket, object_path) DO UPDATE SET
    clinic_id = EXCLUDED.clinic_id,
    source_type = 'patient_attachment',
    source_id = EXCLUDED.source_id,
    patient_id = EXCLUDED.patient_id,
    original_name = EXCLUDED.original_name,
    mime_type = EXCLUDED.mime_type,
    size_bytes = EXCLUDED.size_bytes,
    uploaded_by = EXCLUDED.uploaded_by,
    status = 'ready',
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_attachment_storage_catalog ON public.patient_attachments;
CREATE TRIGGER trg_patient_attachment_storage_catalog
AFTER INSERT OR DELETE ON public.patient_attachments
FOR EACH ROW EXECUTE FUNCTION public.sync_patient_attachment_storage_catalog();

-- Reliable case-dialog deletion path. It fixes environments where legacy RLS
-- allowed viewing/uploading an attachment but inadvertently rejected DELETE.
CREATE OR REPLACE FUNCTION public.delete_case_attachment_managed(_attachment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att public.case_attachments%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_clinic uuid;
  v_effective text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_att FROM public.case_attachments WHERE id = _attachment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  v_clinic := COALESCE(
    (SELECT p.clinic_id FROM public.profiles p WHERE p.id = v_att.uploaded_by),
    public.resolve_case_clinic_id(v_att.case_id)
  );
  v_effective := upper(COALESCE(NULLIF(v_profile.account_subtype, ''), v_profile.role::text, ''));

  IF NOT (
    v_att.uploaded_by = auth.uid()
    OR (
      v_profile.clinic_id IS NOT DISTINCT FROM v_clinic
      AND (COALESCE(v_profile.is_default_admin, false) OR v_effective IN ('CEO','ADMIN','PROTETICO','ATENDIMENTO','DR','DENTISTA','CADISTA'))
    )
  ) THEN
    RAISE EXCEPTION 'ATTACHMENT_DELETE_NOT_ALLOWED';
  END IF;

  DELETE FROM public.case_attachments WHERE id = v_att.id;
  RETURN jsonb_build_object(
    'id', v_att.id,
    'bucket', 'case-files',
    'object_path', v_att.storage_path,
    'size_bytes', COALESCE(v_att.size_bytes, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_managed_storage_file(_file_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_file public.storage_files%ROWTYPE;
BEGIN
  SELECT * INTO v_file FROM public.storage_files WHERE id = _file_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.can_manage_clinic_storage(v_file.clinic_id) THEN
    RAISE EXCEPTION 'STORAGE_MANAGEMENT_NOT_ALLOWED';
  END IF;

  IF v_file.source_type = 'case_attachment' AND v_file.source_id IS NOT NULL THEN
    DELETE FROM public.case_attachments WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'patient_attachment' AND v_file.source_id IS NOT NULL THEN
    DELETE FROM public.patient_attachments WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'patient_photo' AND v_file.source_id IS NOT NULL THEN
    UPDATE public.patients SET photo_url = NULL WHERE id::text = v_file.source_id;
  ELSIF v_file.source_type = 'user_avatar' AND v_file.source_id IS NOT NULL THEN
    UPDATE public.profiles SET avatar_url = NULL WHERE id::text = v_file.source_id;
  END IF;

  DELETE FROM public.storage_files WHERE id = _file_id;
  RETURN jsonb_build_object(
    'id', v_file.id,
    'bucket', v_file.bucket,
    'object_path', v_file.object_path,
    'size_bytes', v_file.size_bytes,
    'source_type', v_file.source_type,
    'source_id', v_file.source_id
  );
END;
$$;

-- Backfill existing active case attachments.
INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id, case_id,
  original_name, mime_type, size_bytes, uploaded_by, status, created_at
)
SELECT
  COALESCE(up.clinic_id, public.resolve_case_clinic_id(ca.case_id)),
  'case-files', ca.storage_path, 'case_attachment', ca.id::text, ca.case_id,
  ca.file_name, ca.mime_type, COALESCE(ca.size_bytes, 0), ca.uploaded_by, 'ready', COALESCE(ca.uploaded_at, now())
FROM public.case_attachments ca
LEFT JOIN public.profiles up ON up.id = ca.uploaded_by
WHERE ca.storage_path IS NOT NULL
  AND ca.expired_at IS NULL
  AND COALESCE(up.clinic_id, public.resolve_case_clinic_id(ca.case_id)) IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

-- Backfill patient attachments and persist the inferred clinic for future use.
UPDATE public.patient_attachments pa
   SET clinic_id = public.resolve_patient_clinic_id(pa.patient_id)
 WHERE pa.clinic_id IS NULL;

INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id, patient_id,
  original_name, mime_type, size_bytes, uploaded_by, status, created_at
)
SELECT
  pa.clinic_id, 'patient-files', pa.file_path, 'patient_attachment', pa.id::text, pa.patient_id,
  COALESCE(NULLIF(pa.title, ''), split_part(pa.file_path, '/', 2), 'arquivo'), pa.mime_type,
  COALESCE(pa.size_bytes, 0), pa.uploaded_by, 'ready', COALESCE(pa.created_at, now())
FROM public.patient_attachments pa
WHERE pa.clinic_id IS NOT NULL AND pa.file_path IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

-- Include existing avatars from Storage using the user id encoded in the path.
INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id,
  original_name, mime_type, size_bytes, uploaded_by, status, created_at
)
SELECT
  p.clinic_id, o.bucket_id, o.name, 'user_avatar', p.id::text,
  COALESCE(NULLIF(split_part(o.name, '/', 2), ''), 'avatar'),
  o.metadata->>'mimetype',
  CASE WHEN COALESCE(o.metadata->>'size', '') ~ '^\d+$' THEN (o.metadata->>'size')::bigint ELSE 0 END,
  p.id, 'ready', COALESCE(o.created_at, now())
FROM storage.objects o
JOIN public.profiles p ON p.id::text = split_part(o.name, '/', 1)
WHERE o.bucket_id = 'avatars' AND p.clinic_id IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

-- Include existing patient photos where the patient can be resolved to a clinic.
INSERT INTO public.storage_files (
  clinic_id, bucket, object_path, source_type, source_id, patient_id,
  original_name, mime_type, size_bytes, status, created_at
)
SELECT
  public.resolve_patient_clinic_id(p.id), o.bucket_id, o.name, 'patient_photo', p.id::text, p.id,
  COALESCE(NULLIF(split_part(o.name, '/', 2), ''), 'foto do paciente'),
  o.metadata->>'mimetype',
  CASE WHEN COALESCE(o.metadata->>'size', '') ~ '^\d+$' THEN (o.metadata->>'size')::bigint ELSE 0 END,
  'ready', COALESCE(o.created_at, now())
FROM storage.objects o
JOIN public.patients p ON p.id::text = split_part(o.name, '/', 1)
WHERE o.bucket_id = 'patient-photos'
  AND public.resolve_patient_clinic_id(p.id) IS NOT NULL
ON CONFLICT (bucket, object_path) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.get_storage_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_storage_upload(bigint,text,text,text,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_storage_upload(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_storage_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_case_attachment_managed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_managed_storage_file(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

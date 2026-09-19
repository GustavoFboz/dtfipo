-- Lovable Cloud compatibility prerequisite for unified storage.
--
-- The frontend already has patient attachment upload/list/delete support, but
-- some Lovable Cloud databases were created without the patient_attachments
-- table/bucket. The unified storage migration depends on both, so create them
-- idempotently before 20260904224500_clinic_storage_management.sql.

CREATE TABLE IF NOT EXISTS public.patient_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'other',
  file_url text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  thumbnail_url text,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_path)
);

-- Bring partially-created versions of the table up to the shape used by the app.
ALTER TABLE public.patient_attachments
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS file_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS patient_attachments_patient_created_idx
  ON public.patient_attachments(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_attachments_clinic_idx
  ON public.patient_attachments(clinic_id) WHERE clinic_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_attachments TO authenticated;
GRANT ALL ON public.patient_attachments TO service_role;
ALTER TABLE public.patient_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_attachments_select_by_patient_access ON public.patient_attachments;
CREATE POLICY patient_attachments_select_by_patient_access
  ON public.patient_attachments
  FOR SELECT TO authenticated
  USING (public.can_access_patient(patient_id));

DROP POLICY IF EXISTS patient_attachments_insert_by_patient_access ON public.patient_attachments;
CREATE POLICY patient_attachments_insert_by_patient_access
  ON public.patient_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_patient(patient_id));

DROP POLICY IF EXISTS patient_attachments_update_by_patient_access ON public.patient_attachments;
CREATE POLICY patient_attachments_update_by_patient_access
  ON public.patient_attachments
  FOR UPDATE TO authenticated
  USING (public.can_access_patient(patient_id))
  WITH CHECK (public.can_access_patient(patient_id));

DROP POLICY IF EXISTS patient_attachments_delete_by_patient_access ON public.patient_attachments;
CREATE POLICY patient_attachments_delete_by_patient_access
  ON public.patient_attachments
  FOR DELETE TO authenticated
  USING (public.can_access_patient(patient_id));

-- Private bucket used by src/lib/api.ts for patient clinical files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-files', 'patient-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Safely resolve the patient UUID encoded as the first folder in
-- patient-files/<patient-id>/<filename>.
CREATE OR REPLACE FUNCTION public.patient_id_from_storage_path(_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_part text;
BEGIN
  v_part := split_part(COALESCE(_name, ''), '/', 1);
  IF v_part = '' THEN RETURN NULL; END IF;
  BEGIN
    RETURN v_part::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.patient_id_from_storage_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_id_from_storage_path(text) TO authenticated, service_role;

DROP POLICY IF EXISTS patient_files_select ON storage.objects;
CREATE POLICY patient_files_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND public.can_access_patient(public.patient_id_from_storage_path(name))
  );

DROP POLICY IF EXISTS patient_files_insert ON storage.objects;
CREATE POLICY patient_files_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-files'
    AND public.can_access_patient(public.patient_id_from_storage_path(name))
  );

DROP POLICY IF EXISTS patient_files_delete ON storage.objects;
CREATE POLICY patient_files_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'patient-files'
    AND public.can_access_patient(public.patient_id_from_storage_path(name))
  );

NOTIFY pgrst, 'reload schema';

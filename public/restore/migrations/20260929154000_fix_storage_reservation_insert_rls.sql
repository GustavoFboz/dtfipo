-- Stage 06 hotfix: valid reserved uploads must not depend on Storage INSERT metadata size.
-- Exact byte-size verification remains mandatory in complete_storage_upload()
-- after Storage persists authoritative object metadata.
CREATE OR REPLACE FUNCTION public.storage_upload_has_reservation(
  _bucket text, _path text, _metadata jsonb
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.storage_files sf
      WHERE sf.bucket = _bucket AND sf.object_path = _path
        AND sf.uploaded_by = auth.uid()
        AND sf.clinic_id = public.storage_current_clinic_id()
        AND sf.status = 'reserved'
        AND (
          COALESCE(_metadata->>'size', '') = ''
          OR (COALESCE(_metadata->>'size', '') ~ '^[0-9]{1,18}$'
              AND sf.size_bytes = (_metadata->>'size')::bigint)
        )
    );
$$;
REVOKE ALL ON FUNCTION public.storage_upload_has_reservation(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_upload_has_reservation(text,text,jsonb) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';

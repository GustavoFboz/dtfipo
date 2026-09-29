-- Fix published upload false-negative caused by active-company session races.
-- The reservation RPC is already the authority that resolves and validates the
-- company/case/patient before inserting storage_files. The Storage INSERT check
-- only needs to prove that the authenticated uploader owns an exact reservation
-- for the same bucket, path and byte size. Re-resolving the active company here
-- made a valid reservation fail transiently with RLS while the company session
-- was still being hydrated in the browser.

CREATE OR REPLACE FUNCTION public.storage_upload_has_reservation(
  _bucket text, _path text, _metadata jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE(_metadata->>'size', '') ~ '^[0-9]+$'
    AND EXISTS (
      SELECT 1
      FROM public.storage_files sf
      WHERE sf.bucket = _bucket
        AND sf.object_path = _path
        AND sf.uploaded_by = auth.uid()
        AND sf.status = 'reserved'
        AND sf.size_bytes = CASE
          WHEN COALESCE(_metadata->>'size', '') ~ '^[0-9]{1,18}$'
            THEN (_metadata->>'size')::bigint
          ELSE -1
        END
    );
$$;

REVOKE ALL ON FUNCTION public.storage_upload_has_reservation(text,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_upload_has_reservation(text,text,jsonb)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

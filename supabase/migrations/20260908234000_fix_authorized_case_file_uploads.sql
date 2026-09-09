-- Critical upload fix: case participants who are allowed to access a case must
-- also be able to write its objects. The old bucket policy used is_staff(),
-- which intentionally does not classify CADISTA as generic staff, causing the
-- optimistic UI to show a file briefly and then lose it when Storage rejected
-- the object with RLS.

DROP POLICY IF EXISTS case_files_insert ON storage.objects;
CREATE POLICY case_files_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-files'
  AND public.can_access_case(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS case_files_update ON storage.objects;
CREATE POLICY case_files_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-files'
  AND public.can_access_case(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'case-files'
  AND public.can_access_case(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS case_files_delete ON storage.objects;
CREATE POLICY case_files_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-files'
  AND public.can_access_case(((storage.foldername(name))[1])::uuid)
);

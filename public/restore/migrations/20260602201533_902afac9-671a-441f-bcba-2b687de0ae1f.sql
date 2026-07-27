
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_case_stock(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_case_stock(uuid, uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS patient_photos_select ON storage.objects;
DROP POLICY IF EXISTS patient_photos_insert ON storage.objects;
DROP POLICY IF EXISTS patient_photos_update ON storage.objects;
DROP POLICY IF EXISTS patient_photos_delete ON storage.objects;

CREATE POLICY patient_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

CREATE POLICY patient_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

CREATE POLICY patient_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

CREATE POLICY patient_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS case_files_insert ON storage.objects;
DROP POLICY IF EXISTS case_files_delete ON storage.objects;

CREATE POLICY case_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-files'
    AND public.is_staff(auth.uid())
    AND public.can_access_case(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY case_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'case-files'
    AND public.is_staff(auth.uid())
    AND public.can_access_case(((storage.foldername(name))[1])::uuid)
  );


DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['avatars','patient-photos','case-files','patient-files','backend-backups'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "auth_read_%1$s" ON storage.objects;
      DROP POLICY IF EXISTS "auth_insert_%1$s" ON storage.objects;
      DROP POLICY IF EXISTS "auth_update_%1$s" ON storage.objects;
      DROP POLICY IF EXISTS "auth_delete_%1$s" ON storage.objects;
      CREATE POLICY "auth_read_%1$s" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %2$L);
      CREATE POLICY "auth_insert_%1$s" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %2$L);
      CREATE POLICY "auth_update_%1$s" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %2$L) WITH CHECK (bucket_id = %2$L);
      CREATE POLICY "auth_delete_%1$s" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %2$L);
    $f$, replace(b,'-','_'), b);
  END LOOP;
END $$;

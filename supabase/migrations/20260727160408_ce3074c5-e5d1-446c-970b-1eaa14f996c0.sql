
-- Storage policies for authenticated users on new buckets
DO $$
DECLARE b text; op text; polname text;
BEGIN
  FOREACH b IN ARRAY ARRAY['patient-photos','avatars','case-files','patient-files'] LOOP
    FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      polname := replace(b,'-','_')||'_auth_'||lower(op);
      BEGIN
        IF op = 'INSERT' THEN
          EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)', polname, b);
        ELSIF op = 'UPDATE' THEN
          EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)', polname, b, b);
        ELSE
          EXECUTE format('CREATE POLICY %I ON storage.objects FOR %s TO authenticated USING (bucket_id = %L)', polname, op, b);
        END IF;
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END LOOP;
  END LOOP;
END $$;

-- Remove duplicate Ezequiel rows with no cases
DELETE FROM public.patients
WHERE id IN (
  '546cd383-c5c5-49d6-8241-2a363cc77f8b',
  '6947c5a1-d337-4988-aa48-e59dca95ceb6',
  '5f7dbbff-7361-40de-b194-f82920d2be54',
  'ec7e8137-b729-41c3-9edb-b55a57126e65',
  '720f5f1b-93c0-4412-b605-95224950ccb5',
  '9403ca51-55bd-4740-abfa-9dc986abaa22',
  '267c6f03-0e53-4943-b04e-ed2993fa13d7'
);

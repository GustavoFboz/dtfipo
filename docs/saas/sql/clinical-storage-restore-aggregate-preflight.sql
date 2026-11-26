-- DentalFlow: pre/post-restore consistency baseline for clinical attachments.
-- READ ONLY. Returns aggregate counts only: no paths, patient IDs,
-- authentication tokens, PHI, financial transactions or source file bytes.

SELECT now() AS checked_at_utc,
  (SELECT count(*)::int FROM public.patients) AS patients,
  (SELECT count(*)::int FROM public.cases) AS cases,
  (SELECT count(*)::int FROM public.clinic_appointments) AS appointments,
  (SELECT count(*)::int FROM public.storage_files) AS storage_file_rows,
  (SELECT count(*)::int FROM public.case_attachments) AS case_attachment_rows;

SELECT sf.bucket,
  count(*)::int AS storage_file_rows,
  count(*) FILTER (WHERE sf.object_path IS NULL OR sf.object_path='')::int AS missing_object_path,
  count(*) FILTER (WHERE so.id IS NOT NULL)::int AS actual_storage_object_match,
  count(*) FILTER (WHERE sf.object_path IS NOT NULL AND sf.object_path<>'' AND so.id IS NULL)::int AS missing_actual_storage_object,
  count(*) FILTER (WHERE sf.case_id IS NOT NULL AND c.id IS NULL)::int AS broken_case_reference,
  count(*) FILTER (WHERE sf.patient_id IS NOT NULL AND p.id IS NULL)::int AS broken_patient_reference,
  count(*) FILTER (WHERE sf.clinic_id IS NOT NULL AND cl.id IS NULL)::int AS broken_clinic_reference
FROM public.storage_files sf
LEFT JOIN storage.objects so ON so.bucket_id=sf.bucket AND so.name=sf.object_path
LEFT JOIN public.cases c ON c.id=sf.case_id
LEFT JOIN public.patients p ON p.id=sf.patient_id
LEFT JOIN public.clinics cl ON cl.id=sf.clinic_id
GROUP BY sf.bucket ORDER BY sf.bucket;

SELECT count(*)::int AS case_attachment_rows,
  count(*) FILTER (WHERE ca.case_id IS NULL)::int AS no_case_id,
  count(*) FILTER (WHERE ca.case_id IS NOT NULL AND c.id IS NULL)::int AS references_missing_case,
  count(DISTINCT ca.case_id) FILTER (WHERE ca.case_id IS NOT NULL AND c.id IS NULL)::int AS missing_distinct_cases,
  count(*) FILTER (WHERE so.id IS NOT NULL)::int AS stored_object_matches,
  count(*) FILTER (WHERE so.id IS NULL)::int AS stored_object_missing
FROM public.case_attachments ca
LEFT JOIN public.cases c ON c.id=ca.case_id
LEFT JOIN storage.objects so ON so.bucket_id='case-files' AND so.name=ca.storage_path;

-- RLS status is informational, NOT a proof of tenant authorization correctness.
SELECT c.relname, c.relrowsecurity AS rls_enabled,
  count(p.polname)::int AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid=c.oid
WHERE n.nspname='public' AND c.relname IN ('case_attachments','storage_files','cases')
GROUP BY c.relname,c.relrowsecurity
ORDER BY c.relname;

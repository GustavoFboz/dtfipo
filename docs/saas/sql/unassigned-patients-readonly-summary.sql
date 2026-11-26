-- Read-only aggregate report. Never returns patient IDs or personally identifiable content.
-- Uses no PHI fields, mutations, table locks, or account labels.
SELECT
  count(*)::integer AS total_patients,
  count(*) FILTER (WHERE clinic_id IS NULL)::integer AS unassigned_patients,
  count(*) FILTER (WHERE clinic_id IS NOT NULL)::integer AS assigned_patients,
  count(DISTINCT clinic_id)::integer AS assigned_distinct_companies
FROM public.patients;

SELECT
  count(*)::integer AS linked_cases,
  count(DISTINCT c.patient_id)::integer AS affected_patients_with_cases
FROM public.cases c
JOIN public.patients p ON p.id = c.patient_id
WHERE p.clinic_id IS NULL;

SELECT
  date_trunc('month',created_at)::date AS registration_month,
  count(*)::integer AS unassigned_patients
FROM public.patients
WHERE clinic_id IS NULL
GROUP BY 1
ORDER BY 1;

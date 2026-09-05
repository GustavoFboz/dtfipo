-- Post-recovery sanity check helper kept as a no-op migration.
-- The SQL Editor can verify manually with:
-- SELECT to_regprocedure('public.can_access_patient(uuid)');
SELECT 1;

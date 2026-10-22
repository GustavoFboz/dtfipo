-- Read-only; safe for clean restore and the live backend.
BEGIN READ ONLY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.case_activity_reads'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.case_activity'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'ACTIVITY_READ_RLS_NOT_ENABLED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='case_activity_reads'
      AND policyname='case_activity_reads_activity_boundary'
      AND permissive='RESTRICTIVE' AND cmd='ALL'
      AND roles::text='{authenticated}'
      AND qual LIKE '%case_activity%'
      AND with_check LIKE '%auth.uid()%'
      AND with_check LIKE '%case_activity%'
  ) THEN RAISE EXCEPTION 'ACTIVITY_READ_RESTRICTIVE_BOUNDARY_MISSING'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='case_activity_reads'
      AND policyname='case_activity_reads_visible_activity' AND cmd='SELECT'
      AND qual LIKE '%case_activity%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='case_activity_reads'
      AND cmd IN ('SELECT','ALL') AND qual='true'
  ) THEN RAISE EXCEPTION 'ACTIVITY_READ_UNRESTRICTED_SELECT'; END IF;
END $$;
SELECT 'passed' AS stage_07_activity_read_boundary;
ROLLBACK;

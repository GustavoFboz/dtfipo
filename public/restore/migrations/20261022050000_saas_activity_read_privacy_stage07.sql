-- Read receipts disclose identities and activity, even without comment text.
-- Evaluate the parent activity through the caller's existing RLS, including
-- company access and the current CAD assignment interval. No definer helper,
-- new grant, history rewrite or change to the underlying activity is needed.
ALTER TABLE public.case_activity_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_activity_reads_select ON public.case_activity_reads;
DROP POLICY IF EXISTS "read own or same case" ON public.case_activity_reads;
DROP POLICY IF EXISTS case_activity_reads_visible_activity ON public.case_activity_reads;
CREATE POLICY case_activity_reads_visible_activity
ON public.case_activity_reads FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_activity activity
    WHERE activity.id = case_activity_reads.activity_id
  )
);

-- Intersect legacy permissive policies for every operation. A valid user ID
-- alone must not authorize a receipt for an invisible activity. Writes also
-- remain limited to the current user's own receipt.
DROP POLICY IF EXISTS case_activity_reads_activity_boundary ON public.case_activity_reads;
CREATE POLICY case_activity_reads_activity_boundary
ON public.case_activity_reads AS RESTRICTIVE FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_activity activity
    WHERE activity.id = case_activity_reads.activity_id
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.case_activity activity
    WHERE activity.id = case_activity_reads.activity_id
  )
);

COMMENT ON POLICY case_activity_reads_activity_boundary ON public.case_activity_reads IS
  'SaaS: receipts inherit parent activity visibility; own-receipt writes only. Existing history is preserved.';
NOTIFY pgrst, 'reload schema';

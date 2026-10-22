-- Restore older snapshots to the activity contract already used by 0.6.4.
-- Their legacy staff policy is broader than the live company/assignment rule.
-- These two helpers reproduce the existing canonical application definitions;
-- restrictive policies also protect a restore retaining permissive old rules.
CREATE OR REPLACE FUNCTION public.case_cadista_assignment_started_at(
  _case_id uuid, _user_id uuid DEFAULT auth.uid()
)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT max(a.created_at) FROM public.case_activity a
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.metadata->'changes','[]'::jsonb)) ch
      WHERE a.case_id=c.id AND a.kind='case_edit' AND ch->>'field'='cadista_id'
        AND NULLIF(ch->>'to','')::uuid=c.cadista_id),
    c.created_at)
  FROM public.cases c JOIN public.cadistas cd ON cd.id=c.cadista_id
  WHERE c.id=_case_id AND cd.user_id=_user_id;
$$;
CREATE OR REPLACE FUNCTION public.case_activity_visible_to_user(
  _case_id uuid, _created_at timestamptz, _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_case(_case_id) AND (
    public.current_user_is_admin()
    OR NOT EXISTS (SELECT 1 FROM public.cases c JOIN public.cadistas cd ON cd.id=c.cadista_id
      WHERE c.id=_case_id AND cd.user_id=_user_id)
    OR (public.case_cadista_assignment_started_at(_case_id,_user_id) IS NOT NULL
      AND _created_at>=public.case_cadista_assignment_started_at(_case_id,_user_id))
  );
$$;
REVOKE ALL ON FUNCTION public.case_cadista_assignment_started_at(uuid,uuid),
  public.case_activity_visible_to_user(uuid,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_cadista_assignment_started_at(uuid,uuid),
  public.case_activity_visible_to_user(uuid,timestamptz,uuid) TO authenticated, service_role;

ALTER TABLE public.case_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_activity_select_staff ON public.case_activity;
DROP POLICY IF EXISTS case_activity_select_v064 ON public.case_activity;
CREATE POLICY case_activity_select_v064 ON public.case_activity FOR SELECT TO authenticated
USING (public.case_activity_visible_to_user(case_id,created_at,auth.uid()));
DROP POLICY IF EXISTS case_activity_visibility_boundary ON public.case_activity;
CREATE POLICY case_activity_visibility_boundary ON public.case_activity AS RESTRICTIVE
FOR SELECT TO authenticated USING (public.case_activity_visible_to_user(case_id,created_at,auth.uid()));

DROP POLICY IF EXISTS case_activity_insert_v064 ON public.case_activity;
CREATE POLICY case_activity_insert_v064 ON public.case_activity FOR INSERT TO authenticated
WITH CHECK (public.can_access_case(case_id) AND user_id=auth.uid());
DROP POLICY IF EXISTS case_activity_insert_boundary ON public.case_activity;
CREATE POLICY case_activity_insert_boundary ON public.case_activity AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (public.can_access_case(case_id) AND user_id=auth.uid());
DROP POLICY IF EXISTS case_activity_update_v064 ON public.case_activity;
CREATE POLICY case_activity_update_v064 ON public.case_activity FOR UPDATE TO authenticated
USING (public.can_access_case(case_id) AND (user_id=auth.uid() OR public.current_user_is_admin()))
WITH CHECK (public.can_access_case(case_id) AND (user_id=auth.uid() OR public.current_user_is_admin()));
DROP POLICY IF EXISTS case_activity_update_boundary ON public.case_activity;
CREATE POLICY case_activity_update_boundary ON public.case_activity AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.can_access_case(case_id) AND (user_id=auth.uid() OR public.current_user_is_admin()))
WITH CHECK (public.can_access_case(case_id) AND (user_id=auth.uid() OR public.current_user_is_admin()));
DROP POLICY IF EXISTS case_activity_delete_v064 ON public.case_activity;
CREATE POLICY case_activity_delete_v064 ON public.case_activity FOR DELETE TO authenticated
USING (public.can_access_case(case_id) AND (user_id=auth.uid() OR public.current_user_is_admin()));
DROP POLICY IF EXISTS case_activity_delete_boundary ON public.case_activity;
CREATE POLICY case_activity_delete_boundary ON public.case_activity AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.can_access_case(case_id) AND (user_id=auth.uid() OR public.current_user_is_admin()));

-- Read receipts disclose identities and activity, even without comment text.
-- Evaluate the parent activity through the caller's existing RLS, including
-- company access and the current CAD assignment interval. No receipt-specific
-- definer helper or history rewrite is needed.
-- Older recovery snapshots predate the read-receipt table itself. Reproduce
-- its canonical schema/grants without importing the legacy global profile rule.
CREATE TABLE IF NOT EXISTS public.case_activity_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.case_activity(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id,user_id)
);
CREATE INDEX IF NOT EXISTS case_activity_reads_activity_idx ON public.case_activity_reads(activity_id);
CREATE INDEX IF NOT EXISTS case_activity_reads_user_idx ON public.case_activity_reads(user_id);
REVOKE ALL ON public.case_activity_reads FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_activity_reads TO authenticated;
GRANT ALL ON public.case_activity_reads TO service_role;
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

DROP POLICY IF EXISTS case_activity_reads_insert ON public.case_activity_reads;
CREATE POLICY case_activity_reads_insert ON public.case_activity_reads FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS case_activity_reads_update ON public.case_activity_reads;
CREATE POLICY case_activity_reads_update ON public.case_activity_reads FOR UPDATE TO authenticated
USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS case_activity_reads_delete ON public.case_activity_reads;
CREATE POLICY case_activity_reads_delete ON public.case_activity_reads FOR DELETE TO authenticated
USING (user_id=auth.uid());

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

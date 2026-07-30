DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.case_activity_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.case_activity(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_activity_reads TO authenticated;
GRANT ALL ON public.case_activity_reads TO service_role;

ALTER TABLE public.case_activity_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_activity_reads_select ON public.case_activity_reads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY case_activity_reads_insert ON public.case_activity_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY case_activity_reads_update ON public.case_activity_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY case_activity_reads_delete ON public.case_activity_reads
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS case_activity_reads_activity_idx ON public.case_activity_reads(activity_id);
CREATE INDEX IF NOT EXISTS case_activity_reads_user_idx ON public.case_activity_reads(user_id);
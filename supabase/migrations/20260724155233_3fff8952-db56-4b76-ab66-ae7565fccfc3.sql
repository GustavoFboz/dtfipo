
CREATE TABLE IF NOT EXISTS public.case_activity_reads (
  activity_id UUID NOT NULL REFERENCES public.case_activity(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.case_activity_reads TO authenticated;
GRANT ALL ON public.case_activity_reads TO service_role;

ALTER TABLE public.case_activity_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or same case" ON public.case_activity_reads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert own read" ON public.case_activity_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete own read" ON public.case_activity_reads
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS case_activity_reads_activity_idx ON public.case_activity_reads(activity_id);

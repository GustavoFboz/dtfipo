
CREATE TABLE public.case_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'comment',
  content text,
  mentions uuid[] NOT NULL DEFAULT '{}',
  attachment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_activity_case_idx ON public.case_activity(case_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_activity TO authenticated;
GRANT ALL ON public.case_activity TO service_role;

ALTER TABLE public.case_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_activity_select_staff" ON public.case_activity
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.can_access_case(case_id));

CREATE POLICY "case_activity_insert_staff" ON public.case_activity
  FOR INSERT TO authenticated
  WITH CHECK ((public.is_staff(auth.uid()) OR public.can_access_case(case_id)) AND user_id = auth.uid());

CREATE POLICY "case_activity_delete_owner" ON public.case_activity
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity;

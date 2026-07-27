
CREATE TABLE public.model_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.case_attachments(id) ON DELETE SET NULL,
  normalized_name text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  camera jsonb,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_annotations TO authenticated;
GRANT ALL ON public.model_annotations TO service_role;

ALTER TABLE public.model_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view annotations of accessible cases"
  ON public.model_annotations FOR SELECT TO authenticated
  USING (public.can_access_case(case_id));

CREATE POLICY "insert own annotations on accessible cases"
  ON public.model_annotations FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_access_case(case_id));

CREATE POLICY "update own annotations"
  ON public.model_annotations FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "delete own annotations"
  ON public.model_annotations FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE INDEX idx_model_annotations_case_name
  ON public.model_annotations (case_id, normalized_name);

CREATE TRIGGER set_model_annotations_updated_at
  BEFORE UPDATE ON public.model_annotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.model_annotations;
ALTER TABLE public.model_annotations REPLICA IDENTITY FULL;

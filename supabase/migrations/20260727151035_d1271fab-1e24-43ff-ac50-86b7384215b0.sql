
ALTER TABLE public.case_activity ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.case_activity ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.case_activity ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.case_activity ADD COLUMN IF NOT EXISTS attachment_id uuid;
UPDATE public.case_activity SET user_id = actor_id WHERE user_id IS NULL AND actor_id IS NOT NULL;
UPDATE public.case_activity SET content = message WHERE content IS NULL AND message IS NOT NULL;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'general';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.case_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_attachments TO authenticated;
GRANT ALL ON public.case_attachments TO service_role;
ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='case_attachments' AND policyname='case_attachments_access') THEN
    CREATE POLICY "case_attachments_access" ON public.case_attachments
      FOR ALL TO authenticated
      USING (public.can_access_case(case_id))
      WITH CHECK (public.can_access_case(case_id));
  END IF;
END $$;

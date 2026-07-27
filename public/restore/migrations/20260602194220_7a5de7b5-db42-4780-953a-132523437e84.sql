-- 1. case_attachments
CREATE TABLE public.case_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  expired_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_case_attachments_case ON public.case_attachments(case_id);
CREATE INDEX idx_case_attachments_pending_expiry ON public.case_attachments(expires_at) WHERE expired_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_attachments TO authenticated;
GRANT ALL ON public.case_attachments TO service_role;

ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_attachments_select ON public.case_attachments
  FOR SELECT TO authenticated
  USING (public.can_access_case(case_id));

CREATE POLICY case_attachments_insert ON public.case_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_case(case_id));

CREATE POLICY case_attachments_update ON public.case_attachments
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.can_access_case(case_id));

CREATE POLICY case_attachments_delete ON public.case_attachments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Storage policies for case-files bucket (bucket is created via tool)
CREATE POLICY "case_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-files'
    AND EXISTS (
      SELECT 1 FROM public.case_attachments a
      WHERE a.storage_path = storage.objects.name
        AND public.can_access_case(a.case_id)
    )
  );

CREATE POLICY "case_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-files' AND public.is_staff(auth.uid()));

CREATE POLICY "case_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'case-files' AND public.is_staff(auth.uid()));

-- 3. Cron extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4. Schedule hourly cleanup hitting the public hook (no body needed)
SELECT cron.schedule(
  'cleanup-expired-case-files',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--22e6cc68-6ce7-4194-a797-232220056438.lovable.app/api/public/hooks/cleanup-case-files',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
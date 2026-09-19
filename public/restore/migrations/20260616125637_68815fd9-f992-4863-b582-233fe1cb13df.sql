
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.case_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.case_activity REPLICA IDENTITY FULL;
ALTER TABLE public.cases REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;

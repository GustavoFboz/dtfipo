ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.case_activity REPLICA IDENTITY FULL;
ALTER TABLE public.case_activity_reads REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='case_activity') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='case_activity_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity_reads;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='case_attachments') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.case_attachments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='model_annotations') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.model_annotations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='case_tooth_stock_usage') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.case_tooth_stock_usage';
  END IF;
END $$;

ALTER TABLE public.case_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.model_annotations REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.cases REPLICA IDENTITY FULL;
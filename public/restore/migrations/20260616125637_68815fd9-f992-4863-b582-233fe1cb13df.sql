
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.case_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.case_activity REPLICA IDENTITY FULL;
ALTER TABLE public.cases REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;

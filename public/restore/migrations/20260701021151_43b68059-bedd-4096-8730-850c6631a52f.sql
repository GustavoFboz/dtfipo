ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_types_link;
ALTER TABLE public.patients REPLICA IDENTITY FULL;
ALTER TABLE public.doctors REPLICA IDENTITY FULL;
ALTER TABLE public.case_types_link REPLICA IDENTITY FULL;
ALTER TABLE public.cases REPLICA IDENTITY FULL;
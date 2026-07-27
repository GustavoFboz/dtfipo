
CREATE SEQUENCE IF NOT EXISTS public.cases_case_number_seq;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_number INTEGER;
UPDATE public.cases SET case_number = nextval('public.cases_case_number_seq') WHERE case_number IS NULL;
ALTER TABLE public.cases ALTER COLUMN case_number SET DEFAULT nextval('public.cases_case_number_seq');
SELECT setval('public.cases_case_number_seq', COALESCE((SELECT MAX(case_number) FROM public.cases), 0));
CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_key ON public.cases(case_number);

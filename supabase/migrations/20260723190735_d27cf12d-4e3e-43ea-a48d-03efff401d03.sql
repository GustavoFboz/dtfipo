ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS clinic_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
CREATE INDEX IF NOT EXISTS profiles_clinic_id_idx ON public.profiles(clinic_id);
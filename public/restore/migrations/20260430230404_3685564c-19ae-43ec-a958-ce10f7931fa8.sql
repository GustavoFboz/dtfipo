-- Add folder fields to cases
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS folder_url text,
  ADD COLUMN IF NOT EXISTS folder_done boolean NOT NULL DEFAULT false;

-- Add stage dates to case_stages (for showing in history popup)
ALTER TABLE public.case_stages
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Storage bucket for patient photos (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-photos', 'patient-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public RLS policies for the bucket (internal-use system)
DROP POLICY IF EXISTS "patient_photos_select" ON storage.objects;
CREATE POLICY "patient_photos_select" ON storage.objects FOR SELECT USING (bucket_id = 'patient-photos');
DROP POLICY IF EXISTS "patient_photos_insert" ON storage.objects;
CREATE POLICY "patient_photos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'patient-photos');
DROP POLICY IF EXISTS "patient_photos_update" ON storage.objects;
CREATE POLICY "patient_photos_update" ON storage.objects FOR UPDATE USING (bucket_id = 'patient-photos');
DROP POLICY IF EXISTS "patient_photos_delete" ON storage.objects;
CREATE POLICY "patient_photos_delete" ON storage.objects FOR DELETE USING (bucket_id = 'patient-photos');
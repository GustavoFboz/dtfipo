
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS implant_teeth integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tooth_case_types jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scan_jig_id uuid,
  ADD COLUMN IF NOT EXISTS tooth_ti_bases jsonb NOT NULL DEFAULT '{}'::jsonb;

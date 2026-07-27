ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS gum_info jsonb,
  ADD COLUMN IF NOT EXISTS implant_system_id uuid,
  ADD COLUMN IF NOT EXISTS implant_system_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tooth_implant_systems jsonb NOT NULL DEFAULT '{}'::jsonb;
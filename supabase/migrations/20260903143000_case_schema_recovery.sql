-- Recovery migration for environments where the previous hardening migration
-- could not finish. Keep case creation compatible with the current frontend.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS has_mockup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prosthesis_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS condition_key text;

UPDATE public.stages
SET condition_key = CASE
  WHEN lower(name) LIKE '%mockup%' THEN 'mockup'
  WHEN lower(name) LIKE '%provis%' THEN 'provisional'
  ELSE condition_key
END
WHERE condition_key IS NULL;

ALTER TABLE public.stages
  DROP CONSTRAINT IF EXISTS stages_condition_key_check;
ALTER TABLE public.stages
  ADD CONSTRAINT stages_condition_key_check
  CHECK (condition_key IS NULL OR condition_key IN ('mockup','provisional'));

NOTIFY pgrst, 'reload schema';

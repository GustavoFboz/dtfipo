
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS current_phase_id uuid;
DO $$ BEGIN
  ALTER TABLE public.cases ADD CONSTRAINT cases_current_phase_id_fkey
  FOREIGN KEY (current_phase_id) REFERENCES public.phases(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_cases_current_phase_id ON public.cases(current_phase_id);
-- Backfill from current_stage's phase
UPDATE public.cases c
SET current_phase_id = s.phase_id
FROM public.stages s
WHERE c.current_stage_id = s.id AND c.current_phase_id IS NULL AND s.phase_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';

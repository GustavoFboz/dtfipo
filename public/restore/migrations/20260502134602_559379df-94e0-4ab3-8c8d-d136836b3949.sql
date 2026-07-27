DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_current_stage_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_current_stage_id_fkey
      FOREIGN KEY (current_stage_id) REFERENCES public.stages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_cadista_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_cadista_id_fkey
      FOREIGN KEY (cadista_id) REFERENCES public.cadistas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_sibling_case_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_sibling_case_id_fkey
      FOREIGN KEY (sibling_case_id) REFERENCES public.cases(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_phase_id_fkey') THEN
    ALTER TABLE public.stages ADD CONSTRAINT stages_phase_id_fkey
      FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE SET NULL;
  END IF;
END $$;
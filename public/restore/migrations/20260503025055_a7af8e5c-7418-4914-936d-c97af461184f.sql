DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_patient_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.patients(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_doctor_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_doctor_id_fkey
      FOREIGN KEY (doctor_id) REFERENCES public.doctors(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_cadista_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_cadista_id_fkey
      FOREIGN KEY (cadista_id) REFERENCES public.cadistas(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_case_type_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_case_type_id_fkey
      FOREIGN KEY (case_type_id) REFERENCES public.case_types(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_tooth_color_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_tooth_color_id_fkey
      FOREIGN KEY (tooth_color_id) REFERENCES public.tooth_colors(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_current_stage_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_current_stage_id_fkey
      FOREIGN KEY (current_stage_id) REFERENCES public.stages(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_sibling_case_id_fkey' AND conrelid = 'public.cases'::regclass
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_sibling_case_id_fkey
      FOREIGN KEY (sibling_case_id) REFERENCES public.cases(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stages_phase_id_fkey' AND conrelid = 'public.stages'::regclass
  ) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_phase_id_fkey
      FOREIGN KEY (phase_id) REFERENCES public.phases(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_stages_case_id_fkey' AND conrelid = 'public.case_stages'::regclass
  ) THEN
    ALTER TABLE public.case_stages
      ADD CONSTRAINT case_stages_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES public.cases(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_stages_stage_id_fkey' AND conrelid = 'public.case_stages'::regclass
  ) THEN
    ALTER TABLE public.case_stages
      ADD CONSTRAINT case_stages_stage_id_fkey
      FOREIGN KEY (stage_id) REFERENCES public.stages(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_components_case_id_fkey' AND conrelid = 'public.case_components'::regclass
  ) THEN
    ALTER TABLE public.case_components
      ADD CONSTRAINT case_components_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES public.cases(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_components_component_id_fkey' AND conrelid = 'public.case_components'::regclass
  ) THEN
    ALTER TABLE public.case_components
      ADD CONSTRAINT case_components_component_id_fkey
      FOREIGN KEY (component_id) REFERENCES public.components(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cases_status_delivery_date ON public.cases(status, delivery_date);
CREATE INDEX IF NOT EXISTS idx_cases_patient_id ON public.cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_cases_current_stage_id ON public.cases(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_case_stages_case_id ON public.case_stages(case_id);
CREATE INDEX IF NOT EXISTS idx_case_components_case_id ON public.case_components(case_id);

NOTIFY pgrst, 'reload schema';
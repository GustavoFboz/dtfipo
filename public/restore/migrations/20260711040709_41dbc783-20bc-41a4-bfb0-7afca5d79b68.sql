-- n5: Múltiplos sistemas de implante por caso
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS implant_system_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- Backfill from legacy single-system column
UPDATE public.cases
   SET implant_system_ids = ARRAY[implant_system_id]
 WHERE implant_system_id IS NOT NULL
   AND (implant_system_ids IS NULL OR array_length(implant_system_ids, 1) IS NULL);

CREATE INDEX IF NOT EXISTS cases_implant_system_ids_gin
  ON public.cases USING GIN (implant_system_ids);
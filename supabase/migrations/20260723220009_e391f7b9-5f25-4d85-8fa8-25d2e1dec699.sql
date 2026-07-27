
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Copiar valor antigo `requires_implant_components` para o novo array de requisitos
UPDATE public.stages
SET requirements = jsonb_build_array(
  jsonb_build_object('type', 'implant_components', 'blocks_advance', true)
)
WHERE COALESCE(requires_implant_components, false) = true
  AND (requirements IS NULL OR jsonb_array_length(requirements) = 0);

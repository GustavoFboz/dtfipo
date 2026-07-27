
-- Add modular platform fields to clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS company_type text NOT NULL DEFAULT 'LAB',
  ADD COLUMN IF NOT EXISTS modules_enabled text[] NOT NULL DEFAULT ARRAY['laboratory']::text[];

ALTER TABLE public.clinics
  DROP CONSTRAINT IF EXISTS clinics_company_type_check;
ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_company_type_check
  CHECK (company_type IN ('LAB','CLINIC','HYBRID','IPO'));


CREATE TABLE IF NOT EXISTS public.implant_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  manufacturer text,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_systems TO authenticated;
GRANT ALL ON public.implant_systems TO service_role;
ALTER TABLE public.implant_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "implant_systems auth read" ON public.implant_systems FOR SELECT TO authenticated USING (true);
CREATE POLICY "implant_systems staff write" ON public.implant_systems FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.scan_jigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_jigs TO authenticated;
GRANT ALL ON public.scan_jigs TO service_role;
ALTER TABLE public.scan_jigs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scan_jigs auth read" ON public.scan_jigs FOR SELECT TO authenticated USING (true);
CREATE POLICY "scan_jigs staff write" ON public.scan_jigs FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- FKs from cases so PostgREST embed works
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cases_implant_system_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_implant_system_id_fkey
      FOREIGN KEY (implant_system_id) REFERENCES public.implant_systems(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cases_scan_jig_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_scan_jig_id_fkey
      FOREIGN KEY (scan_jig_id) REFERENCES public.scan_jigs(id) ON DELETE SET NULL;
  END IF;
END $$;

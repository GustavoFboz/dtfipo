
-- Scan jigs catalog per implant system
CREATE TABLE IF NOT EXISTS public.scan_jigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (implant_system_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_jigs TO authenticated;
GRANT ALL ON public.scan_jigs TO service_role;

ALTER TABLE public.scan_jigs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scan_jigs read all authenticated" ON public.scan_jigs FOR SELECT TO authenticated USING (true);
CREATE POLICY "scan_jigs admin write" ON public.scan_jigs FOR ALL TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE TRIGGER scan_jigs_set_updated_at BEFORE UPDATE ON public.scan_jigs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cases: implant teeth + chosen scan jig
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS implant_teeth int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scan_jig_id uuid REFERENCES public.scan_jigs(id) ON DELETE SET NULL;

-- Seed common scan jigs per implant system
INSERT INTO public.scan_jigs (implant_system_id, name, sort_order)
SELECT s.id, j.name, j.ord FROM public.implant_systems s
JOIN LATERAL (
  VALUES
    ('Neodent','GM', 'Scan Body GM Mini Conical', 1),
    ('Neodent','GM', 'Scan Body GM Conical', 2),
    ('Neodent','GM', 'Scan Body GM Helix', 3),
    ('Neodent','CM', 'Scan Body CM 3.5', 1),
    ('Neodent','CM', 'Scan Body CM 4.3', 2),
    ('Neodent','CM', 'Scan Body CM 5.0', 3),
    ('Neodent','HE', 'Scan Body HE 3.75', 1),
    ('Neodent','HE', 'Scan Body HE 4.1', 2),
    ('Neodent','HE', 'Scan Body HE 5.0', 3),
    ('S.I.N.', NULL, 'Scan Body Strong SW', 1),
    ('S.I.N.', NULL, 'Scan Body Unitite', 2),
    ('S.I.N.', NULL, 'Scan Body Intraoss', 3),
    ('Oralfix', NULL, 'Scan Body Oralfix CM', 1),
    ('Oralfix', NULL, 'Scan Body Oralfix HE', 2),
    ('Straumann','BL', 'Scan Body BL NC', 1),
    ('Straumann','BL', 'Scan Body BL RC', 2),
    ('Straumann','TL', 'Scan Body TL RN', 1),
    ('Straumann','TL', 'Scan Body TL WN', 2),
    ('Nobel Biocare','Active', 'Scan Body Active NP', 1),
    ('Nobel Biocare','Active', 'Scan Body Active RP', 2),
    ('Nobel Biocare','Replace', 'Scan Body Replace NP', 1),
    ('Nobel Biocare','Replace', 'Scan Body Replace RP', 2),
    ('Nobel Biocare','Conical Connection', 'Scan Body CC NP', 1),
    ('Nobel Biocare','Conical Connection', 'Scan Body CC RP', 2),
    ('Conexão', NULL, 'Scan Body Master Conect', 1),
    ('Conexão', NULL, 'Scan Body HE Conexão', 2),
    ('Bicon', NULL, 'Scan Body Bicon Universal', 1),
    ('Implacil De Bortoli', NULL, 'Scan Body DSP', 1),
    ('Singular', NULL, 'Scan Body Singular CM', 1)
) AS j(brand, ln, name, ord) ON j.brand = s.name AND (j.ln IS NOT DISTINCT FROM s.line)
ON CONFLICT (implant_system_id, name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.workflow_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  phases_enabled boolean NOT NULL DEFAULT false,
  stages_enabled boolean NOT NULL DEFAULT true,
  auto_advance_enabled boolean NOT NULL DEFAULT true,
  progress_bar_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;
ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_settings read all authenticated" ON public.workflow_settings;
CREATE POLICY "workflow_settings read all authenticated" ON public.workflow_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "workflow_settings write admins" ON public.workflow_settings;
CREATE POLICY "workflow_settings write admins" ON public.workflow_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));
INSERT INTO public.workflow_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Também garantir que cadistas existentes com user_id em profiles CADISTA apareçam
INSERT INTO public.cadistas (name, user_id)
SELECT COALESCE(p.full_name, p.email), p.id
FROM public.profiles p
WHERE p.role = 'CADISTA'
  AND NOT EXISTS (SELECT 1 FROM public.cadistas c WHERE c.user_id = p.id);
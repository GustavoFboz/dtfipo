
-- Backfill CEO clinic_id so the team panel has a clinic association
UPDATE public.profiles SET clinic_id = id WHERE clinic_id IS NULL AND role IN ('CEO','DR');

-- Minimal clinic_members table required by team.functions.ts
CREATE TABLE IF NOT EXISTS public.clinic_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  invited_by UUID,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_members TO authenticated;
GRANT ALL ON public.clinic_members TO service_role;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view own clinic rows" ON public.clinic_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR'))
  );
CREATE POLICY "admins manage clinic members" ON public.clinic_members
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR'))
  );

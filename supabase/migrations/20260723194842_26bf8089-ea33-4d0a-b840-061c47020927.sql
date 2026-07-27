
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false;

-- Motivos de retorno
CREATE TABLE IF NOT EXISTS public.stage_return_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  position integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_return_reasons TO authenticated;
GRANT ALL ON public.stage_return_reasons TO service_role;
ALTER TABLE public.stage_return_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srr_read_staff" ON public.stage_return_reasons;
CREATE POLICY "srr_read_staff" ON public.stage_return_reasons FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "srr_write_admin" ON public.stage_return_reasons;
CREATE POLICY "srr_write_admin" ON public.stage_return_reasons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));

-- Responsáveis por etapa
CREATE TABLE IF NOT EXISTS public.stage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_assignments TO authenticated;
GRANT ALL ON public.stage_assignments TO service_role;
ALTER TABLE public.stage_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sa_read_staff" ON public.stage_assignments;
CREATE POLICY "sa_read_staff" ON public.stage_assignments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
DROP POLICY IF EXISTS "sa_write_admin" ON public.stage_assignments;
CREATE POLICY "sa_write_admin" ON public.stage_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));

-- RPC seed_default_workflow
CREATE OR REPLACE FUNCTION public.seed_default_workflow()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_phase uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;

  SELECT id INTO v_phase FROM public.phases ORDER BY position LIMIT 1;
  IF v_phase IS NULL THEN
    INSERT INTO public.phases (name, color, position) VALUES ('Fluxo', '#1F8AFF', 10) RETURNING id INTO v_phase;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stages) THEN
    INSERT INTO public.stages (name, color, position, phase_id) VALUES
      ('Recepção',   '#64748b',  10, v_phase),
      ('Preparo',    '#0ea5e9',  20, v_phase),
      ('Cadista',    '#8b5cf6',  30, v_phase),
      ('Fresagem',   '#f59e0b',  40, v_phase),
      ('Acabamento', '#10b981',  50, v_phase),
      ('Entrega',    '#22c55e',  60, v_phase);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stage_return_reasons) THEN
    INSERT INTO public.stage_return_reasons (label, position) VALUES
      ('Ajuste de oclusão', 10),
      ('Cor incorreta', 20),
      ('Contato proximal', 30),
      ('Falha de escaneamento', 40),
      ('Outro', 100);
  END IF;

  RETURN jsonb_build_object('success', true);
END $$;

REVOKE ALL ON FUNCTION public.seed_default_workflow() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_workflow() TO authenticated;

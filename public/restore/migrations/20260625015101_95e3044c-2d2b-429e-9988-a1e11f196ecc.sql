
-- 1) Settings (singleton row with id = true)
CREATE TABLE IF NOT EXISTS public.workflow_settings (
  id boolean PRIMARY KEY DEFAULT true,
  phases_enabled boolean NOT NULL DEFAULT false,
  stages_enabled boolean NOT NULL DEFAULT false,
  auto_advance_enabled boolean NOT NULL DEFAULT true,
  progress_bar_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;

ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_settings_select ON public.workflow_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY workflow_settings_write ON public.workflow_settings
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

INSERT INTO public.workflow_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- 2) Extend phases/stages
ALTER TABLE public.phases
  ADD COLUMN IF NOT EXISTS is_terminal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS on_complete_action text NOT NULL DEFAULT 'next',
  ADD COLUMN IF NOT EXISTS target_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS on_complete_action text NOT NULL DEFAULT 'next',
  ADD COLUMN IF NOT EXISTS target_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notify_role text,
  ADD COLUMN IF NOT EXISTS notify_cadista boolean NOT NULL DEFAULT false;

-- Allow writes on phases/stages for admins (read already open in existing policies)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='phases' AND policyname='phases_admin_write') THEN
    CREATE POLICY phases_admin_write ON public.phases
      FOR ALL TO authenticated
      USING (public.current_user_is_admin())
      WITH CHECK (public.current_user_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stages' AND policyname='stages_admin_write') THEN
    CREATE POLICY stages_admin_write ON public.stages
      FOR ALL TO authenticated
      USING (public.current_user_is_admin())
      WITH CHECK (public.current_user_is_admin());
  END IF;
END $$;

-- 3) Assignments
CREATE TABLE IF NOT EXISTS public.phase_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.phase_assignments TO authenticated;
GRANT ALL ON public.phase_assignments TO service_role;
ALTER TABLE public.phase_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase_assignments_select ON public.phase_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY phase_assignments_write ON public.phase_assignments
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE TABLE IF NOT EXISTS public.stage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.stage_assignments TO authenticated;
GRANT ALL ON public.stage_assignments TO service_role;
ALTER TABLE public.stage_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_assignments_select ON public.stage_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY stage_assignments_write ON public.stage_assignments
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

-- 4) Seed default workflow
CREATE OR REPLACE FUNCTION public.seed_default_workflow()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p_novo uuid; p_desenho uuid; p_prova uuid; p_confeccao uuid;
  p_prova_paciente uuid; p_fresagem uuid; p_acabamento uuid; p_entregue uuid;
  s_ajuste_prova uuid; s_aprovado_prova uuid;
  s_impressao uuid; s_acabamento_int uuid;
  s_ajuste_pp uuid; s_aprovado_pp uuid;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  -- Insert phases (idempotent by name)
  INSERT INTO public.phases (name, color, position, is_terminal, on_complete_action)
  VALUES
    ('Novo caso',       '#94a3b8', 10, false, 'next'),
    ('Desenho',         '#3b82f6', 20, false, 'next'),
    ('Prova',           '#f59e0b', 30, false, 'next'),
    ('Confecção',       '#8b5cf6', 40, false, 'next'),
    ('Prova paciente',  '#ec4899', 50, false, 'next'),
    ('Fresagem',        '#06b6d4', 60, false, 'next'),
    ('Acabamento',      '#10b981', 70, false, 'next'),
    ('Entregue',        '#22c55e', 80, true,  'next')
  ON CONFLICT DO NOTHING;

  SELECT id INTO p_novo           FROM public.phases WHERE name='Novo caso' LIMIT 1;
  SELECT id INTO p_desenho        FROM public.phases WHERE name='Desenho' LIMIT 1;
  SELECT id INTO p_prova          FROM public.phases WHERE name='Prova' LIMIT 1;
  SELECT id INTO p_confeccao      FROM public.phases WHERE name='Confecção' LIMIT 1;
  SELECT id INTO p_prova_paciente FROM public.phases WHERE name='Prova paciente' LIMIT 1;
  SELECT id INTO p_fresagem       FROM public.phases WHERE name='Fresagem' LIMIT 1;
  SELECT id INTO p_acabamento     FROM public.phases WHERE name='Acabamento' LIMIT 1;
  SELECT id INTO p_entregue       FROM public.phases WHERE name='Entregue' LIMIT 1;

  -- Stages for "Prova"
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action, target_phase_id, notify_cadista)
  VALUES ('Ajuste', '#ef4444', 10, p_prova, 'goto_phase', p_desenho, true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action, target_phase_id)
  VALUES ('Aprovado', '#22c55e', 20, p_prova, 'goto_phase', p_confeccao)
  ON CONFLICT DO NOTHING;

  -- Stages for "Confecção"
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action)
  VALUES ('Impressão', '#8b5cf6', 10, p_confeccao, 'next') ON CONFLICT DO NOTHING;
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action)
  VALUES ('Acabamento interno', '#a855f7', 20, p_confeccao, 'goto_phase'),
         ('Prova do paciente', '#ec4899', 30, p_confeccao, 'goto_phase')
  ON CONFLICT DO NOTHING;
  UPDATE public.stages SET target_phase_id = p_prova_paciente
    WHERE name='Prova do paciente' AND phase_id = p_confeccao;

  -- Stages for "Prova paciente"
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action, target_phase_id, notify_cadista)
  VALUES ('Ajuste paciente', '#ef4444', 10, p_prova_paciente, 'goto_phase', p_desenho, true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.stages (name, color, position, phase_id, on_complete_action, target_phase_id)
  VALUES ('Aprovado paciente', '#22c55e', 20, p_prova_paciente, 'goto_phase', p_fresagem)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true);
END $$;

-- 5) Advance function
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur_phase RECORD; cur_stage RECORD; nxt RECORD; chosen RECORD;
  next_phase_id uuid; next_stage_id uuid;
  v_user uuid := auth.uid();
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  -- If a stage_id was passed (user picked a branch like Ajuste/Aprovado), use it
  IF _stage_id IS NOT NULL THEN
    SELECT * INTO chosen FROM public.stages WHERE id = _stage_id;
    IF chosen IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Etapa não encontrada'); END IF;
    IF chosen.on_complete_action = 'goto_phase' AND chosen.target_phase_id IS NOT NULL THEN
      next_phase_id := chosen.target_phase_id;
      next_stage_id := NULL;
    ELSIF chosen.on_complete_action = 'goto_stage' AND chosen.target_stage_id IS NOT NULL THEN
      SELECT phase_id INTO next_phase_id FROM public.stages WHERE id = chosen.target_stage_id;
      next_stage_id := chosen.target_stage_id;
    ELSE
      -- next stage by position within same phase, else next phase
      SELECT id INTO next_stage_id FROM public.stages
        WHERE phase_id = chosen.phase_id AND position > chosen.position
        ORDER BY position LIMIT 1;
      IF next_stage_id IS NULL THEN
        SELECT id INTO next_phase_id FROM public.phases
          WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=chosen.phase_id),0)
          ORDER BY position LIMIT 1;
        next_stage_id := NULL;
      ELSE
        next_phase_id := chosen.phase_id;
      END IF;
    END IF;

    -- notifications
    IF chosen.notify_cadista AND c.cadista_id IS NOT NULL THEN
      INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
      SELECT v_user, cd.user_id, 'Caso retornou para desenho',
             'O caso ' || COALESCE(c.case_label, c.id::text) || ' voltou para você.', 'workflow_back'
        FROM public.cadistas cd WHERE cd.id = c.cadista_id;
    END IF;
  ELSE
    -- No stage selected: advance from current
    IF c.current_stage_id IS NOT NULL THEN
      SELECT * INTO cur_stage FROM public.stages WHERE id = c.current_stage_id;
      SELECT id INTO next_stage_id FROM public.stages
        WHERE phase_id = cur_stage.phase_id AND position > cur_stage.position
        ORDER BY position LIMIT 1;
      IF next_stage_id IS NULL THEN
        SELECT id INTO next_phase_id FROM public.phases
          WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=cur_stage.phase_id),0)
          ORDER BY position LIMIT 1;
      ELSE
        next_phase_id := cur_stage.phase_id;
      END IF;
    ELSE
      SELECT id INTO next_phase_id FROM public.phases
        WHERE position > COALESCE((SELECT position FROM public.phases WHERE id=c.current_phase_id),0)
        ORDER BY position LIMIT 1;
      next_stage_id := NULL;
    END IF;
  END IF;

  UPDATE public.cases
     SET current_phase_id = COALESCE(next_phase_id, current_phase_id),
         current_stage_id = next_stage_id,
         updated_at = now()
   WHERE id = _case_id;

  RETURN jsonb_build_object(
    'success', true,
    'phase_id', COALESCE(next_phase_id, c.current_phase_id),
    'stage_id', next_stage_id
  );
END $$;

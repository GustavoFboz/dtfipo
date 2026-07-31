-- ===== Workflow settings =====
CREATE TABLE IF NOT EXISTS public.workflow_settings (
  id boolean PRIMARY KEY DEFAULT true,
  phases_enabled boolean NOT NULL DEFAULT false,
  stages_enabled boolean NOT NULL DEFAULT true,
  auto_advance_enabled boolean NOT NULL DEFAULT true,
  progress_bar_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_settings_singleton CHECK (id = true)
);
GRANT SELECT, INSERT, UPDATE ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;
ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_settings_select ON public.workflow_settings;
CREATE POLICY workflow_settings_select ON public.workflow_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS workflow_settings_write ON public.workflow_settings;
CREATE POLICY workflow_settings_write ON public.workflow_settings FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
INSERT INTO public.workflow_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- ===== Extend phases / stages =====
ALTER TABLE public.phases
  ADD COLUMN IF NOT EXISTS is_terminal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS on_complete_action text NOT NULL DEFAULT 'next',
  ADD COLUMN IF NOT EXISTS target_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS on_complete_action text NOT NULL DEFAULT 'next',
  ADD COLUMN IF NOT EXISTS target_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notify_role text,
  ADD COLUMN IF NOT EXISTS notify_cadista boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP POLICY IF EXISTS phases_admin_write ON public.phases;
CREATE POLICY phases_admin_write ON public.phases FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
DROP POLICY IF EXISTS stages_admin_write ON public.stages;
CREATE POLICY stages_admin_write ON public.stages FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stages TO authenticated;

-- ===== Assignments =====
CREATE TABLE IF NOT EXISTS public.phase_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phase_assignments TO authenticated;
GRANT ALL ON public.phase_assignments TO service_role;
ALTER TABLE public.phase_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phase_assignments_select ON public.phase_assignments;
CREATE POLICY phase_assignments_select ON public.phase_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS phase_assignments_write ON public.phase_assignments;
CREATE POLICY phase_assignments_write ON public.phase_assignments FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

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
DROP POLICY IF EXISTS stage_assignments_select ON public.stage_assignments;
CREATE POLICY stage_assignments_select ON public.stage_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stage_assignments_write ON public.stage_assignments;
CREATE POLICY stage_assignments_write ON public.stage_assignments FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

-- ===== Return reasons =====
CREATE TABLE IF NOT EXISTS public.stage_return_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  position integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_return_reasons TO authenticated;
GRANT ALL ON public.stage_return_reasons TO service_role;
ALTER TABLE public.stage_return_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stage_return_reasons_select ON public.stage_return_reasons;
CREATE POLICY stage_return_reasons_select ON public.stage_return_reasons FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stage_return_reasons_write ON public.stage_return_reasons;
CREATE POLICY stage_return_reasons_write ON public.stage_return_reasons FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

INSERT INTO public.stage_return_reasons (label, position)
SELECT v.label, v.pos FROM (VALUES
  ('Ajuste solicitado pelo doutor', 10),
  ('Ajuste na prova do paciente', 20),
  ('Arquivo com problema', 30),
  ('Outro motivo', 40)
) AS v(label, pos)
WHERE NOT EXISTS (SELECT 1 FROM public.stage_return_reasons r WHERE r.label = v.label);

-- ===== Helpers =====
CREATE OR REPLACE FUNCTION public.user_can_advance(_user uuid, _phase_id uuid, _stage_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT user_id FROM public.stage_assignments WHERE _stage_id IS NOT NULL AND stage_id = _stage_id
  ), p AS (
    SELECT user_id FROM public.phase_assignments WHERE _phase_id IS NOT NULL AND phase_id = _phase_id
  )
  SELECT CASE
    WHEN _stage_id IS NOT NULL AND EXISTS (SELECT 1 FROM s) THEN EXISTS (SELECT 1 FROM s WHERE user_id = _user)
    WHEN _phase_id IS NOT NULL AND EXISTS (SELECT 1 FROM p) THEN EXISTS (SELECT 1 FROM p WHERE user_id = _user)
    ELSE TRUE END;
$$;

-- ===== Seed default workflow =====
CREATE OR REPLACE FUNCTION public.seed_default_workflow()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phase uuid;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT id INTO v_phase FROM public.phases ORDER BY position LIMIT 1;
  IF v_phase IS NULL THEN
    INSERT INTO public.phases (name, color, position) VALUES ('Fluxo', '#1F8AFF', 10)
    RETURNING id INTO v_phase;
  END IF;

  INSERT INTO public.stages (name, color, position, phase_id)
  SELECT v.name, v.color, v.pos, v_phase FROM (VALUES
    ('Novo caso', '#94a3b8', 10),
    ('Desenho', '#3b82f6', 20),
    ('Prova', '#f59e0b', 30),
    ('Confecção', '#8b5cf6', 40),
    ('Fresagem', '#06b6d4', 50),
    ('Acabamento', '#10b981', 60),
    ('Entregue', '#22c55e', 70)
  ) AS v(name, color, pos)
  WHERE NOT EXISTS (SELECT 1 FROM public.stages s WHERE s.name = v.name);

  UPDATE public.workflow_settings SET stages_enabled = true, progress_bar_enabled = true, updated_at = now() WHERE id = true;

  RETURN jsonb_build_object('success', true);
END $$;

-- ===== Advance =====
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur_stage RECORD; chosen RECORD;
  next_phase_id uuid; next_stage_id uuid;
  v_user uuid := auth.uid();
  v_next_stage_name text;
  r RECORD;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT (public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem avançar.');
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO chosen FROM public.stages WHERE id = _stage_id;
    IF chosen IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Etapa não encontrada'); END IF;
    IF chosen.on_complete_action = 'goto_phase' AND chosen.target_phase_id IS NOT NULL THEN
      next_phase_id := chosen.target_phase_id; next_stage_id := NULL;
    ELSIF chosen.on_complete_action = 'goto_stage' AND chosen.target_stage_id IS NOT NULL THEN
      SELECT phase_id INTO next_phase_id FROM public.stages WHERE id = chosen.target_stage_id;
      next_stage_id := chosen.target_stage_id;
    ELSE
      next_phase_id := chosen.phase_id;
      next_stage_id := chosen.id;
    END IF;
  ELSE
    IF c.current_stage_id IS NOT NULL THEN
      SELECT * INTO cur_stage FROM public.stages WHERE id = c.current_stage_id;
      SELECT id INTO next_stage_id FROM public.stages
        WHERE position > cur_stage.position ORDER BY position LIMIT 1;
    ELSE
      SELECT id INTO next_stage_id FROM public.stages ORDER BY position LIMIT 1;
    END IF;
    IF next_stage_id IS NOT NULL THEN
      SELECT phase_id INTO next_phase_id FROM public.stages WHERE id = next_stage_id;
    END IF;
  END IF;

  IF next_stage_id IS NULL AND next_phase_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa no fluxo.');
  END IF;

  UPDATE public.cases
     SET current_phase_id = COALESCE(next_phase_id, current_phase_id),
         current_stage_id = next_stage_id,
         updated_at = now()
   WHERE id = _case_id;

  SELECT name INTO v_next_stage_name FROM public.stages WHERE id = next_stage_id;

  -- Notifica responsáveis da nova etapa
  IF next_stage_id IS NOT NULL THEN
    FOR r IN SELECT user_id FROM public.stage_assignments WHERE stage_id = next_stage_id LOOP
      IF r.user_id <> v_user THEN
        INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
        VALUES (v_user, r.user_id, 'Caso avançou no fluxo',
                'Um caso chegou na etapa ' || COALESCE(v_next_stage_name, 'seguinte') || '.',
                'workflow', jsonb_build_object('case_id', _case_id, 'stage_id', next_stage_id));
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'phase_id', COALESCE(next_phase_id, c.current_phase_id), 'stage_id', next_stage_id);
END $$;

-- ===== Return =====
CREATE OR REPLACE FUNCTION public.return_case_workflow(
  _case_id uuid, _reason_id uuid DEFAULT NULL, _notes text DEFAULT NULL, _to_stage_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur_stage RECORD; target_stage uuid; v_user uuid := auth.uid();
  v_reason text; v_stage_name text; r RECORD;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT (public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem retornar o caso.');
  END IF;

  IF _to_stage_id IS NOT NULL THEN
    target_stage := _to_stage_id;
  ELSIF c.current_stage_id IS NOT NULL THEN
    SELECT * INTO cur_stage FROM public.stages WHERE id = c.current_stage_id;
    SELECT id INTO target_stage FROM public.stages
      WHERE position < cur_stage.position ORDER BY position DESC LIMIT 1;
  END IF;

  IF target_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há etapa anterior no fluxo.');
  END IF;

  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id = _reason_id;
  SELECT name INTO v_stage_name FROM public.stages WHERE id = target_stage;

  UPDATE public.cases
     SET current_stage_id = target_stage,
         current_phase_id = COALESCE((SELECT phase_id FROM public.stages WHERE id = target_stage), current_phase_id),
         updated_at = now()
   WHERE id = _case_id;

  INSERT INTO public.case_activity (case_id, actor_id, user_id, kind, message, metadata)
  VALUES (_case_id, v_user, v_user, 'workflow_return',
          'Caso retornado para ' || COALESCE(v_stage_name, 'etapa anterior')
            || COALESCE(' — ' || v_reason, '') || COALESCE(' (' || _notes || ')', ''),
          jsonb_build_object('reason_id', _reason_id, 'to_stage_id', target_stage));

  FOR r IN SELECT user_id FROM public.stage_assignments WHERE stage_id = target_stage LOOP
    IF r.user_id <> v_user THEN
      INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
      VALUES (v_user, r.user_id, 'Caso retornou para sua etapa',
              COALESCE(v_reason, 'Retorno de etapa') || COALESCE(': ' || _notes, ''),
              'workflow', jsonb_build_object('case_id', _case_id, 'stage_id', target_stage));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'stage_id', target_stage);
END $$;
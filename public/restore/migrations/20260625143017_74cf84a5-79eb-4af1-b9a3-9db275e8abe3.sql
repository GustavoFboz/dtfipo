
-- =========================================================
-- Simplificar workflow: uma única lista linear de "Etapas"
-- =========================================================

-- Achatamento: garante UMA fase "Fluxo" e move todas as stages
DO $$
DECLARE v_fluxo uuid;
BEGIN
  SELECT id INTO v_fluxo FROM public.phases ORDER BY position, created_at LIMIT 1;

  IF v_fluxo IS NULL THEN
    INSERT INTO public.phases (name, color, position, is_terminal, on_complete_action)
    VALUES ('Fluxo', '#1F8AFF', 10, false, 'next')
    RETURNING id INTO v_fluxo;
  ELSE
    UPDATE public.phases
       SET name='Fluxo', color='#1F8AFF', position=10,
           is_terminal=false, on_complete_action='next', target_phase_id=NULL
     WHERE id = v_fluxo;
  END IF;

  -- Reparenta todas as stages para a fase Fluxo
  UPDATE public.stages
     SET phase_id = v_fluxo,
         on_complete_action = 'next',
         target_phase_id = NULL,
         target_stage_id = NULL,
         notify_cadista = false;

  -- Casos apontam para a fase Fluxo
  UPDATE public.cases
     SET current_phase_id = v_fluxo
   WHERE current_phase_id IS NOT NULL OR current_stage_id IS NOT NULL;

  -- Remove fases antigas (já não há stages nem casos apontando para elas)
  DELETE FROM public.phase_assignments WHERE phase_id <> v_fluxo;
  DELETE FROM public.phases WHERE id <> v_fluxo;
END $$;

-- Renumera stages 10, 20, 30…
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) * 10 AS pos
  FROM public.stages
)
UPDATE public.stages s SET position = r.pos
FROM ranked r WHERE s.id = r.id;

-- Se não há stages, semeia o fluxo padrão simplificado
INSERT INTO public.stages (name, color, position, phase_id)
SELECT v.name, v.color, v.pos, (SELECT id FROM public.phases LIMIT 1)
FROM (VALUES
  ('Novo caso',          '#94a3b8', 10),
  ('Desenho',            '#3b82f6', 20),
  ('Prova interna',      '#f59e0b', 30),
  ('Impressão',          '#8b5cf6', 40),
  ('Acabamento interno', '#a855f7', 50),
  ('Prova do paciente',  '#ec4899', 60),
  ('Fresagem',           '#06b6d4', 70),
  ('Acabamento',         '#10b981', 80),
  ('Entregue',           '#22c55e', 90)
) v(name, color, pos)
WHERE NOT EXISTS (SELECT 1 FROM public.stages);

-- Casos sem etapa atual recebem a primeira etapa
UPDATE public.cases
   SET current_stage_id = (SELECT id FROM public.stages ORDER BY position LIMIT 1)
 WHERE current_phase_id IS NOT NULL AND current_stage_id IS NULL;

-- =========================================================
-- Tabela: motivos de retorno
-- =========================================================
CREATE TABLE IF NOT EXISTS public.stage_return_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  position int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stage_return_reasons TO authenticated;
GRANT ALL ON public.stage_return_reasons TO service_role;

ALTER TABLE public.stage_return_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_return_reasons" ON public.stage_return_reasons;
CREATE POLICY "read_return_reasons" ON public.stage_return_reasons
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_return_reasons" ON public.stage_return_reasons;
CREATE POLICY "admin_manage_return_reasons" ON public.stage_return_reasons
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

INSERT INTO public.stage_return_reasons (label, position)
VALUES ('Ajuste', 10)
ON CONFLICT (label) DO NOTHING;

-- =========================================================
-- RPC: advance_case_workflow (versão simplificada)
-- =========================================================
CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD; cur RECORD; next_stage RECORD;
  v_user uuid := auth.uid();
  v_case_label text;
  r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT (public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem avançar.');
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO next_stage FROM public.stages WHERE id = _stage_id;
  ELSIF c.current_stage_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;
    SELECT * INTO next_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position > cur.position
      ORDER BY position LIMIT 1;
  ELSE
    SELECT * INTO next_stage FROM public.stages ORDER BY position LIMIT 1;
  END IF;

  IF next_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa.');
  END IF;

  UPDATE public.cases
     SET current_stage_id = next_stage.id,
         current_phase_id = next_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  v_case_label := COALESCE(c.case_label, c.id::text);

  FOR r IN
    SELECT DISTINCT user_id AS u FROM public.stage_assignments
    WHERE stage_id = next_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Nova tarefa: ' || next_stage.name,
      'O caso ' || v_case_label || ' agora está em ' || next_stage.name || '.',
      'task_assigned',
      jsonb_build_object('case_id', _case_id, 'stage_id', next_stage.id)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', next_stage.phase_id, 'stage_id', next_stage.id);
END $$;

-- =========================================================
-- RPC: return_case_workflow (voltar com justificativa)
-- =========================================================
CREATE OR REPLACE FUNCTION public.return_case_workflow(_case_id uuid, _reason_id uuid, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD; cur RECORD; prev_stage RECORD;
  v_user uuid := auth.uid();
  v_reason text;
  v_case_label text;
  r record;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  IF NOT (public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem retroceder.');
  END IF;

  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id = _reason_id;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Justificativa inválida.');
  END IF;

  IF c.current_stage_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caso sem etapa atual.');
  END IF;

  SELECT * INTO cur FROM public.stages WHERE id = c.current_stage_id;

  -- "Ajuste" → volta direto para "Desenho" se existir
  IF v_reason ILIKE 'Ajuste%' THEN
    SELECT * INTO prev_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND name ILIKE 'Desenho%'
      ORDER BY position LIMIT 1;
  END IF;

  IF prev_stage IS NULL OR prev_stage.id = cur.id THEN
    SELECT * INTO prev_stage FROM public.stages
      WHERE phase_id = cur.phase_id AND position < cur.position
      ORDER BY position DESC LIMIT 1;
  END IF;

  IF prev_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há etapa anterior.');
  END IF;

  UPDATE public.cases
     SET current_stage_id = prev_stage.id,
         current_phase_id = prev_stage.phase_id,
         updated_at = now()
   WHERE id = _case_id;

  INSERT INTO public.case_activity (case_id, user_id, kind, content, mentions, metadata)
  VALUES (
    _case_id, v_user, 'workflow_return',
    'Retornou para ' || prev_stage.name || ' — ' || v_reason ||
      CASE WHEN _notes IS NOT NULL AND length(trim(_notes)) > 0 THEN ': ' || _notes ELSE '' END,
    ARRAY[]::uuid[],
    jsonb_build_object('from_stage_id', cur.id, 'to_stage_id', prev_stage.id, 'reason', v_reason, 'notes', _notes)
  );

  v_case_label := COALESCE(c.case_label, c.id::text);
  FOR r IN
    SELECT DISTINCT user_id AS u FROM public.stage_assignments
    WHERE stage_id = prev_stage.id AND user_id <> v_user
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type, metadata)
    VALUES (
      v_user, r.u,
      'Caso retornou: ' || prev_stage.name,
      'O caso ' || v_case_label || ' voltou para ' || prev_stage.name || ' (' || v_reason || ').',
      'workflow_back',
      jsonb_build_object('case_id', _case_id, 'stage_id', prev_stage.id, 'reason', v_reason)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'phase_id', prev_stage.phase_id, 'stage_id', prev_stage.id, 'reason', v_reason);
END $$;

-- =========================================================
-- RPC: seed_default_workflow (simplificado)
-- =========================================================
CREATE OR REPLACE FUNCTION public.seed_default_workflow()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_fluxo uuid;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT id INTO v_fluxo FROM public.phases ORDER BY position LIMIT 1;
  IF v_fluxo IS NULL THEN
    INSERT INTO public.phases (name, color, position) VALUES ('Fluxo', '#1F8AFF', 10) RETURNING id INTO v_fluxo;
  END IF;

  -- Remove tudo e recria limpo
  DELETE FROM public.stages WHERE phase_id = v_fluxo;

  INSERT INTO public.stages (name, color, position, phase_id)
  VALUES
    ('Novo caso',          '#94a3b8', 10, v_fluxo),
    ('Desenho',            '#3b82f6', 20, v_fluxo),
    ('Prova interna',      '#f59e0b', 30, v_fluxo),
    ('Impressão',          '#8b5cf6', 40, v_fluxo),
    ('Acabamento interno', '#a855f7', 50, v_fluxo),
    ('Prova do paciente',  '#ec4899', 60, v_fluxo),
    ('Fresagem',           '#06b6d4', 70, v_fluxo),
    ('Acabamento',         '#10b981', 80, v_fluxo),
    ('Entregue',           '#22c55e', 90, v_fluxo);

  -- Garante motivo "Ajuste"
  INSERT INTO public.stage_return_reasons (label, position)
  VALUES ('Ajuste', 10)
  ON CONFLICT (label) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END $$;

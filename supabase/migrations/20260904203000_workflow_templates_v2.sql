-- Dental Flow workflow templates v2
-- Four versioned workflows, case-safe updates and conditional sintering.

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS condition_key text,
  ADD COLUMN IF NOT EXISTS flow_key text,
  ADD COLUMN IF NOT EXISTS workflow_version integer,
  ADD COLUMN IF NOT EXISTS stage_key text;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS has_mockup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_provisional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workflow_key text,
  ADD COLUMN IF NOT EXISTS workflow_version integer;

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS requires_sintering boolean NOT NULL DEFAULT false;

UPDATE public.stock_items
   SET requires_sintering = true
 WHERE COALESCE(category::text, '') = 'zirconia'
    OR lower(COALESCE(name, '')) LIKE '%zirc%';

CREATE TABLE IF NOT EXISTS public.workflow_templates (
  flow_key text PRIMARY KEY,
  name text NOT NULL,
  active_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.workflow_templates TO authenticated;
GRANT ALL ON public.workflow_templates TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_templates_select ON public.workflow_templates;
CREATE POLICY workflow_templates_select ON public.workflow_templates
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.current_user_can_manage_workflow()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND (
         COALESCE(p.is_default_admin, false)
         OR upper(COALESCE(p.account_subtype, '')) IN ('ADMIN', 'CEO')
         OR upper(COALESCE(p.role::text, '')) = 'CEO'
       )
  );
$$;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_workflow() TO authenticated;

DROP POLICY IF EXISTS workflow_templates_write ON public.workflow_templates;
CREATE POLICY workflow_templates_write ON public.workflow_templates
  FOR ALL TO authenticated
  USING (public.current_user_can_manage_workflow())
  WITH CHECK (public.current_user_can_manage_workflow());

-- Restrict workflow definition editing to CEO/Admin/default-admin.
DROP POLICY IF EXISTS stages_admin_write ON public.stages;
CREATE POLICY stages_admin_write ON public.stages FOR ALL TO authenticated
  USING (public.current_user_can_manage_workflow())
  WITH CHECK (public.current_user_can_manage_workflow());

DROP POLICY IF EXISTS stage_assignments_write ON public.stage_assignments;
CREATE POLICY stage_assignments_write ON public.stage_assignments FOR ALL TO authenticated
  USING (public.current_user_can_manage_workflow())
  WITH CHECK (public.current_user_can_manage_workflow());

DROP POLICY IF EXISTS stage_return_reasons_write ON public.stage_return_reasons;
CREATE POLICY stage_return_reasons_write ON public.stage_return_reasons FOR ALL TO authenticated
  USING (public.current_user_can_manage_workflow())
  WITH CHECK (public.current_user_can_manage_workflow());

CREATE INDEX IF NOT EXISTS stages_workflow_lookup_idx
  ON public.stages(flow_key, workflow_version, position);
CREATE INDEX IF NOT EXISTS stages_workflow_stage_key_idx
  ON public.stages(flow_key, workflow_version, stage_key);

INSERT INTO public.workflow_templates(flow_key, name, active_version)
VALUES
  ('common', 'Caso comum', 1),
  ('provisional', 'Caso com provisório', 1),
  ('mockup', 'Caso com mockup', 1),
  ('mockup_provisional', 'Mockup + provisório', 1)
ON CONFLICT (flow_key) DO NOTHING;

-- Ensure a single phase exists for the linear workflow.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.phases) THEN
    INSERT INTO public.phases(name, color, position)
    VALUES ('Fluxo', '#1F8AFF', 10);
  END IF;
END $$;

-- Seed v1. Old unversioned stages are intentionally kept for history while
-- every case is remapped below.
WITH p AS (SELECT id FROM public.phases ORDER BY position LIMIT 1), seed(flow_key, stage_key, name, color, position, condition_key) AS (
  VALUES
  ('common','entry','Entrada','#64748b',10,NULL),
  ('common','cad','CAD','#3b82f6',20,NULL),
  ('common','cad_approval','Aprovação do CAD','#0ea5e9',30,NULL),
  ('common','definitive_make','Confecção do Definitivo','#8b5cf6',40,NULL),
  ('common','sintering','Sinterização','#f59e0b',50,'requires_sintering'),
  ('common','finish','Acabamento e Maquiagem','#ec4899',60,NULL),
  ('common','delivered','Entrega','#22c55e',70,NULL),

  ('provisional','entry','Entrada','#64748b',10,NULL),
  ('provisional','cad','CAD','#3b82f6',20,NULL),
  ('provisional','cad_approval','Aprovação do CAD','#0ea5e9',30,NULL),
  ('provisional','provisional_make','Confecção do Provisório','#a855f7',40,NULL),
  ('provisional','provisional_delivered','Provisório Entregue','#7c3aed',50,NULL),
  ('provisional','definitive_make','Confecção do Definitivo','#8b5cf6',60,NULL),
  ('provisional','sintering','Sinterização','#f59e0b',70,'requires_sintering'),
  ('provisional','finish','Acabamento e Maquiagem','#ec4899',80,NULL),
  ('provisional','delivered','Definitivo Entregue','#22c55e',90,NULL),

  ('mockup','entry','Entrada','#64748b',10,NULL),
  ('mockup','cad','CAD','#3b82f6',20,NULL),
  ('mockup','cad_approval','Aprovação do CAD','#0ea5e9',30,NULL),
  ('mockup','mockup_make','Confecção do Mockup','#14b8a6',40,NULL),
  ('mockup','mockup_delivered','Mockup Entregue','#0f766e',50,NULL),
  ('mockup','definitive_make','Confecção do Definitivo','#8b5cf6',60,NULL),
  ('mockup','sintering','Sinterização','#f59e0b',70,'requires_sintering'),
  ('mockup','finish','Acabamento e Maquiagem','#ec4899',80,NULL),
  ('mockup','delivered','Definitivo Entregue','#22c55e',90,NULL),

  ('mockup_provisional','entry','Entrada','#64748b',10,NULL),
  ('mockup_provisional','cad','CAD','#3b82f6',20,NULL),
  ('mockup_provisional','cad_approval','Aprovação do CAD','#0ea5e9',30,NULL),
  ('mockup_provisional','mockup_make','Confecção do Mockup','#14b8a6',40,NULL),
  ('mockup_provisional','mockup_delivered','Mockup Entregue','#0f766e',50,NULL),
  ('mockup_provisional','provisional_make','Confecção do Provisório','#a855f7',60,NULL),
  ('mockup_provisional','provisional_delivered','Provisório Entregue','#7c3aed',70,NULL),
  ('mockup_provisional','definitive_make','Confecção do Definitivo','#8b5cf6',80,NULL),
  ('mockup_provisional','sintering','Sinterização','#f59e0b',90,'requires_sintering'),
  ('mockup_provisional','finish','Acabamento e Maquiagem','#ec4899',100,NULL),
  ('mockup_provisional','delivered','Definitivo Entregue','#22c55e',110,NULL)
)
INSERT INTO public.stages(name, color, position, phase_id, flow_key, workflow_version, stage_key, condition_key)
SELECT s.name, s.color, s.position, p.id, s.flow_key, 1, s.stage_key, s.condition_key
FROM seed s CROSS JOIN p
WHERE NOT EXISTS (
  SELECT 1 FROM public.stages x
   WHERE x.flow_key = s.flow_key AND x.workflow_version = 1 AND x.stage_key = s.stage_key
);

ALTER TABLE public.stages ALTER COLUMN flow_key SET DEFAULT 'common';
ALTER TABLE public.stages ALTER COLUMN workflow_version SET DEFAULT 1;

CREATE OR REPLACE FUNCTION public.case_flow_key(_has_mockup boolean, _has_provisional boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(_has_mockup,false) AND COALESCE(_has_provisional,false) THEN 'mockup_provisional'
    WHEN COALESCE(_has_mockup,false) THEN 'mockup'
    WHEN COALESCE(_has_provisional,false) THEN 'provisional'
    ELSE 'common'
  END;
$$;
GRANT EXECUTE ON FUNCTION public.case_flow_key(boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.case_requires_sintering(_case_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v_result boolean := false;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN false; END IF;

  IF COALESCE(array_length(c.teeth_zirconia, 1), 0) > 0 THEN
    RETURN true;
  END IF;

  IF c.zirconia_stock_item_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stock_items s WHERE s.id = c.zirconia_stock_item_id AND s.requires_sintering
  ) THEN RETURN true; END IF;

  IF c.dissilicato_stock_item_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stock_items s WHERE s.id = c.dissilicato_stock_item_id AND s.requires_sintering
  ) THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.case_tooth_stock_usage u
      JOIN public.stock_items s ON s.id = u.stock_item_id
     WHERE u.case_id = _case_id
       AND u.reversed_at IS NULL
       AND s.requires_sintering
  ) INTO v_result;
  RETURN COALESCE(v_result, false);
END $$;
GRANT EXECUTE ON FUNCTION public.case_requires_sintering(uuid) TO authenticated;

-- Map an old/unversioned stage to a semantic key.
CREATE OR REPLACE FUNCTION public.workflow_stage_semantic_key(_name text, _position integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n text := lower(COALESCE(_name,''));
BEGIN
  IF n LIKE '%mockup%' AND n LIKE '%entreg%' THEN RETURN 'mockup_delivered'; END IF;
  IF n LIKE '%mockup%' THEN RETURN 'mockup_make'; END IF;
  IF (n LIKE '%provis%' OR n LIKE '%provisor%') AND n LIKE '%entreg%' THEN RETURN 'provisional_delivered'; END IF;
  IF n LIKE '%provis%' OR n LIKE '%provisor%' THEN RETURN 'provisional_make'; END IF;
  IF n LIKE '%entrada%' OR n LIKE '%novo%' THEN RETURN 'entry'; END IF;
  IF n LIKE '%aprova%' OR n LIKE '%prova%' THEN RETURN 'cad_approval'; END IF;
  IF n = 'cad' OR n LIKE '%desenho%' THEN RETURN 'cad'; END IF;
  IF n LIKE '%sinter%' OR n LIKE '%forno%' OR n LIKE '%fresag%' THEN RETURN 'sintering'; END IF;
  IF n LIKE '%acab%' OR n LIKE '%maqui%' THEN RETURN 'finish'; END IF;
  IF n LIKE '%entreg%' THEN RETURN 'delivered'; END IF;
  IF n LIKE '%confe%' OR n LIKE '%definit%' THEN RETURN 'definitive_make'; END IF;
  IF COALESCE(_position,0) <= 10 THEN RETURN 'entry';
  ELSIF _position <= 20 THEN RETURN 'cad';
  ELSIF _position <= 30 THEN RETURN 'cad_approval';
  ELSIF _position <= 45 THEN RETURN 'definitive_make';
  ELSIF _position <= 55 THEN RETURN 'sintering';
  ELSIF _position <= 65 THEN RETURN 'finish';
  ELSE RETURN 'delivered'; END IF;
END $$;

-- Attach every existing case to v1 and preserve its nearest semantic progress.
UPDATE public.cases c
   SET workflow_key = public.case_flow_key(c.has_mockup, c.has_provisional),
       workflow_version = 1;

UPDATE public.cases c
   SET current_stage_id = (
         SELECT ns.id
           FROM public.stages old_stage
           JOIN public.stages ns
             ON ns.flow_key = public.case_flow_key(c.has_mockup, c.has_provisional)
            AND ns.workflow_version = 1
            AND ns.stage_key = public.workflow_stage_semantic_key(old_stage.name, old_stage.position)
          WHERE old_stage.id = c.current_stage_id
          LIMIT 1
       ),
       current_phase_id = COALESCE((
         SELECT ns.phase_id
           FROM public.stages old_stage
           JOIN public.stages ns
             ON ns.flow_key = public.case_flow_key(c.has_mockup, c.has_provisional)
            AND ns.workflow_version = 1
            AND ns.stage_key = public.workflow_stage_semantic_key(old_stage.name, old_stage.position)
          WHERE old_stage.id = c.current_stage_id
          LIMIT 1
       ), c.current_phase_id)
 WHERE EXISTS (
   SELECT 1 FROM public.stages old_stage
    WHERE old_stage.id = c.current_stage_id AND old_stage.flow_key IS NULL
 );

-- Cases without a current stage start at Entrada of their assigned workflow.
UPDATE public.cases c
   SET current_stage_id = s.id,
       current_phase_id = s.phase_id
  FROM public.stages s
 WHERE c.current_stage_id IS NULL
   AND s.flow_key = c.workflow_key
   AND s.workflow_version = c.workflow_version
   AND s.stage_key = 'entry';

CREATE OR REPLACE FUNCTION public.assign_case_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
  v_version integer;
  v_stage_key text;
  v_stage RECORD;
BEGIN
  v_key := public.case_flow_key(NEW.has_mockup, NEW.has_provisional);
  SELECT active_version INTO v_version FROM public.workflow_templates WHERE flow_key = v_key;
  v_version := COALESCE(v_version, 1);

  IF TG_OP = 'INSERT' THEN
    NEW.workflow_key := v_key;
    NEW.workflow_version := v_version;
    SELECT * INTO v_stage FROM public.stages
     WHERE flow_key = v_key AND workflow_version = v_version AND stage_key = 'entry'
     ORDER BY position LIMIT 1;
    IF v_stage IS NOT NULL THEN
      NEW.current_stage_id := v_stage.id;
      NEW.current_phase_id := v_stage.phase_id;
    END IF;
  ELSIF NEW.workflow_key IS DISTINCT FROM v_key
     OR NEW.workflow_version IS NULL
     OR OLD.has_mockup IS DISTINCT FROM NEW.has_mockup
     OR OLD.has_provisional IS DISTINCT FROM NEW.has_provisional THEN
    SELECT stage_key INTO v_stage_key FROM public.stages WHERE id = OLD.current_stage_id;
    NEW.workflow_key := v_key;
    NEW.workflow_version := v_version;
    SELECT * INTO v_stage FROM public.stages
     WHERE flow_key = v_key AND workflow_version = v_version
       AND stage_key = COALESCE(v_stage_key, 'entry')
     ORDER BY position LIMIT 1;
    IF v_stage IS NULL THEN
      SELECT * INTO v_stage FROM public.stages
       WHERE flow_key = v_key AND workflow_version = v_version AND stage_key = 'entry'
       ORDER BY position LIMIT 1;
    END IF;
    IF v_stage IS NOT NULL THEN
      NEW.current_stage_id := v_stage.id;
      NEW.current_phase_id := v_stage.phase_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_case_workflow ON public.cases;
CREATE TRIGGER trg_assign_case_workflow
BEFORE INSERT OR UPDATE OF has_mockup, has_provisional ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.assign_case_workflow();

CREATE OR REPLACE FUNCTION public.save_workflow_template(
  _flow_key text,
  _stages jsonb,
  _apply_open boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_version integer;
  v_new_version integer;
  v_phase uuid;
  item jsonb;
  v_new_stage uuid;
  v_source uuid;
  v_count integer := 0;
  c RECORD;
  v_current_key text;
  v_current_pos integer;
  v_target RECORD;
BEGIN
  IF NOT public.current_user_can_manage_workflow() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas Admin/CEO podem editar fluxos.');
  END IF;
  IF _flow_key NOT IN ('common','provisional','mockup','mockup_provisional') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fluxo inválido.');
  END IF;
  IF jsonb_typeof(_stages) <> 'array' OR jsonb_array_length(_stages) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'O fluxo precisa ter pelo menos duas etapas.');
  END IF;

  SELECT active_version INTO v_old_version FROM public.workflow_templates WHERE flow_key = _flow_key FOR UPDATE;
  v_old_version := COALESCE(v_old_version, 0);
  v_new_version := v_old_version + 1;
  SELECT id INTO v_phase FROM public.phases ORDER BY position LIMIT 1;

  FOR item IN SELECT * FROM jsonb_array_elements(_stages) LOOP
    v_count := v_count + 1;
    v_source := NULLIF(item->>'source_id','')::uuid;
    INSERT INTO public.stages(
      name, color, position, phase_id, flow_key, workflow_version, stage_key,
      condition_key, requirements, requires_implant_components
    ) VALUES (
      trim(COALESCE(item->>'name','Etapa')),
      COALESCE(NULLIF(item->>'color',''), '#94a3b8'),
      COALESCE((item->>'position')::integer, v_count * 10),
      v_phase,
      _flow_key,
      v_new_version,
      COALESCE(NULLIF(item->>'stage_key',''), 'custom_' || v_count::text),
      NULLIF(item->>'condition_key',''),
      COALESCE(item->'requirements', '[]'::jsonb),
      COALESCE((item->>'requires_implant_components')::boolean, false)
    ) RETURNING id INTO v_new_stage;

    IF v_source IS NOT NULL THEN
      INSERT INTO public.stage_assignments(stage_id, user_id)
      SELECT v_new_stage, a.user_id FROM public.stage_assignments a
       WHERE a.stage_id = v_source
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.workflow_templates
     SET active_version = v_new_version, updated_at = now(), updated_by = auth.uid()
   WHERE flow_key = _flow_key;

  IF _apply_open THEN
    FOR c IN
      SELECT id, current_stage_id
        FROM public.cases
       WHERE workflow_key = _flow_key
         AND finished_at IS NULL
         AND COALESCE(status,'') NOT IN ('finalizado','finished','arquivado','cancelado','deleted')
    LOOP
      SELECT stage_key, position INTO v_current_key, v_current_pos
        FROM public.stages WHERE id = c.current_stage_id;
      SELECT id, phase_id INTO v_target
        FROM public.stages
       WHERE flow_key = _flow_key AND workflow_version = v_new_version
         AND stage_key = v_current_key
       ORDER BY position LIMIT 1;
      IF v_target IS NULL THEN
        SELECT id, phase_id INTO v_target
          FROM public.stages
         WHERE flow_key = _flow_key AND workflow_version = v_new_version
         ORDER BY abs(position - COALESCE(v_current_pos,10)), position
         LIMIT 1;
      END IF;
      UPDATE public.cases
         SET workflow_version = v_new_version,
             current_stage_id = v_target.id,
             current_phase_id = v_target.phase_id,
             updated_at = now()
       WHERE id = c.id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'flow_key', _flow_key,
    'version', v_new_version,
    'applied_open_cases', _apply_open
  );
END $$;
GRANT EXECUTE ON FUNCTION public.save_workflow_template(text,jsonb,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.workflow_default_stages(_flow_key text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _flow_key
    WHEN 'common' THEN '[{"stage_key":"entry","name":"Entrada","color":"#64748b","position":10},{"stage_key":"cad","name":"CAD","color":"#3b82f6","position":20},{"stage_key":"cad_approval","name":"Aprovação do CAD","color":"#0ea5e9","position":30},{"stage_key":"definitive_make","name":"Confecção do Definitivo","color":"#8b5cf6","position":40},{"stage_key":"sintering","name":"Sinterização","color":"#f59e0b","position":50,"condition_key":"requires_sintering"},{"stage_key":"finish","name":"Acabamento e Maquiagem","color":"#ec4899","position":60},{"stage_key":"delivered","name":"Entrega","color":"#22c55e","position":70}]'::jsonb
    WHEN 'provisional' THEN '[{"stage_key":"entry","name":"Entrada","color":"#64748b","position":10},{"stage_key":"cad","name":"CAD","color":"#3b82f6","position":20},{"stage_key":"cad_approval","name":"Aprovação do CAD","color":"#0ea5e9","position":30},{"stage_key":"provisional_make","name":"Confecção do Provisório","color":"#a855f7","position":40},{"stage_key":"provisional_delivered","name":"Provisório Entregue","color":"#7c3aed","position":50},{"stage_key":"definitive_make","name":"Confecção do Definitivo","color":"#8b5cf6","position":60},{"stage_key":"sintering","name":"Sinterização","color":"#f59e0b","position":70,"condition_key":"requires_sintering"},{"stage_key":"finish","name":"Acabamento e Maquiagem","color":"#ec4899","position":80},{"stage_key":"delivered","name":"Definitivo Entregue","color":"#22c55e","position":90}]'::jsonb
    WHEN 'mockup' THEN '[{"stage_key":"entry","name":"Entrada","color":"#64748b","position":10},{"stage_key":"cad","name":"CAD","color":"#3b82f6","position":20},{"stage_key":"cad_approval","name":"Aprovação do CAD","color":"#0ea5e9","position":30},{"stage_key":"mockup_make","name":"Confecção do Mockup","color":"#14b8a6","position":40},{"stage_key":"mockup_delivered","name":"Mockup Entregue","color":"#0f766e","position":50},{"stage_key":"definitive_make","name":"Confecção do Definitivo","color":"#8b5cf6","position":60},{"stage_key":"sintering","name":"Sinterização","color":"#f59e0b","position":70,"condition_key":"requires_sintering"},{"stage_key":"finish","name":"Acabamento e Maquiagem","color":"#ec4899","position":80},{"stage_key":"delivered","name":"Definitivo Entregue","color":"#22c55e","position":90}]'::jsonb
    WHEN 'mockup_provisional' THEN '[{"stage_key":"entry","name":"Entrada","color":"#64748b","position":10},{"stage_key":"cad","name":"CAD","color":"#3b82f6","position":20},{"stage_key":"cad_approval","name":"Aprovação do CAD","color":"#0ea5e9","position":30},{"stage_key":"mockup_make","name":"Confecção do Mockup","color":"#14b8a6","position":40},{"stage_key":"mockup_delivered","name":"Mockup Entregue","color":"#0f766e","position":50},{"stage_key":"provisional_make","name":"Confecção do Provisório","color":"#a855f7","position":60},{"stage_key":"provisional_delivered","name":"Provisório Entregue","color":"#7c3aed","position":70},{"stage_key":"definitive_make","name":"Confecção do Definitivo","color":"#8b5cf6","position":80},{"stage_key":"sintering","name":"Sinterização","color":"#f59e0b","position":90,"condition_key":"requires_sintering"},{"stage_key":"finish","name":"Acabamento e Maquiagem","color":"#ec4899","position":100},{"stage_key":"delivered","name":"Definitivo Entregue","color":"#22c55e","position":110}]'::jsonb
    ELSE '[]'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION public.reset_default_workflows(_apply_open boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; r jsonb;
BEGIN
  IF NOT public.current_user_can_manage_workflow() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas Admin/CEO podem restaurar fluxos.');
  END IF;
  FOREACH k IN ARRAY ARRAY['common','provisional','mockup','mockup_provisional'] LOOP
    r := public.save_workflow_template(k, public.workflow_default_stages(k), _apply_open);
    IF COALESCE((r->>'success')::boolean,false) = false THEN RETURN r; END IF;
  END LOOP;
  UPDATE public.workflow_settings SET phases_enabled=true, stages_enabled=true, progress_bar_enabled=true, updated_at=now() WHERE id=true;
  RETURN jsonb_build_object('success', true, 'applied_open_cases', _apply_open);
END $$;
GRANT EXECUTE ON FUNCTION public.reset_default_workflows(boolean) TO authenticated;

-- Backward-compatible button/RPC name.
CREATE OR REPLACE FUNCTION public.seed_default_workflow()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.reset_default_workflows(false);
END $$;

-- Enforce the case's own version and condition when advancing.
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
    SELECT * INTO chosen FROM public.stages
     WHERE id = _stage_id AND flow_key = c.workflow_key AND workflow_version = c.workflow_version;
    IF chosen IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Etapa não pertence ao fluxo ativo deste caso.'); END IF;
    IF chosen.condition_key = 'requires_sintering' AND NOT public.case_requires_sintering(_case_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Este caso não requer sinterização.');
    END IF;
    next_phase_id := chosen.phase_id;
    next_stage_id := chosen.id;
  ELSE
    SELECT * INTO cur_stage FROM public.stages WHERE id = c.current_stage_id;
    SELECT id, phase_id INTO next_stage_id, next_phase_id
      FROM public.stages
     WHERE flow_key = c.workflow_key AND workflow_version = c.workflow_version
       AND position > COALESCE(cur_stage.position,0)
       AND (condition_key IS DISTINCT FROM 'requires_sintering' OR public.case_requires_sintering(_case_id))
     ORDER BY position LIMIT 1;
  END IF;

  IF next_stage_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa no fluxo.');
  END IF;

  UPDATE public.cases SET current_phase_id=next_phase_id, current_stage_id=next_stage_id, updated_at=now() WHERE id=_case_id;
  SELECT name INTO v_next_stage_name FROM public.stages WHERE id=next_stage_id;
  FOR r IN SELECT user_id FROM public.stage_assignments WHERE stage_id=next_stage_id LOOP
    IF r.user_id <> v_user THEN
      INSERT INTO public.notifications(sender_id,recipient_id,title,content,type,metadata)
      VALUES(v_user,r.user_id,'Caso avançou no fluxo','Um caso chegou na etapa '||COALESCE(v_next_stage_name,'seguinte')||'.','workflow',jsonb_build_object('case_id',_case_id,'stage_id',next_stage_id));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success',true,'phase_id',next_phase_id,'stage_id',next_stage_id);
END $$;

CREATE OR REPLACE FUNCTION public.return_case_workflow(
  _case_id uuid, _reason_id uuid DEFAULT NULL, _notes text DEFAULT NULL, _to_stage_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; cur_stage RECORD; target RECORD; v_user uuid:=auth.uid();
  v_reason text; v_stage_name text; r RECORD;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id=_case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success',false,'error','Caso não encontrado'); END IF;
  IF NOT (public.user_can_advance(v_user,c.current_phase_id,c.current_stage_id) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success',false,'error','Apenas os responsáveis por esta etapa podem retornar o caso.');
  END IF;

  IF _to_stage_id IS NOT NULL THEN
    SELECT * INTO target FROM public.stages
     WHERE id=_to_stage_id AND flow_key=c.workflow_key AND workflow_version=c.workflow_version;
  ELSE
    SELECT * INTO cur_stage FROM public.stages WHERE id=c.current_stage_id;
    SELECT * INTO target FROM public.stages
     WHERE flow_key=c.workflow_key AND workflow_version=c.workflow_version
       AND position < COALESCE(cur_stage.position,2147483647)
       AND (condition_key IS DISTINCT FROM 'requires_sintering' OR public.case_requires_sintering(_case_id))
     ORDER BY position DESC LIMIT 1;
  END IF;
  IF target IS NULL THEN RETURN jsonb_build_object('success',false,'error','Não há etapa anterior válida no fluxo.'); END IF;

  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id=_reason_id;
  v_stage_name := target.name;
  UPDATE public.cases SET current_stage_id=target.id,current_phase_id=target.phase_id,updated_at=now() WHERE id=_case_id;
  INSERT INTO public.case_activity(case_id,actor_id,user_id,kind,message,metadata)
  VALUES(_case_id,v_user,v_user,'workflow_return','Caso retornado para '||COALESCE(v_stage_name,'etapa anterior')||COALESCE(' — '||v_reason,'')||COALESCE(' ('||_notes||')',''),jsonb_build_object('reason_id',_reason_id,'to_stage_id',target.id));
  FOR r IN SELECT user_id FROM public.stage_assignments WHERE stage_id=target.id LOOP
    IF r.user_id <> v_user THEN
      INSERT INTO public.notifications(sender_id,recipient_id,title,content,type,metadata)
      VALUES(v_user,r.user_id,'Caso retornou para sua etapa',COALESCE(v_reason,'Retorno de etapa')||COALESCE(': '||_notes,''),'workflow',jsonb_build_object('case_id',_case_id,'stage_id',target.id));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success',true,'phase_id',target.phase_id,'stage_id',target.id);
END $$;

-- Keep generated schema cache responsive after the migration.
NOTIFY pgrst, 'reload schema';

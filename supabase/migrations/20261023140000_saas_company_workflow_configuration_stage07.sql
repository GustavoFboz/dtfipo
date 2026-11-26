-- Company-owned workflow definitions. Existing IPO IDs and case progress stay intact.
-- case_types/tooth_colors are confirmed original dictionaries, shared read-only.
ALTER TABLE public.case_types ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
-- Some historical schema bundles added these only in the final self-heal.
-- Provisioning the versioned defaults needs the canonical columns beforehand.
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['phases','stages','phase_assignments','stage_assignments',
 'stage_return_reasons','workflow_templates','workflow_settings'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE RESTRICT',t);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN clinic_id SET DEFAULT public.saas_company_current_id()',t);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(clinic_id)',t||'_company_idx',t);
 END LOOP;
END $$;

-- Older restores had a globally unique return-reason label.
ALTER TABLE public.stage_return_reasons DROP CONSTRAINT IF EXISTS stage_return_reasons_label_key;
CREATE INDEX IF NOT EXISTS stage_return_reasons_company_label_idx ON public.stage_return_reasons(clinic_id,label);
-- The old singleton/global keys must not collide between companies. The old
-- business columns remain unchanged. Null legacy rows in schema-only restores
-- remain quarantined; provisioning never copies them into a new company.
ALTER TABLE public.workflow_templates ADD COLUMN IF NOT EXISTS company_config_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.workflow_templates DROP CONSTRAINT IF EXISTS workflow_templates_pkey;
ALTER TABLE public.workflow_templates ADD PRIMARY KEY(company_config_id);
ALTER TABLE public.workflow_templates ADD CONSTRAINT workflow_templates_company_flow_key UNIQUE(clinic_id,flow_key);

-- Match the existing case/storage authority: requester, then patient,
-- then explicitly assigned professionals. Patient ownership remains separate.
CREATE OR REPLACE FUNCTION public.saas_case_company_id(_case uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.resolve_case_clinic_id(_case);
$$;

DO $$ DECLARE t text; state jsonb; states jsonb; ipo uuid:='ea00a3cd-6816-42f4-845d-56468c77414e'; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.clinics WHERE id=ipo AND billing_exempt) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.cases WHERE public.saas_case_company_id(id) IS DISTINCT FROM ipo)
  OR EXISTS(SELECT 1 FROM public.stage_assignments a LEFT JOIN public.profiles p ON p.id=a.user_id WHERE p.clinic_id IS DISTINCT FROM ipo)
  OR EXISTS(SELECT 1 FROM public.phase_assignments a LEFT JOIN public.profiles p ON p.id=a.user_id WHERE p.clinic_id IS DISTINCT FROM ipo) THEN
  RAISE EXCEPTION 'WORKFLOW_LEGACY_PROVENANCE_REQUIRES_REVIEW';
 END IF;
 FOREACH t IN ARRAY ARRAY['phases','stages','phase_assignments','stage_assignments',
 'stage_return_reasons','workflow_templates','workflow_settings'] LOOP
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name',tgname,'state',tgenabled)),'[]') INTO states
   FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND NOT tgisinternal;
  FOR state IN SELECT * FROM jsonb_array_elements(states) LOOP
   EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I',t,state->>'name');
  END LOOP;
  EXECUTE format('UPDATE public.%I SET clinic_id=$1 WHERE clinic_id IS NULL',t) USING ipo;
  FOR state IN SELECT * FROM jsonb_array_elements(states) LOOP
   EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I',t,
    CASE state->>'state' WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,state->>'name');
  END LOOP;
 END LOOP;
END $$;

-- A schema-only restore has one unowned singleton, retained privately rather
-- than assigned to the first customer. Live IPO settings were scoped above.
CREATE TABLE public.saas_legacy_workflow_settings_archive(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),original_row jsonb NOT NULL,archived_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.saas_legacy_workflow_settings_archive ENABLE ROW LEVEL SECURITY;
INSERT INTO public.saas_legacy_workflow_settings_archive(original_row)
 SELECT to_jsonb(w) FROM public.workflow_settings w WHERE clinic_id IS NULL;
DELETE FROM public.workflow_settings WHERE clinic_id IS NULL;
ALTER TABLE public.workflow_settings DROP CONSTRAINT IF EXISTS workflow_settings_pkey;
ALTER TABLE public.workflow_settings ADD PRIMARY KEY(clinic_id,id);
-- Existing installed clients keep their old singleton upsert: the newly
-- recognized composite key and default company now resolve it to their company.

CREATE OR REPLACE FUNCTION public.saas_company_can_manage_workflow(_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.saas_company_can_manage_people(_clinic) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
  AND (COALESCE(p.is_default_admin,false) OR upper(COALESCE(p.account_subtype,'')) IN ('CEO','ADMIN') OR upper(COALESCE(p.role,''))='CEO'));
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_manage_workflow()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.saas_company_can_manage_workflow(public.saas_company_current_id());
$$;

-- Explicit collaboration can read the definitions needed by its authorized
-- case, including historical versions. It never grants definition management.
CREATE OR REPLACE FUNCTION public.saas_can_read_workflow_company(_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.saas_company_can_read(_clinic) OR EXISTS(SELECT 1 FROM public.cases c
  WHERE public.saas_case_company_id(c.id)=_clinic AND public.can_modify_case(c.id));
$$;

-- Uncorrelated policy subqueries collect explicit foreign-case definitions
-- once per statement instead of resolving access separately for every stage.
CREATE OR REPLACE FUNCTION public.saas_shared_workflow_stage_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH authorized AS MATERIALIZED (
  SELECT c.id,c.current_stage_id,c.workflow_key,c.workflow_version,
   COALESCE(r.clinic_id,p.clinic_id,cp.clinic_id,dp.clinic_id) AS company
  FROM public.cases c LEFT JOIN public.profiles r ON r.id=c.requested_by
  LEFT JOIN public.patients p ON p.id=c.patient_id
  LEFT JOIN public.cadistas cd ON cd.id=c.cadista_id LEFT JOIN public.profiles cp ON cp.id=cd.user_id
  LEFT JOIN public.doctors dd ON dd.id=c.doctor_id LEFT JOIN public.profiles dp ON dp.id=dd.user_id
  WHERE (cd.user_id=auth.uid() OR dd.user_id=auth.uid())
   AND COALESCE(r.clinic_id,p.clinic_id,cp.clinic_id,dp.clinic_id) IS DISTINCT FROM public.saas_company_current_id()
   AND public.can_access_case(c.id)
 )
 SELECT COALESCE(array_agg(DISTINCT s.id),'{}'::uuid[]) FROM public.stages s JOIN authorized a ON s.clinic_id=a.company
  AND (s.id=a.current_stage_id OR (s.flow_key=a.workflow_key AND s.workflow_version=a.workflow_version)
   OR EXISTS(SELECT 1 FROM public.case_stages cs WHERE cs.case_id=a.id AND cs.stage_id=s.id));
$$;
CREATE OR REPLACE FUNCTION public.saas_shared_workflow_phase_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(array_agg(DISTINCT phase_id) FILTER(WHERE phase_id IS NOT NULL),'{}'::uuid[])
 FROM public.stages WHERE id=ANY(public.saas_shared_workflow_stage_ids());
$$;

CREATE OR REPLACE FUNCTION public.saas_guard_workflow_configuration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; c uuid; parent uuid; parent_company uuid; uid uuid;
 trusted boolean:=public.saas_company_trusted_backend(); bootstrapping boolean;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 c:=COALESCE(NULLIF(r->>'clinic_id','')::uuid,public.saas_company_current_id());
 bootstrapping:=pg_trigger_depth()>1 AND EXISTS(SELECT 1 FROM public.clinics WHERE id=c AND owner_id=auth.uid());
 IF c IS NULL THEN
  IF trusted AND TG_OP='UPDATE' AND OLD.clinic_id IS NULL AND NEW.clinic_id IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'WORKFLOW_COMPANY_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND OLD.clinic_id IS DISTINCT FROM c THEN
  RAISE EXCEPTION 'WORKFLOW_COMPANY_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 IF NOT trusted AND NOT bootstrapping AND NOT public.saas_company_can_manage_workflow(c) THEN
  RAISE EXCEPTION 'WORKFLOW_COMPANY_WRITE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN
  IF NOT trusted AND TG_TABLE_NAME='stages' AND (EXISTS(SELECT 1 FROM public.cases WHERE current_stage_id=(r->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM public.case_stages WHERE stage_id=(r->>'id')::uuid)) THEN RAISE EXCEPTION 'WORKFLOW_DEFINITION_IN_USE' USING ERRCODE='42501'; END IF;
  IF NOT trusted AND TG_TABLE_NAME='phases' AND (EXISTS(SELECT 1 FROM public.cases WHERE current_phase_id=(r->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM public.stages WHERE phase_id=(r->>'id')::uuid)) THEN RAISE EXCEPTION 'WORKFLOW_DEFINITION_IN_USE' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 END IF;
 IF TG_TABLE_NAME IN ('stages','phase_assignments') THEN
  parent:=NULLIF(r->>'phase_id','')::uuid;
  IF parent IS NOT NULL THEN
   SELECT clinic_id INTO parent_company FROM public.phases WHERE id=parent;
   IF parent_company IS DISTINCT FROM c THEN RAISE EXCEPTION 'FOREIGN_WORKFLOW_PHASE' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='stage_assignments' THEN
  SELECT clinic_id INTO parent_company FROM public.stages WHERE id=(r->>'stage_id')::uuid;
  IF parent_company IS DISTINCT FROM c THEN RAISE EXCEPTION 'FOREIGN_WORKFLOW_STAGE' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('phase_assignments','stage_assignments') THEN
  uid:=(r->>'user_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND clinic_id=c) THEN
   RAISE EXCEPTION 'FOREIGN_WORKFLOW_ASSIGNEE' USING ERRCODE='42501';
  END IF;
 END IF;
 parent:=NULLIF(r->>'target_phase_id','')::uuid;
 IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.phases WHERE id=parent AND clinic_id=c) THEN
  RAISE EXCEPTION 'FOREIGN_WORKFLOW_TARGET_PHASE' USING ERRCODE='42501';
 END IF;
 parent:=NULLIF(r->>'target_stage_id','')::uuid;
 IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stages WHERE id=parent AND clinic_id=c) THEN
  RAISE EXCEPTION 'FOREIGN_WORKFLOW_TARGET_STAGE' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='workflow_templates' AND NULLIF(r->>'updated_by','') IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(r->>'updated_by')::uuid AND clinic_id=c) THEN
  RAISE EXCEPTION 'FOREIGN_WORKFLOW_AUTHOR' USING ERRCODE='42501';
 END IF;
 NEW.clinic_id:=c;
 RETURN NEW;
END $$;

DO $$ DECLARE t text; q text; w text; BEGIN
 FOREACH t IN ARRAY ARRAY['phases','stages','phase_assignments','stage_assignments',
 'stage_return_reasons','workflow_templates','workflow_settings'] LOOP
  q:=CASE
   WHEN t IN ('workflow_templates','workflow_settings') THEN 'public.saas_company_can_read(clinic_id)'
   WHEN t='stages' THEN 'public.saas_company_can_read(clinic_id) OR id IN (SELECT unnest(public.saas_shared_workflow_stage_ids()))'
   WHEN t='phases' THEN 'public.saas_company_can_read(clinic_id) OR id IN (SELECT unnest(public.saas_shared_workflow_phase_ids()))'
   WHEN t='stage_assignments' THEN 'public.saas_company_can_read(clinic_id) OR stage_id IN (SELECT unnest(public.saas_shared_workflow_stage_ids()))'
   WHEN t='phase_assignments' THEN 'public.saas_company_can_read(clinic_id) OR phase_id IN (SELECT unnest(public.saas_shared_workflow_phase_ids()))'
   ELSE 'public.saas_can_read_workflow_company(clinic_id)' END;
  w:='public.saas_company_can_manage_workflow(clinic_id)';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY saas_workflow_company_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (clinic_id=public.saas_company_current_id())',t,q);
  EXECUTE format('CREATE POLICY saas_workflow_insert_boundary ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',t,w);
  EXECUTE format('CREATE POLICY saas_workflow_update_boundary ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',t,w,w);
  EXECUTE format('CREATE POLICY saas_workflow_delete_boundary ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',t,w);
  EXECUTE format('CREATE POLICY saas_workflow_company_read ON public.%I FOR SELECT TO authenticated USING (%s)',t,q);
  EXECUTE format('CREATE POLICY saas_workflow_company_write ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',t,w,w);
  EXECUTE format('CREATE TRIGGER aaa_saas_workflow_company_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.saas_guard_workflow_configuration()',t);
 END LOOP;
 -- These dictionaries have no customer-specific rows: five original case
 -- types and twenty original shade codes, verified before live application.
 FOREACH t IN ARRAY ARRAY['case_types','tooth_colors'] LOOP
  EXECUTE format('CREATE POLICY saas_dictionary_insert_boundary ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false)',t);
  EXECUTE format('CREATE POLICY saas_dictionary_update_boundary ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false)',t);
  EXECUTE format('CREATE POLICY saas_dictionary_delete_boundary ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(false)',t);
  EXECUTE format('CREATE POLICY saas_dictionary_company_read ON public.%I FOR SELECT TO authenticated USING(public.saas_company_can_read(public.saas_company_current_id()))',t);
 END LOOP;
END $$;

-- Initial company configuration comes exclusively from repository defaults,
-- never from IPO's phases, assignees, reasons, settings or later versions.
CREATE OR REPLACE FUNCTION public.saas_seed_company_workflow(_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; item jsonb; phase uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.clinics WHERE id=_clinic) THEN RAISE EXCEPTION 'WORKFLOW_COMPANY_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.workflow_templates WHERE clinic_id=_clinic) THEN RETURN; END IF;
 IF NOT public.saas_company_trusted_backend() AND NOT (pg_trigger_depth()>0 AND EXISTS(SELECT 1 FROM public.clinics WHERE id=_clinic AND owner_id=auth.uid())) THEN
  RAISE EXCEPTION 'WORKFLOW_SEED_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.phases(name,color,position,clinic_id) VALUES('Fluxo','#1F8AFF',10,_clinic) RETURNING id INTO phase;
 INSERT INTO public.workflow_settings(id,phases_enabled,stages_enabled,auto_advance_enabled,progress_bar_enabled,clinic_id)
 VALUES(true,true,true,true,true,_clinic) ON CONFLICT(clinic_id,id) DO NOTHING;
 FOREACH k IN ARRAY ARRAY['common','provisional','mockup','mockup_provisional'] LOOP
  INSERT INTO public.workflow_templates(flow_key,name,active_version,clinic_id)
  VALUES(k,CASE k WHEN 'common' THEN 'Caso comum' WHEN 'provisional' THEN 'Caso com provisório' WHEN 'mockup' THEN 'Caso com mockup' ELSE 'Mockup + provisório' END,1,_clinic);
  FOR item IN SELECT * FROM jsonb_array_elements(public.workflow_default_stages(k)) LOOP
   INSERT INTO public.stages(name,color,position,phase_id,flow_key,workflow_version,stage_key,condition_key,requirements,clinic_id)
   VALUES(item->>'name',item->>'color',(item->>'position')::integer,phase,k,1,item->>'stage_key',item->>'condition_key','[]',_clinic);
  END LOOP;
 END LOOP;
 INSERT INTO public.stage_return_reasons(label,position,clinic_id)
 VALUES('Ajuste',10,_clinic),('Correção',20,_clinic),('Revisão',30,_clinic),('Outro',40,_clinic);
END $$;
CREATE OR REPLACE FUNCTION public.saas_on_clinic_seed_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.saas_seed_company_workflow(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER saas_seed_clinic_workflow AFTER INSERT ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.saas_on_clinic_seed_workflow();
DO $$ DECLARE c uuid; BEGIN
 FOR c IN SELECT id FROM public.clinics ORDER BY created_at LOOP PERFORM public.saas_seed_company_workflow(c); END LOOP;
END $$;

-- BEGIN COMPANY WORKFLOW FUNCTIONS
CREATE OR REPLACE FUNCTION public.assign_case_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid; key text; version integer; active integer; semantic text;
 requested public.stages%ROWTYPE; target public.stages%ROWTYPE; changed boolean;
BEGIN
 SELECT COALESCE(r.clinic_id,p.clinic_id,cp.clinic_id,dp.clinic_id) INTO company
  FROM (SELECT NEW.patient_id AS patient_id,NEW.requested_by AS requested_by) x
  LEFT JOIN public.patients p ON p.id=x.patient_id LEFT JOIN public.profiles r ON r.id=x.requested_by
  LEFT JOIN public.cadistas cd ON cd.id=NEW.cadista_id LEFT JOIN public.profiles cp ON cp.id=cd.user_id
  LEFT JOIN public.doctors dd ON dd.id=NEW.doctor_id LEFT JOIN public.profiles dp ON dp.id=dd.user_id;
 IF company IS NULL THEN RAISE EXCEPTION 'CASE_WORKFLOW_COMPANY_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.saas_company_trusted_backend() THEN
  IF TG_OP='INSERT' AND NEW.patient_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.patients WHERE id=NEW.patient_id AND clinic_id IS DISTINCT FROM company) AND NOT public.can_access_patient(NEW.patient_id) THEN RAISE EXCEPTION 'FOREIGN_CASE_PATIENT_REFERENCE' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND NOT public.saas_company_can_read(company) THEN RAISE EXCEPTION 'FOREIGN_CASE_WORKFLOW_COMPANY' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND company IS DISTINCT FROM public.saas_case_company_id(OLD.id) THEN RAISE EXCEPTION 'CASE_WORKFLOW_COMPANY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 END IF;
 key:=public.case_flow_key(NEW.has_mockup,NEW.has_provisional);
 SELECT active_version INTO active FROM public.workflow_templates WHERE clinic_id=company AND flow_key=key;
 IF active IS NULL THEN RAISE EXCEPTION 'COMPANY_WORKFLOW_NOT_INITIALIZED' USING ERRCODE='42501'; END IF;
 IF NEW.current_stage_id IS NOT NULL THEN
  SELECT * INTO requested FROM public.stages WHERE id=NEW.current_stage_id;
  IF requested.clinic_id IS DISTINCT FROM company THEN RAISE EXCEPTION 'FOREIGN_CASE_WORKFLOW_STAGE' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='INSERT' THEN version:=active; semantic:='entry';
 ELSE
  changed:=OLD.has_mockup IS DISTINCT FROM NEW.has_mockup OR OLD.has_provisional IS DISTINCT FROM NEW.has_provisional OR OLD.workflow_key IS DISTINCT FROM key;
  -- A normal stage move keeps its historical workflow version. Saving a new
  -- template without apply_open must not silently migrate ongoing cases.
  version:=CASE WHEN changed THEN active ELSE COALESCE(NEW.workflow_version,OLD.workflow_version,active) END;
  IF NEW.current_stage_id IS NULL AND NOT changed THEN NEW.workflow_key:=key; NEW.workflow_version:=version; NEW.current_phase_id:=NULL; RETURN NEW; END IF;
  IF requested.id IS NOT NULL AND requested.flow_key=key AND requested.workflow_version=version THEN
   NEW.workflow_key:=key; NEW.workflow_version:=version; NEW.current_phase_id:=requested.phase_id; RETURN NEW;
  END IF;
  semantic:=requested.stage_key;
  IF semantic IS NULL THEN SELECT stage_key INTO semantic FROM public.stages WHERE id=OLD.current_stage_id AND clinic_id=company; END IF;
 END IF;
 SELECT * INTO target FROM public.stages WHERE clinic_id=company AND flow_key=key AND workflow_version=version
  AND stage_key=COALESCE(semantic,'entry') ORDER BY position,id LIMIT 1;
 IF target.id IS NULL THEN SELECT * INTO target FROM public.stages WHERE clinic_id=company AND flow_key=key AND workflow_version=version AND stage_key='entry' ORDER BY position,id LIMIT 1; END IF;
 IF target.id IS NULL THEN RAISE EXCEPTION 'COMPANY_WORKFLOW_ENTRY_MISSING' USING ERRCODE='42501'; END IF;
 NEW.workflow_key:=key; NEW.workflow_version:=version; NEW.current_stage_id:=target.id; NEW.current_phase_id:=target.phase_id;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.saas_guard_case_workflow_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid; stage uuid; phase uuid; case_id uuid;
BEGIN
 IF TG_TABLE_NAME='cases' THEN
  SELECT COALESCE(r.clinic_id,p.clinic_id,cp.clinic_id,dp.clinic_id) INTO company FROM (SELECT NEW.patient_id AS patient_id,NEW.requested_by AS requested_by) x
   LEFT JOIN public.patients p ON p.id=x.patient_id LEFT JOIN public.profiles r ON r.id=x.requested_by
  LEFT JOIN public.cadistas cd ON cd.id=NEW.cadista_id LEFT JOIN public.profiles cp ON cp.id=cd.user_id
  LEFT JOIN public.doctors dd ON dd.id=NEW.doctor_id LEFT JOIN public.profiles dp ON dp.id=dd.user_id;
  stage:=NEW.current_stage_id; phase:=NEW.current_phase_id;
 ELSE
  company:=public.saas_case_company_id(NEW.case_id); stage:=NEW.stage_id;
  IF NOT public.saas_company_trusted_backend() AND NOT public.can_modify_case(NEW.case_id) THEN
   RAISE EXCEPTION 'CASE_WORKFLOW_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF company IS NULL THEN RAISE EXCEPTION 'CASE_WORKFLOW_COMPANY_REQUIRED' USING ERRCODE='42501'; END IF;
 IF stage IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stages WHERE id=stage AND clinic_id=company) THEN
  RAISE EXCEPTION 'FOREIGN_CASE_WORKFLOW_STAGE' USING ERRCODE='42501'; END IF;
 IF phase IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.phases WHERE id=phase AND clinic_id=company) THEN
  RAISE EXCEPTION 'FOREIGN_CASE_WORKFLOW_PHASE' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.update_company_workflow_settings(_patch jsonb,_expected_clinic uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid:=public.saas_company_current_id(); k text; result jsonb;
BEGIN
 IF _expected_clinic IS NOT NULL AND _expected_clinic IS DISTINCT FROM company THEN RAISE EXCEPTION 'WORKFLOW_COMPANY_CHANGED' USING ERRCODE='42501'; END IF;
 IF NOT public.saas_company_can_manage_workflow(company) THEN RAISE EXCEPTION 'WORKFLOW_COMPANY_WRITE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_patch) IS DISTINCT FROM 'object' OR _patch-ARRAY['phases_enabled','stages_enabled','auto_advance_enabled','progress_bar_enabled']<>'{}'::jsonb THEN
  RAISE EXCEPTION 'INVALID_WORKFLOW_SETTINGS' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(_patch) LOOP IF jsonb_typeof(_patch->k)<>'boolean' THEN RAISE EXCEPTION 'INVALID_WORKFLOW_SETTINGS' USING ERRCODE='22023'; END IF; END LOOP;
 UPDATE public.workflow_settings SET phases_enabled=COALESCE((_patch->>'phases_enabled')::boolean,phases_enabled),
  stages_enabled=COALESCE((_patch->>'stages_enabled')::boolean,stages_enabled),auto_advance_enabled=COALESCE((_patch->>'auto_advance_enabled')::boolean,auto_advance_enabled),
  progress_bar_enabled=COALESCE((_patch->>'progress_bar_enabled')::boolean,progress_bar_enabled),updated_at=now()
 WHERE clinic_id=company AND id=true RETURNING to_jsonb(workflow_settings.*) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'COMPANY_WORKFLOW_NOT_INITIALIZED'; END IF;
 RETURN result;
END $$;
-- Additional scoped management/movement functions follow in this block.
CREATE OR REPLACE FUNCTION public.save_workflow_template(_flow_key text, _stages jsonb, _apply_open boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid:=public.saas_company_current_id();
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
  IF jsonb_typeof(_stages) IS DISTINCT FROM 'array' OR jsonb_array_length(_stages) < 2 OR jsonb_array_length(_stages)>100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'O fluxo precisa ter pelo menos duas etapas.');
  END IF;

  SELECT active_version INTO v_old_version FROM public.workflow_templates WHERE clinic_id=v_company AND flow_key = _flow_key FOR UPDATE;
  IF v_old_version IS NULL THEN RAISE EXCEPTION 'COMPANY_WORKFLOW_NOT_INITIALIZED' USING ERRCODE='42501'; END IF;
  v_new_version := v_old_version + 1;
  SELECT id INTO v_phase FROM public.phases WHERE clinic_id=v_company ORDER BY position,id LIMIT 1;

  FOR item IN SELECT * FROM jsonb_array_elements(_stages) LOOP
    v_count := v_count + 1;
    v_source := NULLIF(item->>'source_id','')::uuid;
    IF v_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stages WHERE id=v_source AND clinic_id=v_company AND flow_key=_flow_key) THEN RAISE EXCEPTION 'FOREIGN_WORKFLOW_SOURCE' USING ERRCODE='42501'; END IF;
    INSERT INTO public.stages(
      name, color, position, phase_id, flow_key, workflow_version, stage_key,
      condition_key, requirements, requires_implant_components, clinic_id
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
      COALESCE((item->>'requires_implant_components')::boolean, false), v_company
    ) RETURNING id INTO v_new_stage;

    IF v_source IS NOT NULL THEN
      INSERT INTO public.stage_assignments(stage_id, user_id)
      SELECT v_new_stage, a.user_id FROM public.stage_assignments a
       WHERE a.stage_id = v_source AND a.clinic_id=v_company
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.workflow_templates
     SET active_version = v_new_version, updated_at = now(), updated_by = auth.uid()
   WHERE clinic_id=v_company AND flow_key = _flow_key;

  IF _apply_open THEN
    FOR c IN
      SELECT id, current_stage_id
        FROM public.cases
       WHERE public.saas_case_company_id(id)=v_company AND workflow_key = _flow_key
         AND finished_at IS NULL
         AND COALESCE(status,'') NOT IN ('finalizado','finished','arquivado','cancelado','deleted')
    LOOP
      SELECT stage_key, position INTO v_current_key, v_current_pos
        FROM public.stages WHERE id = c.current_stage_id AND clinic_id=v_company;
      SELECT id, phase_id INTO v_target
        FROM public.stages
       WHERE clinic_id=v_company AND flow_key = _flow_key AND workflow_version = v_new_version
         AND stage_key = v_current_key
       ORDER BY position LIMIT 1;
      IF NOT FOUND THEN
        SELECT id, phase_id INTO v_target
          FROM public.stages
         WHERE clinic_id=v_company AND flow_key = _flow_key AND workflow_version = v_new_version
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
END $function$
;

CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur_stage RECORD; chosen RECORD;
  next_phase_id uuid; next_stage_id uuid;
  v_user uuid := auth.uid();
  v_next_stage_name text;
  r RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_modify_case(_case_id) THEN RAISE EXCEPTION 'CASE_WORKFLOW_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;
  IF NOT (public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id) OR public.saas_company_can_manage_workflow(public.saas_case_company_id(_case_id))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem avançar.');
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO chosen FROM public.stages
     WHERE id = _stage_id AND flow_key = c.workflow_key AND workflow_version = c.workflow_version AND clinic_id=public.saas_case_company_id(_case_id);
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
     WHERE clinic_id=public.saas_case_company_id(_case_id) AND flow_key = c.workflow_key AND workflow_version = c.workflow_version
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
END $function$
;

CREATE OR REPLACE FUNCTION public.return_case_workflow(_case_id uuid, _reason_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text, _to_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur_stage RECORD; target RECORD; v_user uuid:=auth.uid();
  v_reason text; v_stage_name text; r RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_modify_case(_case_id) THEN RAISE EXCEPTION 'CASE_WORKFLOW_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.cases WHERE id=_case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success',false,'error','Caso não encontrado'); END IF;
  IF NOT (public.user_can_advance(v_user,c.current_phase_id,c.current_stage_id) OR public.saas_company_can_manage_workflow(public.saas_case_company_id(_case_id))) THEN
    RETURN jsonb_build_object('success',false,'error','Apenas os responsáveis por esta etapa podem retornar o caso.');
  END IF;

  IF _to_stage_id IS NOT NULL THEN
    SELECT * INTO target FROM public.stages
     WHERE id=_to_stage_id AND flow_key=c.workflow_key AND workflow_version=c.workflow_version AND clinic_id=public.saas_case_company_id(_case_id);
  ELSE
    SELECT * INTO cur_stage FROM public.stages WHERE id=c.current_stage_id;
    SELECT * INTO target FROM public.stages
     WHERE clinic_id=public.saas_case_company_id(_case_id) AND flow_key=c.workflow_key AND workflow_version=c.workflow_version
       AND position < COALESCE(cur_stage.position,2147483647)
       AND (condition_key IS DISTINCT FROM 'requires_sintering' OR public.case_requires_sintering(_case_id))
     ORDER BY position DESC LIMIT 1;
  END IF;
  IF target IS NULL THEN RETURN jsonb_build_object('success',false,'error','Não há etapa anterior válida no fluxo.'); END IF;

  IF _reason_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stage_return_reasons WHERE id=_reason_id AND clinic_id=public.saas_case_company_id(_case_id)) THEN RAISE EXCEPTION 'FOREIGN_WORKFLOW_REASON' USING ERRCODE='42501'; END IF;
  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id=_reason_id AND clinic_id=public.saas_case_company_id(_case_id);
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
END $function$
;

CREATE OR REPLACE FUNCTION public.reset_default_workflows(_apply_open boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE k text; r jsonb;
BEGIN
  IF NOT public.current_user_can_manage_workflow() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas Admin/CEO podem restaurar fluxos.');
  END IF;
  FOREACH k IN ARRAY ARRAY['common','provisional','mockup','mockup_provisional'] LOOP
    r := public.save_workflow_template(k, public.workflow_default_stages(k), _apply_open);
    IF COALESCE((r->>'success')::boolean,false) = false THEN RETURN r; END IF;
  END LOOP;
  UPDATE public.workflow_settings SET phases_enabled=true, stages_enabled=true, progress_bar_enabled=true, updated_at=now() WHERE clinic_id=public.saas_company_current_id() AND id=true;
  RETURN jsonb_build_object('success', true, 'applied_open_cases', _apply_open);
END $function$
;

CREATE OR REPLACE FUNCTION public.user_can_advance(_user uuid,_phase_id uuid,_stage_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(_user=auth.uid(),false) AND
 CASE WHEN _stage_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id=_stage_id)
   THEN EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id=_stage_id AND user_id=_user)
  WHEN _phase_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.phase_assignments WHERE phase_id=_phase_id)
   THEN EXISTS(SELECT 1 FROM public.phase_assignments WHERE phase_id=_phase_id AND user_id=_user)
  ELSE true END;
$$;

CREATE OR REPLACE FUNCTION public.saas_guard_shared_dictionary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.saas_company_trusted_backend() THEN RAISE EXCEPTION 'SHARED_DICTIONARY_READ_ONLY' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- END COMPANY WORKFLOW FUNCTIONS

CREATE TRIGGER saas_shared_case_types_guard BEFORE INSERT OR UPDATE OR DELETE ON public.case_types
 FOR EACH ROW EXECUTE FUNCTION public.saas_guard_shared_dictionary();
CREATE TRIGGER saas_shared_tooth_colors_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tooth_colors
 FOR EACH ROW EXECUTE FUNCTION public.saas_guard_shared_dictionary();
CREATE TRIGGER zzz_saas_case_workflow_reference BEFORE INSERT OR UPDATE OF patient_id,requested_by,current_stage_id,current_phase_id,has_mockup,has_provisional,workflow_key,workflow_version
 ON public.cases FOR EACH ROW EXECUTE FUNCTION public.saas_guard_case_workflow_references();
CREATE TRIGGER zzz_saas_case_stage_reference BEFORE INSERT OR UPDATE ON public.case_stages
 FOR EACH ROW EXECUTE FUNCTION public.saas_guard_case_workflow_references();
CREATE TRIGGER zzz_saas_consumption_stage_reference BEFORE INSERT OR UPDATE ON public.case_stock_consumptions
 FOR EACH ROW EXECUTE FUNCTION public.saas_guard_case_workflow_references();
CREATE TRIGGER zzz_saas_tooth_usage_stage_reference BEFORE INSERT OR UPDATE ON public.case_tooth_stock_usage
 FOR EACH ROW EXECUTE FUNCTION public.saas_guard_case_workflow_references();

-- END COMPANY WORKFLOW PUBLICATION GUARDS
REVOKE ALL ON FUNCTION public.saas_case_company_id(uuid),public.saas_seed_company_workflow(uuid),public.saas_on_clinic_seed_workflow(),
 public.saas_guard_workflow_configuration(),public.saas_guard_case_workflow_references(),public.saas_guard_shared_dictionary()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.saas_shared_workflow_stage_ids(),public.saas_shared_workflow_phase_ids(),
 public.saas_company_can_manage_workflow(uuid),public.saas_can_read_workflow_company(uuid),
 public.current_user_can_manage_workflow(),public.user_can_advance(uuid,uuid,uuid),public.update_company_workflow_settings(jsonb,uuid),
 public.save_workflow_template(text,jsonb,boolean),public.reset_default_workflows(boolean),
 public.advance_case_workflow(uuid,uuid),public.return_case_workflow(uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_shared_workflow_stage_ids(),public.saas_shared_workflow_phase_ids(),
 public.saas_company_can_manage_workflow(uuid),public.saas_can_read_workflow_company(uuid),
 public.current_user_can_manage_workflow(),public.user_can_advance(uuid,uuid,uuid),public.update_company_workflow_settings(jsonb,uuid),
 public.save_workflow_template(text,jsonb,boolean),public.reset_default_workflows(boolean),
 public.advance_case_workflow(uuid,uuid),public.return_case_workflow(uuid,uuid,text,uuid) TO authenticated;
REVOKE ALL ON public.case_types,public.tooth_colors FROM PUBLIC,anon;
GRANT SELECT ON public.case_types,public.tooth_colors TO authenticated;
GRANT ALL ON public.case_types,public.tooth_colors TO service_role;
REVOKE ALL ON public.saas_legacy_workflow_settings_archive FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE ON public.workflow_templates FROM authenticated;
REVOKE DELETE ON public.workflow_settings FROM authenticated;
ALTER TABLE public.saas_fixture_acceptance_jobs DROP CONSTRAINT IF EXISTS saas_fixture_acceptance_jobs_kind_check;
ALTER TABLE public.saas_fixture_acceptance_jobs ADD CONSTRAINT saas_fixture_acceptance_jobs_kind_check
 CHECK(kind IN ('identity','storage','billing','ownership','configuration'));
NOTIFY pgrst,'reload schema';


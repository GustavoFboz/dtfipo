-- Owner confirmed on 2026-10-22: existing stock belongs entirely to IPO.
-- Add ownership, preserve all IDs/values/history, and intersect legacy RLS.
-- Shared case types, tooth colors and workflow configuration have separate review.

-- Recovery snapshots predate the canonical resin tables and newer usage fields.
CREATE TABLE IF NOT EXISTS public.resin_pots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
 name text NOT NULL, brand text, type text, color text, expires_on date,
 tare_g numeric NOT NULL DEFAULT 0, declared_net_g numeric NOT NULL DEFAULT 0,
 current_net_g numeric NOT NULL DEFAULT 0, min_net_g numeric NOT NULL DEFAULT 0,
 notes text, active boolean NOT NULL DEFAULT true, created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.resin_weighings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pot_id uuid NOT NULL REFERENCES public.resin_pots(id) ON DELETE CASCADE,
 gross_g numeric NOT NULL, net_g numeric NOT NULL, source text NOT NULL DEFAULT 'manual',
 notes text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resin_weighings_pot ON public.resin_weighings(pot_id,created_at DESC);
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS last_restocked_at timestamptz;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS requires_sintering boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_tooth_stock_usage ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.case_tooth_stock_usage ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.case_stock_consumptions ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.case_stock_consumptions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_tooth_stock_usage' AND column_name='stage_id') THEN
  ALTER TABLE public.case_tooth_stock_usage ALTER COLUMN stage_id DROP NOT NULL;
 END IF;
END $$;
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'tooth_usage';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'tooth_usage_reverse';

CREATE OR REPLACE FUNCTION public.saas_company_current_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p.clinic_id FROM public.profiles p WHERE p.id=auth.uid() AND (
  public.active_company_member(p.clinic_id,auth.uid())
  OR EXISTS(SELECT 1 FROM public.clinics c WHERE c.id=p.clinic_id AND c.owner_id=auth.uid())
 );
$$;
CREATE OR REPLACE FUNCTION public.saas_company_can_read(_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(_clinic=public.saas_company_current_id() AND public.company_has_operational_access(_clinic),false);
$$;
CREATE OR REPLACE FUNCTION public.saas_company_can_manage_stock(_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.saas_company_can_read(_clinic) AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (
   COALESCE(p.is_default_admin,false)
   OR upper(COALESCE(NULLIF(trim(p.account_subtype),''),p.role,'')) IN ('CEO','ADMIN','DR','DENTISTA','RECEPCIONISTA','PROTETICO')
   OR public.has_any_role(auth.uid(),ARRAY['admin','recepcionista','protetico']::public.app_role[])
  )
 );
$$;
CREATE OR REPLACE FUNCTION public.saas_company_can_manage_people(_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.saas_company_can_read(_clinic) AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (
   COALESCE(p.is_default_admin,false) OR upper(COALESCE(NULLIF(trim(p.account_subtype),''),p.role,'')) IN ('CEO','ADMIN','DR')
  )
 );
$$;
CREATE OR REPLACE FUNCTION public.saas_company_trusted_backend()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(auth.role()='service_role',false) OR (
  auth.uid() IS NULL AND auth.role() IS NULL
  AND session_user IN ('postgres','supabase_admin','supabase_auth_admin')
 );
$$;
CREATE OR REPLACE FUNCTION public.saas_case_company_id(_case uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(p.clinic_id,r.clinic_id) FROM public.cases c
 LEFT JOIN public.patients p ON p.id=c.patient_id LEFT JOIN public.profiles r ON r.id=c.requested_by
 WHERE c.id=_case;
$$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['component_categories','components','implant_systems','implant_component_types',
 'implant_system_components','scan_jigs','stock_items','stock_item_custom_fields','stock_movements',
 'stock_consumption_rules','case_stock_consumptions','case_tooth_stock_usage','case_implant_teeth',
 'holders','burrs','burr_usages','resin_pots','resin_weighings','user_stock_access','cadistas','doctors','proteticos'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE RESTRICT',t);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(clinic_id)',t||'_company_idx',t);
 END LOOP;
END $$;

-- Atomic backfill. Preserve each trigger's enabled state and all non-ownership
-- columns; ordinary updated_at/audit/quantity triggers must not rewrite history.
DO $$ DECLARE t text; tr record; state jsonb; states jsonb:='[]';
 v_ipo constant uuid:='ea00a3cd-6816-42f4-845d-56468c77414e';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.clinics WHERE id=v_ipo AND billing_exempt) THEN
  -- Clean schema restores have no Auth/IPO operational data. Old seeded rows
  -- stay unowned and invisible; never assign them to the first new customer.
  RETURN;
 END IF;
 FOREACH t IN ARRAY ARRAY['component_categories','components','implant_systems','implant_component_types',
 'implant_system_components','scan_jigs','stock_items','stock_item_custom_fields','stock_movements',
 'stock_consumption_rules','case_stock_consumptions','case_tooth_stock_usage','case_implant_teeth',
 'holders','burrs','burr_usages','resin_pots','resin_weighings','user_stock_access','cadistas','doctors','proteticos'] LOOP
  FOR tr IN SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND NOT tgisinternal LOOP
   states:=states||jsonb_build_array(jsonb_build_object('table',t,'trigger',tr.tgname,'state',tr.tgenabled));
   EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I',t,tr.tgname);
  END LOOP;
  IF t IN ('cadistas','doctors','proteticos') THEN
   EXECUTE format('UPDATE public.%I d SET clinic_id=p.clinic_id FROM public.profiles p WHERE d.user_id=p.id AND d.clinic_id IS NULL AND p.clinic_id IS NOT NULL',t);
   EXECUTE format('UPDATE public.%I SET clinic_id=$1 WHERE clinic_id IS NULL AND user_id IS NULL',t) USING v_ipo;
  ELSE
   EXECUTE format('UPDATE public.%I SET clinic_id=$1 WHERE clinic_id IS NULL',t) USING v_ipo;
  END IF;
 END LOOP;
 FOR state IN SELECT value FROM jsonb_array_elements(states) LOOP
  EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I',state->>'table',
   CASE state->>'state' WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,state->>'trigger');
 END LOOP;
END $$;

-- A company may use the same category/system name as another company.
DO $$ DECLARE r record; cols text; BEGIN
 FOR r IN SELECT c.oid,c.conrelid,c.conname,c.conkey FROM pg_constraint c
 WHERE c.contype='u' AND c.conrelid IN ('public.component_categories'::regclass,'public.implant_systems'::regclass,
  'public.implant_component_types'::regclass,'public.holders'::regclass)
 AND NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) AND a.attname='clinic_id') LOOP
  SELECT string_agg(quote_ident(a.attname),',' ORDER BY k.ord) INTO cols
  FROM unnest(r.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=r.conrelid AND a.attnum=k.attnum;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I UNIQUE(clinic_id,%s)',r.conrelid::regclass,r.conname,r.conname,cols);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.saas_owned_parent_company(_table text,_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid;
BEGIN
 IF _id IS NULL THEN RETURN NULL; END IF;
 IF NOT (_table=ANY(ARRAY['component_categories','components','implant_systems','implant_component_types',
  'implant_system_components','stock_items','stock_consumption_rules','holders','burrs','resin_pots'])) THEN
  RAISE EXCEPTION 'INVALID_COMPANY_REFERENCE' USING ERRCODE='42501';
 END IF;
 EXECUTE format('SELECT clinic_id FROM public.%I WHERE id=$1',_table) INTO c USING _id;
 RETURN c;
END $$;
CREATE OR REPLACE FUNCTION public.saas_assert_company_reference(_table text,_id uuid,_clinic uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _id IS NOT NULL AND public.saas_owned_parent_company(_table,_id) IS DISTINCT FROM _clinic THEN
  RAISE EXCEPTION 'INVALID_COMPANY_REFERENCE' USING ERRCODE='42501';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.saas_require_stock_case_pair(_case uuid,_stock uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_access_case(_case) OR public.saas_case_company_id(_case) IS NULL
  OR public.saas_owned_parent_company('stock_items',_stock) IS DISTINCT FROM public.saas_case_company_id(_case) THEN
  RAISE EXCEPTION 'INVALID_COMPANY_REFERENCE' USING ERRCODE='42501';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.saas_guard_owned_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; c uuid; parent text; parent_id uuid; case_id uuid; privileged boolean:=public.saas_company_trusted_backend();
BEGIN
 IF TG_OP='DELETE' THEN
  -- Referential cascades inherit the already authorized parent deletion.
  IF privileged OR pg_trigger_depth()>1 THEN RETURN OLD; END IF;
  r:=to_jsonb(OLD); c:=OLD.clinic_id;
 ELSE
  r:=to_jsonb(NEW); c:=NEW.clinic_id;
  parent:=CASE TG_TABLE_NAME
   WHEN 'implant_system_components' THEN 'implant_systems' WHEN 'scan_jigs' THEN 'implant_systems'
   WHEN 'stock_item_custom_fields' THEN 'stock_items' WHEN 'stock_movements' THEN 'stock_items'
   WHEN 'stock_consumption_rules' THEN 'stock_items' WHEN 'case_stock_consumptions' THEN 'stock_items'
   WHEN 'case_tooth_stock_usage' THEN 'stock_items' WHEN 'case_implant_teeth' THEN 'stock_items'
   WHEN 'burr_usages' THEN 'burrs' WHEN 'resin_weighings' THEN 'resin_pots' WHEN 'user_stock_access' THEN 'component_categories' END;
  IF parent IS NOT NULL THEN
   parent_id:=NULLIF(r->>CASE WHEN parent='implant_systems' THEN 'implant_system_id' WHEN parent='burrs' THEN 'burr_id'
    WHEN parent='resin_pots' THEN 'pot_id' WHEN parent='component_categories' THEN 'category_id' ELSE 'stock_item_id' END,'')::uuid;
   c:=COALESCE(c,public.saas_owned_parent_company(parent,parent_id));
  END IF;
  case_id:=NULLIF(r->>'case_id','')::uuid;
  c:=COALESCE(c,public.saas_case_company_id(case_id),public.saas_company_current_id());
  IF c IS NULL THEN RAISE EXCEPTION 'COMPANY_REQUIRED' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND OLD.clinic_id IS DISTINCT FROM c AND (OLD.clinic_id IS NOT NULL OR NOT privileged) THEN
   RAISE EXCEPTION 'COMPANY_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  NEW.clinic_id:=c;
  IF NOT privileged AND TG_TABLE_NAME='stock_movements' THEN
   IF TG_OP='INSERT' THEN
    IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'INVALID_COMPANY_ACTOR' USING ERRCODE='42501';
    END IF;
    NEW.user_id:=auth.uid();
   ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'INVALID_COMPANY_ACTOR' USING ERRCODE='42501';
   END IF;
  END IF;
  IF NOT privileged AND r ? 'created_by' THEN
   IF TG_OP='INSERT' THEN
    IF NULLIF(r->>'created_by','') IS NOT NULL AND (r->>'created_by')::uuid IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'INVALID_COMPANY_ACTOR' USING ERRCODE='42501';
    END IF;
    NEW:=jsonb_populate_record(NEW,jsonb_build_object('created_by',auth.uid()));
   ELSIF r->>'created_by' IS DISTINCT FROM to_jsonb(OLD)->>'created_by' THEN
    RAISE EXCEPTION 'INVALID_COMPANY_ACTOR' USING ERRCODE='42501';
   END IF;
  END IF;
  IF parent IS NOT NULL THEN PERFORM public.saas_assert_company_reference(parent,parent_id,c); END IF;
  IF TG_TABLE_NAME='stock_items' THEN
   PERFORM public.saas_assert_company_reference('component_categories',NULLIF(r->>'category_id','')::uuid,c);
   PERFORM public.saas_assert_company_reference('components',NULLIF(r->>'component_id','')::uuid,c);
   PERFORM public.saas_assert_company_reference('implant_system_components',NULLIF(r->>'implant_system_component_id','')::uuid,c);
  ELSIF TG_TABLE_NAME='implant_system_components' THEN
   PERFORM public.saas_assert_company_reference('implant_component_types',NULLIF(r->>'component_type_id','')::uuid,c);
  ELSIF TG_TABLE_NAME='burrs' THEN
   PERFORM public.saas_assert_company_reference('holders',NULLIF(r->>'holder_id','')::uuid,c);
  ELSIF TG_TABLE_NAME='resin_pots' THEN
   PERFORM public.saas_assert_company_reference('stock_items',NULLIF(r->>'stock_item_id','')::uuid,c);
  END IF;
  IF NULLIF(r->>'rule_id','') IS NOT NULL THEN PERFORM public.saas_assert_company_reference('stock_consumption_rules',(r->>'rule_id')::uuid,c); END IF;
  IF case_id IS NOT NULL AND public.saas_case_company_id(case_id) IS DISTINCT FROM c THEN
   RAISE EXCEPTION 'INVALID_COMPANY_REFERENCE' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='user_stock_access' AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(r->>'user_id')::uuid AND p.clinic_id=c) THEN
   RAISE EXCEPTION 'INVALID_COMPANY_REFERENCE' USING ERRCODE='42501';
  END IF;
 END IF;
 case_id:=NULLIF(r->>'case_id','')::uuid;
 IF NOT privileged AND NOT public.saas_company_can_manage_stock(c)
  AND NOT (TG_TABLE_NAME IN ('stock_movements','case_stock_consumptions','case_tooth_stock_usage','case_implant_teeth','burr_usages')
   AND case_id IS NOT NULL AND public.can_access_case(case_id) AND public.saas_case_company_id(case_id)=c)
  AND NOT (TG_OP='UPDATE' AND TG_TABLE_NAME IN ('stock_items','resin_pots') AND pg_trigger_depth()>1) THEN
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='stock_movements' AND pg_trigger_depth()>1
   AND to_jsonb(OLD)->>'case_id' IS NOT NULL AND r->>'case_id' IS NULL
   AND (r-'case_id')=(to_jsonb(OLD)-'case_id') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'COMPANY_WRITE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.saas_can_read_person(_user uuid,_clinic uuid DEFAULT NULL,_directory uuid DEFAULT NULL,_kind text DEFAULT '')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (
  _user=auth.uid()
  OR public.saas_company_can_read(COALESCE(_clinic,(SELECT clinic_id FROM public.profiles WHERE id=_user)))
  OR EXISTS(SELECT 1 FROM public.cases c WHERE public.can_access_case(c.id) AND (
   c.requested_by=_user
   OR EXISTS(SELECT 1 FROM public.cadistas d WHERE d.id=c.cadista_id AND d.user_id=_user)
   OR EXISTS(SELECT 1 FROM public.doctors d WHERE d.id=c.doctor_id AND d.user_id=_user)
   OR (_kind='cadistas' AND c.cadista_id=_directory) OR (_kind='doctors' AND c.doctor_id=_directory)
  ))
 );
$$;
CREATE OR REPLACE FUNCTION public.saas_guard_person_directory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid; privileged boolean:=public.saas_company_trusted_backend();
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT privileged AND pg_trigger_depth()<=1 AND NOT public.saas_company_can_manage_people(OLD.clinic_id) THEN
   RAISE EXCEPTION 'COMPANY_WRITE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN OLD;
 END IF;
 IF NEW.user_id IS NOT NULL THEN SELECT p.clinic_id INTO c FROM public.profiles p JOIN public.clinics cl ON cl.id=p.clinic_id WHERE p.id=NEW.user_id;
 ELSE c:=COALESCE(NEW.clinic_id,public.saas_company_current_id()); END IF;
 IF NEW.clinic_id IS NOT NULL AND NEW.clinic_id IS DISTINCT FROM c THEN
  RAISE EXCEPTION 'INVALID_COMPANY_REFERENCE' USING ERRCODE='42501';
 END IF;
 IF NOT privileged AND NOT public.saas_company_can_manage_people(c)
  AND NOT (pg_trigger_depth()>1 AND c=public.saas_company_current_id()) THEN
  RAISE EXCEPTION 'COMPANY_WRITE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND OLD.clinic_id IS DISTINCT FROM c AND NOT privileged
  AND NOT (pg_trigger_depth()>1 AND c=public.saas_company_current_id()) THEN
  RAISE EXCEPTION 'COMPANY_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 NEW.clinic_id:=c;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.saas_sync_person_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['cadistas','doctors','proteticos'] LOOP
  IF TG_TABLE_NAME='profiles' THEN
   EXECUTE format('UPDATE public.%I d SET clinic_id=p.clinic_id FROM public.profiles p JOIN public.clinics c ON c.id=p.clinic_id WHERE p.id=$1 AND d.user_id=p.id AND d.clinic_id IS DISTINCT FROM p.clinic_id',t) USING NEW.id;
  ELSE
   EXECUTE format('UPDATE public.%I d SET clinic_id=p.clinic_id FROM public.profiles p WHERE p.clinic_id=$1 AND d.user_id=p.id AND d.clinic_id IS DISTINCT FROM p.clinic_id',t) USING NEW.id;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS saas_sync_profile_company ON public.profiles;
CREATE TRIGGER saas_sync_profile_company AFTER UPDATE OF clinic_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.saas_sync_person_company();
DROP TRIGGER IF EXISTS saas_sync_clinic_people ON public.clinics;
CREATE TRIGGER saas_sync_clinic_people AFTER INSERT ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.saas_sync_person_company();

DO $$ DECLARE t text; q text; w text; BEGIN
 FOREACH t IN ARRAY ARRAY['component_categories','components','implant_systems','implant_component_types',
 'implant_system_components','scan_jigs','stock_items','stock_item_custom_fields','stock_movements',
 'stock_consumption_rules','case_stock_consumptions','case_tooth_stock_usage','case_implant_teeth',
 'holders','burrs','burr_usages','resin_pots','resin_weighings','user_stock_access','cadistas','doctors','proteticos'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  IF t IN ('cadistas','doctors','proteticos') THEN
   q:=format('public.saas_can_read_person(user_id,clinic_id,id,%L)',t);
   w:='public.saas_company_can_manage_people(clinic_id)';
  ELSIF t IN ('case_stock_consumptions','case_tooth_stock_usage','case_implant_teeth') THEN
   q:='public.can_access_case(case_id)'; w:='public.saas_company_can_manage_stock(clinic_id)';
  ELSIF t='user_stock_access' THEN
   q:='public.saas_company_can_read(clinic_id) AND (user_id=auth.uid() OR public.saas_company_can_manage_people(clinic_id))';
   w:='public.saas_company_can_manage_people(clinic_id)';
  ELSE q:='public.saas_company_can_read(clinic_id)'; w:='public.saas_company_can_manage_stock(clinic_id)'; END IF;
  EXECUTE format('DROP POLICY IF EXISTS saas_company_boundary ON public.%I',t);
  EXECUTE format('CREATE POLICY saas_company_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',t,q,q);
  EXECUTE format('DROP POLICY IF EXISTS saas_company_select ON public.%I',t);
  EXECUTE format('CREATE POLICY saas_company_select ON public.%I FOR SELECT TO authenticated USING (%s)',t,q);
  EXECUTE format('DROP POLICY IF EXISTS saas_company_write ON public.%I',t);
  EXECUTE format('CREATE POLICY saas_company_write ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',t,w,w);
  EXECUTE format('DROP TRIGGER IF EXISTS aaa_saas_company_guard ON public.%I',t);
  EXECUTE format('CREATE TRIGGER aaa_saas_company_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.%I()',t,
   CASE WHEN t IN ('cadistas','doctors','proteticos') THEN 'saas_guard_person_directory' ELSE 'saas_guard_owned_record' END);
 END LOOP;
END $$;

-- The original helper reads profiles/cases as owner, so this does not recurse.
DROP POLICY IF EXISTS profiles_company_read_boundary ON public.profiles;
CREATE POLICY profiles_company_read_boundary ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
USING(public.saas_can_read_person(id));
DROP POLICY IF EXISTS profiles_company_update_boundary ON public.profiles;
CREATE POLICY profiles_company_update_boundary ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING(id=auth.uid() OR clinic_id=public.saas_company_current_id())
WITH CHECK(id=auth.uid() OR clinic_id=public.saas_company_current_id());
DROP POLICY IF EXISTS profiles_company_delete_boundary ON public.profiles;
CREATE POLICY profiles_company_delete_boundary ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated
USING(id=auth.uid() OR public.saas_company_can_manage_people(clinic_id));

-- Existing patient rows without provenance stay quarantined for owner review.
ALTER TABLE public.patients ALTER COLUMN clinic_id SET DEFAULT public.saas_company_current_id();
CREATE OR REPLACE FUNCTION public.saas_guard_patient_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.clinic_id:=COALESCE(NEW.clinic_id,public.saas_company_current_id()); END IF;
 IF NEW.clinic_id IS NULL AND (TG_OP='INSERT' OR OLD.clinic_id IS NOT NULL) THEN
  RAISE EXCEPTION 'COMPANY_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND OLD.clinic_id IS DISTINCT FROM NEW.clinic_id AND NOT public.saas_company_trusted_backend() THEN
  RAISE EXCEPTION 'COMPANY_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aaa_saas_patient_company_guard ON public.patients;
CREATE TRIGGER aaa_saas_patient_company_guard BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.saas_guard_patient_company();

-- One-use, fixed allowlist job. No caller-selected users, records or roles.
ALTER TABLE public.saas_fixture_acceptance_jobs DROP CONSTRAINT IF EXISTS saas_fixture_acceptance_jobs_kind_check;
ALTER TABLE public.saas_fixture_acceptance_jobs ADD CONSTRAINT saas_fixture_acceptance_jobs_kind_check
CHECK(kind IN ('identity','storage','billing','ownership'));

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.add_implant_component(_system_id uuid, _type_id uuid, _name text, _sku text DEFAULT NULL::text, _qty numeric DEFAULT 0, _min_qty numeric DEFAULT 0, _unit text DEFAULT 'un'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_comp uuid; v_cat uuid; v_sys_name text;
BEGIN
  IF NOT public.saas_company_can_manage_stock(public.saas_company_current_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT name INTO v_sys_name FROM public.implant_systems WHERE id = _system_id AND clinic_id=public.saas_company_current_id();
  IF v_sys_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sistema não encontrado');
  END IF;

  INSERT INTO public.implant_system_components (implant_system_id, name, sku, component_type_id)
  VALUES (_system_id, trim(_name), NULLIF(_sku, ''), _type_id)
  RETURNING id INTO v_comp;

  SELECT id INTO v_cat FROM public.component_categories WHERE name ILIKE 'Implantes' AND clinic_id=public.saas_company_current_id() LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO public.component_categories (name, position) VALUES ('Implantes', 1000) RETURNING id INTO v_cat;
  END IF;

  INSERT INTO public.stock_items (category, category_id, name, brand, type, unit, qty_on_hand, min_qty, implant_system_component_id)
  VALUES ('component', v_cat, trim(_name), v_sys_name, v_sys_name, COALESCE(NULLIF(_unit, ''), 'un'), COALESCE(_qty, 0), COALESCE(_min_qty, 0), v_comp);

  RETURN jsonb_build_object('success', true, 'component_id', v_comp);
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.apply_resin_weighing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_initial_weight numeric;
    v_declared_net numeric;
    v_packaging_weight numeric;
BEGIN
    -- Obter peso inicial do pote lacrado e conteúdo declarado
    SELECT tare_g, declared_net_g INTO v_initial_weight, v_declared_net
    FROM public.resin_pots
    WHERE id = NEW.pot_id;

    -- O peso da embalagem é o peso inicial menos o que vinha de resina
    v_packaging_weight := GREATEST(v_initial_weight - v_declared_net, 0);

    -- A resina restante é o peso atual na balança menos o peso da embalagem
    NEW.net_g := GREATEST(COALESCE(NEW.gross_g, 0) - COALESCE(v_packaging_weight, 0), 0);

    -- Atualizar o pote com o valor líquido calculado
    UPDATE public.resin_pots SET current_net_g = NEW.net_g, updated_at = now() WHERE id = NEW.pot_id;

    RETURN NEW;
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE current_qty numeric;
BEGIN
  SELECT qty_on_hand INTO current_qty FROM public.stock_items WHERE id = NEW.stock_item_id FOR UPDATE;
  IF current_qty IS NULL THEN RAISE EXCEPTION 'Stock item % not found', NEW.stock_item_id; END IF;
  NEW.qty_before := current_qty;
  NEW.qty_after := current_qty + NEW.qty;
  UPDATE public.stock_items SET qty_on_hand = NEW.qty_after, updated_at = now() WHERE id = NEW.stock_item_id;
  RETURN NEW;
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.case_requires_sintering(_case_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c RECORD; v_result boolean := false;
BEGIN
  IF NOT public.saas_company_trusted_backend() AND NOT public.can_access_case(_case_id) THEN RETURN false; END IF;
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
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.create_implant_system_with_stock(_name text, _line text DEFAULT ''::text, _components jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sys uuid; v_cat uuid; comp jsonb; v_comp uuid;
BEGIN
  IF NOT public.saas_company_can_manage_stock(public.saas_company_current_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF COALESCE(trim(_name), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe o nome do sistema');
  END IF;

  INSERT INTO public.implant_systems (name, line)
  VALUES (trim(_name), NULLIF(trim(COALESCE(_line, '')), ''))
  RETURNING id INTO v_sys;

  SELECT id INTO v_cat FROM public.component_categories WHERE name ILIKE 'Implantes' AND clinic_id=public.saas_company_current_id() LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO public.component_categories (name, position) VALUES ('Implantes', 1000) RETURNING id INTO v_cat;
  END IF;

  FOR comp IN SELECT * FROM jsonb_array_elements(COALESCE(_components, '[]'::jsonb)) LOOP
    INSERT INTO public.implant_system_components (implant_system_id, name, sku, component_type_id)
    VALUES (
      v_sys,
      COALESCE(comp->>'name', 'Componente'),
      NULLIF(comp->>'sku', ''),
      NULLIF(comp->>'component_type_id', '')::uuid
    )
    RETURNING id INTO v_comp;

    INSERT INTO public.stock_items (category, category_id, name, brand, type, unit, qty_on_hand, min_qty, implant_system_component_id)
    VALUES (
      'component', v_cat, COALESCE(comp->>'name', 'Componente'), trim(_name), trim(_name),
      COALESCE(NULLIF(comp->>'unit', ''), 'un'),
      COALESCE((comp->>'qty')::numeric, 0),
      COALESCE((comp->>'min_qty')::numeric, 0),
      v_comp
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'implant_system_id', v_sys);
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.register_case_implant_tooth(_case_id uuid, _tooth_fdi integer, _stock_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_sys uuid; v_user uuid := auth.uid();
BEGIN
  PERFORM public.saas_require_stock_case_pair(_case_id,_stock_item_id);
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT c.implant_system_id INTO v_sys
    FROM public.stock_items si
    LEFT JOIN public.implant_system_components c ON c.id = si.implant_system_component_id
   WHERE si.id = _stock_item_id;

  UPDATE public.case_implant_teeth SET reversed_at = now()
   WHERE case_id = _case_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL;

  INSERT INTO public.case_implant_teeth (case_id, tooth_fdi, implant_system_id, stock_item_id, qty)
  VALUES (_case_id, _tooth_fdi, v_sys, _stock_item_id, 1)
  RETURNING id INTO v_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'tooth_usage', -1, 0, 0, _case_id, v_user, 'Componente de implante no dente ' || _tooth_fdi);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.register_tooth_stock_usage(_case_id uuid, _rule_id uuid, _tooth_fdi integer, _stock_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_qty numeric; v_id uuid; v_user uuid := auth.uid(); u RECORD;
BEGIN
  PERFORM public.saas_require_stock_case_pair(_case_id,_stock_item_id);
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT GREATEST(COALESCE(qty_per_tooth, 1), 1) INTO v_qty
    FROM public.stock_consumption_rules WHERE id = _rule_id AND clinic_id=public.saas_case_company_id(_case_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_COMPANY_REFERENCE' USING ERRCODE='42501'; END IF;
  v_qty := COALESCE(v_qty, 1);

  FOR u IN
    SELECT id FROM public.case_tooth_stock_usage
     WHERE case_id = _case_id AND rule_id = _rule_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL
  LOOP
    PERFORM public.remove_tooth_stock_usage(u.id);
  END LOOP;

  INSERT INTO public.case_tooth_stock_usage (case_id, rule_id, stock_item_id, tooth_fdi, qty, created_by)
  VALUES (_case_id, _rule_id, _stock_item_id, _tooth_fdi, v_qty, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'tooth_usage', -v_qty, 0, 0, _case_id, v_user, 'Uso no dente ' || _tooth_fdi);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.remove_case_implant_tooth(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t RECORD; v_user uuid := auth.uid();
BEGIN
  SELECT * INTO t FROM public.case_implant_teeth WHERE id = _id;
  IF t IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado'); END IF;
  IF NOT public.can_access_case(t.case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF t.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true); END IF;

  UPDATE public.case_implant_teeth SET reversed_at = now() WHERE id = _id;

  IF t.stock_item_id IS NOT NULL THEN
    INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (t.stock_item_id, 'tooth_usage_reverse', COALESCE(t.qty, 1), 0, 0, t.case_id, v_user, 'Estorno de componente do dente ' || t.tooth_fdi);
  END IF;

  RETURN jsonb_build_object('success', true);
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.remove_tooth_stock_usage(_usage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE u RECORD; v_user uuid := auth.uid();
BEGIN
  SELECT * INTO u FROM public.case_tooth_stock_usage WHERE id = _usage_id;
  IF u IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado'); END IF;
  IF NOT public.can_access_case(u.case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF u.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true); END IF;

  UPDATE public.case_tooth_stock_usage SET reversed_at = now() WHERE id = _usage_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (u.stock_item_id, 'tooth_usage_reverse', u.qty, 0, 0, u.case_id, v_user, 'Estorno do dente ' || u.tooth_fdi);

  RETURN jsonb_build_object('success', true);
END $function$
;

-- Preserve canonical live behavior, with company guards.
CREATE OR REPLACE FUNCTION public.touch_last_restocked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.qty > 0 THEN
    UPDATE public.stock_items SET last_restocked_at = now() WHERE id = NEW.stock_item_id;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.update_team_member(p_user_id uuid, p_full_name text, p_email text, p_phone text, p_role text, p_category_ids uuid[] DEFAULT ARRAY[]::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_enum app_role;
  v_cat_id uuid;
BEGIN
  IF NOT public.saas_company_can_manage_people(public.saas_company_current_id())
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND clinic_id=public.saas_company_current_id())
    OR EXISTS(SELECT 1 FROM unnest(COALESCE(p_category_ids,'{}'::uuid[])) requested(id)
      WHERE NOT EXISTS(SELECT 1 FROM public.component_categories c WHERE c.id=requested.id AND c.clinic_id=public.saas_company_current_id())) THEN
    RETURN json_build_object('success',false,'error','COMPANY_WRITE_FORBIDDEN');
  END IF;
  -- Validate caller is admin
  IF NOT (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR'))) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET
    full_name = p_full_name,
    email = p_email,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role,
    updated_at = now()
  WHERE id = p_user_id;

  -- Update clinic_members role
  UPDATE public.clinic_members
  SET role = p_role::text
  WHERE user_id = p_user_id AND clinic_id=public.saas_company_current_id();

  -- Sync user_roles
  BEGIN
    v_role_enum := lower(p_role)::app_role;
    DELETE FROM public.user_roles WHERE user_id = p_user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_role_enum);
  EXCEPTION WHEN OTHERS THEN
    -- Fallback
  END;

  -- Manage category access
  DELETE FROM public.user_stock_access WHERE user_id = p_user_id AND clinic_id=public.saas_company_current_id();
  FOREACH v_cat_id IN ARRAY p_category_ids LOOP
    INSERT INTO public.user_stock_access (user_id, category_id) VALUES (p_user_id, v_cat_id);
  END LOOP;

  -- Specialists sync
  IF p_role = 'DR' OR p_role = 'CEO' THEN
    INSERT INTO public.doctors (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSIF p_role = 'CADISTA' THEN
    INSERT INTO public.cadistas (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSIF p_role = 'PROTETICO' THEN
    INSERT INTO public.proteticos (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  END IF;

  RETURN json_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_team_member(p_user_id uuid, p_full_name text, p_email text, p_phone text, p_role text, p_category_ids uuid[] DEFAULT ARRAY[]::uuid[], p_additional_roles text[] DEFAULT ARRAY[]::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_enum app_role;
  v_role_str text;
  v_cat_id uuid;
BEGIN
  IF NOT public.saas_company_can_manage_people(public.saas_company_current_id())
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND clinic_id=public.saas_company_current_id())
    OR EXISTS(SELECT 1 FROM unnest(COALESCE(p_category_ids,'{}'::uuid[])) requested(id)
      WHERE NOT EXISTS(SELECT 1 FROM public.component_categories c WHERE c.id=requested.id AND c.clinic_id=public.saas_company_current_id())) THEN
    RETURN json_build_object('success',false,'error','COMPANY_WRITE_FORBIDDEN');
  END IF;
  -- Validate caller is admin (CEO or DR)
  IF NOT (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR'))) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Update profile (primary role)
  UPDATE public.profiles
  SET
    full_name = p_full_name,
    email = p_email,
    phone = p_phone,
    role = p_role,
    account_subtype = p_role,
    updated_at = now()
  WHERE id = p_user_id;

  -- Update clinic_members primary role
  UPDATE public.clinic_members
  SET role = p_role::text
  WHERE user_id = p_user_id AND clinic_id=public.saas_company_current_id();

  -- Clear and Rebuild user_roles
  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  -- Insert primary role
  BEGIN
    v_role_enum := lower(p_role)::app_role;
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_role_enum)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback for non-enum roles
  END;

  -- Insert additional roles
  FOREACH v_role_str IN ARRAY p_additional_roles LOOP
    BEGIN
      v_role_enum := lower(v_role_str)::app_role;
      INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_role_enum)
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- ignore
    END;
  END LOOP;

  -- Manage category access
  DELETE FROM public.user_stock_access WHERE user_id = p_user_id AND clinic_id=public.saas_company_current_id();
  FOREACH v_cat_id IN ARRAY p_category_ids LOOP
    INSERT INTO public.user_stock_access (user_id, category_id) VALUES (p_user_id, v_cat_id);
  END LOOP;

  -- Synchronize specialized tables
  -- A user can now be in multiple specialized tables simultaneously

  -- Handle Doctor
  IF p_role = 'DR' OR p_role = 'CEO' OR 'DR' = ANY(p_additional_roles) OR 'CEO' = ANY(p_additional_roles) THEN
    INSERT INTO public.doctors (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSE
    DELETE FROM public.doctors WHERE user_id = p_user_id AND clinic_id=public.saas_company_current_id();
  END IF;

  -- Handle Cadista
  IF p_role = 'CADISTA' OR 'CADISTA' = ANY(p_additional_roles) THEN
    INSERT INTO public.cadistas (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSE
    DELETE FROM public.cadistas WHERE user_id = p_user_id AND clinic_id=public.saas_company_current_id();
  END IF;

  -- Handle Protetico
  IF p_role = 'PROTETICO' OR 'PROTETICO' = ANY(p_additional_roles) THEN
    INSERT INTO public.proteticos (name, user_id) VALUES (p_full_name, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
  ELSE
    DELETE FROM public.proteticos WHERE user_id = p_user_id AND clinic_id=public.saas_company_current_id();
  END IF;

  RETURN json_build_object('success', true);
END;
$function$
;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.resin_weighings'::regclass AND tgfoid='public.apply_resin_weighing()'::regprocedure) THEN
  CREATE TRIGGER trg_apply_resin_weighing BEFORE INSERT ON public.resin_weighings FOR EACH ROW EXECUTE FUNCTION public.apply_resin_weighing();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.stock_movements'::regclass AND tgfoid='public.touch_last_restocked()'::regprocedure) THEN
  CREATE TRIGGER trg_touch_last_restocked AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.touch_last_restocked();
 END IF;
END $$;
-- Remove direct anonymous access, including helpers after restore self-heal.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE 'saas_company_%' OR p.proname IN ('saas_case_company_id','saas_owned_parent_company',
 'saas_assert_company_reference','saas_require_stock_case_pair','saas_guard_owned_record','saas_can_read_person',
 'saas_guard_person_directory','saas_guard_patient_company','saas_sync_person_company','add_implant_component','create_implant_system_with_stock',
 'register_case_implant_tooth','register_tooth_stock_usage','remove_case_implant_tooth','remove_tooth_stock_usage','case_requires_sintering','update_team_member')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.saas_company_current_id(),public.saas_company_can_read(uuid),
 public.saas_company_can_manage_stock(uuid),public.saas_company_can_manage_people(uuid),
 public.saas_can_read_person(uuid,uuid,uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.saas_company_trusted_backend(),public.saas_case_company_id(uuid),
 public.saas_owned_parent_company(text,uuid),public.saas_assert_company_reference(text,uuid,uuid),
 public.saas_guard_owned_record(),public.saas_guard_person_directory(),public.saas_guard_patient_company(),public.saas_sync_person_company()
 FROM authenticated,service_role;
NOTIFY pgrst,'reload schema';

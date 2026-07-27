CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role TEXT; v_full_name TEXT; is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  v_role := COALESCE(new.raw_user_meta_data->>'role', CASE WHEN is_first THEN 'CEO' ELSE 'USER' END);
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  INSERT INTO public.profiles (id, full_name, email, role, is_default_admin)
    VALUES (new.id, v_full_name, new.email, v_role, is_first)
    ON CONFLICT (id) DO NOTHING;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  IF v_role = 'CADISTA' THEN
    INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id);
  END IF;
  RETURN new;
END $function$;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS gum_info jsonb,
  ADD COLUMN IF NOT EXISTS implant_system_id uuid,
  ADD COLUMN IF NOT EXISTS implant_system_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tooth_implant_systems jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS has_provisional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS implant_teeth integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tooth_case_types jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scan_jig_id uuid,
  ADD COLUMN IF NOT EXISTS tooth_ti_bases jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.implant_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, manufacturer text, line text, sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_systems TO authenticated;
GRANT ALL ON public.implant_systems TO service_role;
ALTER TABLE public.implant_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "implant_systems auth read" ON public.implant_systems FOR SELECT TO authenticated USING (true);
CREATE POLICY "implant_systems staff write" ON public.implant_systems FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.scan_jigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL, sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_jigs TO authenticated;
GRANT ALL ON public.scan_jigs TO service_role;
ALTER TABLE public.scan_jigs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scan_jigs auth read" ON public.scan_jigs FOR SELECT TO authenticated USING (true);
CREATE POLICY "scan_jigs staff write" ON public.scan_jigs FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cases_implant_system_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_implant_system_id_fkey FOREIGN KEY (implant_system_id) REFERENCES public.implant_systems(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cases_scan_jig_id_fkey') THEN
    ALTER TABLE public.cases ADD CONSTRAINT cases_scan_jig_id_fkey FOREIGN KEY (scan_jig_id) REFERENCES public.scan_jigs(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS clinic_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
CREATE INDEX IF NOT EXISTS profiles_clinic_id_idx ON public.profiles(clinic_id);
UPDATE public.profiles SET clinic_id = id WHERE clinic_id IS NULL AND role IN ('CEO','DR');

CREATE TABLE IF NOT EXISTS public.clinic_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL, user_id UUID NOT NULL, role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  invited_by UUID, decided_by UUID, decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_members TO authenticated;
GRANT ALL ON public.clinic_members TO service_role;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view own clinic rows" ON public.clinic_members FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR'))
);
CREATE POLICY "admins manage clinic members" ON public.clinic_members FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR'))
);

CREATE SEQUENCE IF NOT EXISTS public.cases_case_number_seq;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_number INTEGER;
ALTER TABLE public.cases ALTER COLUMN case_number SET DEFAULT nextval('public.cases_case_number_seq');
CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_key ON public.cases(case_number);

CREATE OR REPLACE FUNCTION public.update_team_member(
  p_user_id uuid, p_full_name text, p_email text, p_phone text, p_role text, p_category_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dentista')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  UPDATE public.profiles SET full_name = COALESCE(p_full_name, full_name), email = COALESCE(p_email, email),
    phone = COALESCE(p_phone, phone), role = COALESCE(p_role, role), updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $$;
GRANT EXECUTE ON FUNCTION public.update_team_member(uuid, text, text, text, text, uuid[]) TO authenticated;

CREATE TABLE IF NOT EXISTS public.workflow_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  phases_enabled boolean NOT NULL DEFAULT false, stages_enabled boolean NOT NULL DEFAULT true,
  auto_advance_enabled boolean NOT NULL DEFAULT true, progress_bar_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;
ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_settings read all authenticated" ON public.workflow_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_settings write admins" ON public.workflow_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));
INSERT INTO public.workflow_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.stage_return_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL, position integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_return_reasons TO authenticated;
GRANT ALL ON public.stage_return_reasons TO service_role;
ALTER TABLE public.stage_return_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srr_read_staff" ON public.stage_return_reasons FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "srr_write_admin" ON public.stage_return_reasons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));

CREATE TABLE IF NOT EXISTS public.stage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_assignments TO authenticated;
GRANT ALL ON public.stage_assignments TO service_role;
ALTER TABLE public.stage_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_read_staff" ON public.stage_assignments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "sa_write_admin" ON public.stage_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));

CREATE OR REPLACE FUNCTION public.seed_default_workflow()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      ('Recepção','#64748b',10,v_phase),('Preparo','#0ea5e9',20,v_phase),('Cadista','#8b5cf6',30,v_phase),
      ('Fresagem','#f59e0b',40,v_phase),('Acabamento','#10b981',50,v_phase),('Entrega','#22c55e',60,v_phase);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stage_return_reasons) THEN
    INSERT INTO public.stage_return_reasons (label, position) VALUES
      ('Ajuste de oclusão',10),('Cor incorreta',20),('Contato proximal',30),('Falha de escaneamento',40),('Outro',100);
  END IF;
  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.seed_default_workflow() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_workflow() TO authenticated;

CREATE TABLE IF NOT EXISTS public.component_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, position integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.component_categories TO authenticated;
GRANT ALL ON public.component_categories TO service_role;
ALTER TABLE public.component_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "component_categories auth read" ON public.component_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "component_categories staff write" ON public.component_categories FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.implant_system_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id) ON DELETE CASCADE,
  name text NOT NULL, sku text, component_type_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_isc_system ON public.implant_system_components(implant_system_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_system_components TO authenticated;
GRANT ALL ON public.implant_system_components TO service_role;
ALTER TABLE public.implant_system_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "isc auth read" ON public.implant_system_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "isc staff write" ON public.implant_system_components FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS implant_system_component_id uuid REFERENCES public.implant_system_components(id) ON DELETE SET NULL;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.component_categories(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.create_implant_system_with_stock(_name text, _line text, _components jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_system_id uuid; v_cat_id uuid; v_comp jsonb; v_comp_id uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RETURN jsonb_build_object('success', false, 'error', 'Sem permissão'); END IF;
  INSERT INTO public.implant_systems (name, line, sort_order) VALUES (_name, NULLIF(_line, ''), 50) RETURNING id INTO v_system_id;
  SELECT id INTO v_cat_id FROM public.component_categories WHERE lower(name) = 'implantes' LIMIT 1;
  IF v_cat_id IS NULL THEN INSERT INTO public.component_categories (name, position) VALUES ('Implantes', 1000) RETURNING id INTO v_cat_id; END IF;
  IF _components IS NOT NULL THEN
    FOR v_comp IN SELECT * FROM jsonb_array_elements(_components) LOOP
      INSERT INTO public.implant_system_components (implant_system_id, name, sku)
        VALUES (v_system_id, v_comp->>'name', NULLIF(v_comp->>'sku','')) RETURNING id INTO v_comp_id;
      INSERT INTO public.stock_items (name, brand, unit, qty_on_hand, min_qty, implant_system_component_id, category_id)
        VALUES (v_comp->>'name', _name, COALESCE(NULLIF(v_comp->>'unit',''), 'un'),
          COALESCE((v_comp->>'qty')::numeric, 0), COALESCE((v_comp->>'min_qty')::numeric, 0), v_comp_id, v_cat_id);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('success', true, 'implant_system_id', v_system_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.create_implant_system_with_stock(text, text, jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.backend_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid,
  schema_hash text NOT NULL, size_bytes bigint NOT NULL DEFAULT 0, storage_path text
);
GRANT SELECT, INSERT ON public.backend_backups TO authenticated;
GRANT ALL ON public.backend_backups TO service_role;
ALTER TABLE public.backend_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read backend_backups" ON public.backend_backups FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert backend_backups" ON public.backend_backups FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.backend_schema_hash()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT md5(coalesce(string_agg(sig, E'\n' ORDER BY sig), '')) FROM (
    SELECT table_name || ':' || column_name || ':' || data_type AS sig
    FROM information_schema.columns WHERE table_schema = 'public'
  ) s;
$$;
GRANT EXECUTE ON FUNCTION public.backend_schema_hash() TO authenticated;
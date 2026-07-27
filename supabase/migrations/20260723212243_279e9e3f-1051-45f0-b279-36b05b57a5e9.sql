
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[]) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)) $$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','dentista','recepcionista','auxiliar','protetico')) $$;
CREATE OR REPLACE FUNCTION public.is_cadista(_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'cadista') $$;
CREATE OR REPLACE FUNCTION public.can_access_case(_case_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.cases c JOIN public.cadistas cd ON cd.id = c.cadista_id WHERE c.id = _case_id AND cd.user_id = auth.uid()) $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role TEXT; v_full_name TEXT; is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  v_role := COALESCE(new.raw_user_meta_data->>'role', CASE WHEN is_first THEN 'CEO' ELSE 'USER' END);
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  INSERT INTO public.profiles (id, full_name, email, role, is_default_admin) VALUES (new.id, v_full_name, new.email, v_role, is_first) ON CONFLICT (id) DO NOTHING;
  IF is_first THEN INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING; END IF;
  IF v_role = 'CADISTA' THEN INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id); END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.backups (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), file_name TEXT NOT NULL, file_size_bytes BIGINT, notes TEXT, created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_admin_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()) OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role='CEO' OR role='DR'))));
CREATE POLICY user_roles_self_select ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY patients_staff_select ON public.patients FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY patients_staff_insert ON public.patients FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY patients_staff_update ON public.patients FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY patients_admin_delete ON public.patients FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY doctors_staff_select ON public.doctors FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY doctors_staff_insert ON public.doctors FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY doctors_staff_update ON public.doctors FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY doctors_admin_delete ON public.doctors FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY phases_staff_select ON public.phases FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY phases_admin_write ON public.phases FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY stages_staff_select ON public.stages FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY stages_admin_write ON public.stages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY tooth_colors_staff_select ON public.tooth_colors FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_staff_insert ON public.tooth_colors FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_staff_update ON public.tooth_colors FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_admin_delete ON public.tooth_colors FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY case_types_staff_select ON public.case_types FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY case_types_admin_write ON public.case_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY components_staff_select ON public.components FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY components_staff_insert ON public.components FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY components_staff_update ON public.components FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY components_admin_delete ON public.components FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY holders_staff_select ON public.holders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY holders_staff_insert ON public.holders FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY holders_staff_update ON public.holders FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY holders_admin_delete ON public.holders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY burrs_staff_select ON public.burrs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY burrs_staff_insert ON public.burrs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY burrs_staff_update ON public.burrs FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY burrs_admin_delete ON public.burrs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY cadistas_staff_select ON public.cadistas FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY cadistas_admin_write ON public.cadistas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY cases_staff_select ON public.cases FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR (cadista_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.cadistas cd WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid())));
CREATE POLICY cases_staff_insert ON public.cases FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY cases_staff_update ON public.cases FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()) OR (cadista_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.cadistas cd WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid())));
CREATE POLICY cases_admin_delete ON public.cases FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY case_stages_access ON public.case_stages FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));
CREATE POLICY case_components_access ON public.case_components FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));
CREATE POLICY case_types_link_access ON public.case_types_link FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));
CREATE POLICY burr_usages_access ON public.burr_usages FOR ALL TO authenticated USING (case_id IS NULL OR public.can_access_case(case_id)) WITH CHECK (case_id IS NULL OR public.can_access_case(case_id));
CREATE POLICY backups_admin_all ON public.backups FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.case_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL, file_name text NOT NULL, storage_path text NOT NULL, size_bytes bigint, mime_type text, uploaded_by uuid, uploaded_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'), expired_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_case_attachments_case ON public.case_attachments(case_id);
CREATE INDEX IF NOT EXISTS idx_case_attachments_pending_expiry ON public.case_attachments(expires_at) WHERE expired_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_attachments TO authenticated;
GRANT ALL ON public.case_attachments TO service_role;
ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_attachments_select ON public.case_attachments FOR SELECT TO authenticated USING (public.can_access_case(case_id));
CREATE POLICY case_attachments_insert ON public.case_attachments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_case(case_id));
CREATE POLICY case_attachments_update ON public.case_attachments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()) AND public.can_access_case(case_id));
CREATE POLICY case_attachments_delete ON public.case_attachments FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

DO $$ BEGIN CREATE TYPE public.stock_category AS ENUM ('zirconia','dissilicato','component','hygiene'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.stock_movement_type AS ENUM ('in','out','auto_case','reverse_case','adjust'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.stock_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category public.stock_category NOT NULL, name text NOT NULL, brand text, color text, block_type text, unit text NOT NULL DEFAULT 'un', qty_on_hand numeric NOT NULL DEFAULT 0, min_qty numeric NOT NULL DEFAULT 0, component_id uuid REFERENCES public.components(id) ON DELETE SET NULL, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_stock_items_category ON public.stock_items(category);
CREATE INDEX IF NOT EXISTS idx_stock_items_component ON public.stock_items(component_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_items_staff_select ON public.stock_items FOR SELECT TO authenticated USING (is_staff(auth.uid()) AND NOT is_cadista(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY stock_items_staff_insert ON public.stock_items FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));
CREATE POLICY stock_items_staff_update ON public.stock_items FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));
CREATE POLICY stock_items_admin_delete ON public.stock_items FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_stock_items_updated_at BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.stock_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE, type public.stock_movement_type NOT NULL, qty numeric NOT NULL, qty_before numeric NOT NULL, qty_after numeric NOT NULL, case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL, user_id uuid, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON public.stock_movements(stock_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_case ON public.stock_movements(case_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON public.stock_movements(created_at DESC);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_staff_select ON public.stock_movements FOR SELECT TO authenticated USING (is_staff(auth.uid()) AND NOT is_cadista(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY stock_movements_staff_insert ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));

CREATE OR REPLACE FUNCTION public.apply_stock_movement() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_qty numeric;
BEGIN
  SELECT qty_on_hand INTO current_qty FROM public.stock_items WHERE id = NEW.stock_item_id FOR UPDATE;
  IF current_qty IS NULL THEN RAISE EXCEPTION 'Stock item % not found', NEW.stock_item_id; END IF;
  NEW.qty_before := current_qty;
  NEW.qty_after := current_qty + NEW.qty;
  UPDATE public.stock_items SET qty_on_hand = NEW.qty_after, updated_at = now() WHERE id = NEW.stock_item_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_apply_stock_movement BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS zirconia_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS dissilicato_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS stock_consumed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sender_id UUID REFERENCES public.profiles(id), recipient_id UUID REFERENCES public.profiles(id), title TEXT NOT NULL, content TEXT NOT NULL, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = recipient_id OR recipient_id IS NULL);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

UPDATE public.profiles SET role = 'CEO' WHERE is_default_admin = true AND role = 'USER';

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS gum_info jsonb,
  ADD COLUMN IF NOT EXISTS implant_system_id uuid,
  ADD COLUMN IF NOT EXISTS implant_system_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tooth_implant_systems jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS has_provisional boolean NOT NULL DEFAULT false;
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS implant_teeth integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tooth_case_types jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scan_jig_id uuid,
  ADD COLUMN IF NOT EXISTS tooth_ti_bases jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.implant_systems (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, manufacturer text, sort_order integer DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_systems TO authenticated;
GRANT ALL ON public.implant_systems TO service_role;
ALTER TABLE public.implant_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "implant_systems auth read" ON public.implant_systems FOR SELECT TO authenticated USING (true);
CREATE POLICY "implant_systems staff write" ON public.implant_systems FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.scan_jigs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE CASCADE, name text NOT NULL, sort_order integer DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
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

CREATE TABLE IF NOT EXISTS public.clinic_members (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id UUID NOT NULL, user_id UUID NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', invited_by UUID, decided_by UUID, decided_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (clinic_id, user_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_members TO authenticated;
GRANT ALL ON public.clinic_members TO service_role;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view own clinic rows" ON public.clinic_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR')));
CREATE POLICY "admins manage clinic members" ON public.clinic_members FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR'))) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.clinic_id = clinic_members.clinic_id AND p.role IN ('CEO','DR')));

CREATE SEQUENCE IF NOT EXISTS public.cases_case_number_seq;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_number INTEGER;
UPDATE public.cases SET case_number = nextval('public.cases_case_number_seq') WHERE case_number IS NULL;
ALTER TABLE public.cases ALTER COLUMN case_number SET DEFAULT nextval('public.cases_case_number_seq');
SELECT setval('public.cases_case_number_seq', GREATEST(1, COALESCE((SELECT MAX(case_number) FROM public.cases), 1)), (SELECT COUNT(*) > 0 FROM public.cases));
CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_key ON public.cases(case_number);

CREATE OR REPLACE FUNCTION public.update_team_member(p_user_id uuid, p_full_name text, p_email text, p_phone text, p_role text, p_category_ids uuid[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dentista')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  UPDATE public.profiles SET full_name = COALESCE(p_full_name, full_name), email = COALESCE(p_email, email), phone = COALESCE(p_phone, phone), role = COALESCE(p_role, role), updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $$;
GRANT EXECUTE ON FUNCTION public.update_team_member(uuid, text, text, text, text, uuid[]) TO authenticated;

CREATE TABLE IF NOT EXISTS public.workflow_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id = true), phases_enabled boolean NOT NULL DEFAULT false, stages_enabled boolean NOT NULL DEFAULT true, auto_advance_enabled boolean NOT NULL DEFAULT true, progress_bar_enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;
ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_settings read all authenticated" ON public.workflow_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_settings write admins" ON public.workflow_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));
INSERT INTO public.workflow_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cadistas (name, user_id) SELECT COALESCE(p.full_name, p.email), p.id FROM public.profiles p WHERE p.role = 'CADISTA' AND NOT EXISTS (SELECT 1 FROM public.cadistas c WHERE c.user_id = p.id);
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.stage_return_reasons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL, position integer NOT NULL DEFAULT 100, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_return_reasons TO authenticated;
GRANT ALL ON public.stage_return_reasons TO service_role;
ALTER TABLE public.stage_return_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srr_read_staff" ON public.stage_return_reasons FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "srr_write_admin" ON public.stage_return_reasons FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));

CREATE TABLE IF NOT EXISTS public.stage_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (stage_id, user_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_assignments TO authenticated;
GRANT ALL ON public.stage_assignments TO service_role;
ALTER TABLE public.stage_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_read_staff" ON public.stage_assignments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "sa_write_admin" ON public.stage_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dentista'));

CREATE OR REPLACE FUNCTION public.seed_default_workflow() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    INSERT INTO public.stages (name, color, position, phase_id) VALUES ('Recepção','#64748b',10,v_phase),('Preparo','#0ea5e9',20,v_phase),('Cadista','#8b5cf6',30,v_phase),('Fresagem','#f59e0b',40,v_phase),('Acabamento','#10b981',50,v_phase),('Entrega','#22c55e',60,v_phase);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stage_return_reasons) THEN
    INSERT INTO public.stage_return_reasons (label, position) VALUES ('Ajuste de oclusão',10),('Cor incorreta',20),('Contato proximal',30),('Falha de escaneamento',40),('Outro',100);
  END IF;
  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.seed_default_workflow() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_workflow() TO authenticated;

ALTER TABLE public.implant_systems ADD COLUMN IF NOT EXISTS line text;

CREATE TABLE IF NOT EXISTS public.component_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, position integer NOT NULL DEFAULT 100, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.component_categories TO authenticated;
GRANT ALL ON public.component_categories TO service_role;
ALTER TABLE public.component_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "component_categories auth read" ON public.component_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "component_categories staff write" ON public.component_categories FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.implant_system_components (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), implant_system_id uuid NOT NULL REFERENCES public.implant_systems(id) ON DELETE CASCADE, name text NOT NULL, sku text, component_type_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_isc_system ON public.implant_system_components(implant_system_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_system_components TO authenticated;
GRANT ALL ON public.implant_system_components TO service_role;
ALTER TABLE public.implant_system_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "isc auth read" ON public.implant_system_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "isc staff write" ON public.implant_system_components FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS implant_system_component_id uuid REFERENCES public.implant_system_components(id) ON DELETE SET NULL;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.component_categories(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.create_implant_system_with_stock(_name text, _line text, _components jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_system_id uuid; v_cat_id uuid; v_comp jsonb; v_comp_id uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;
  INSERT INTO public.implant_systems (name, line, sort_order) VALUES (_name, NULLIF(_line, ''), 50) RETURNING id INTO v_system_id;
  SELECT id INTO v_cat_id FROM public.component_categories WHERE lower(name) = 'implantes' LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.component_categories (name, position) VALUES ('Implantes', 1000) RETURNING id INTO v_cat_id;
  END IF;
  IF _components IS NOT NULL THEN
    FOR v_comp IN SELECT * FROM jsonb_array_elements(_components) LOOP
      INSERT INTO public.implant_system_components (implant_system_id, name, sku) VALUES (v_system_id, v_comp->>'name', NULLIF(v_comp->>'sku','')) RETURNING id INTO v_comp_id;
      INSERT INTO public.stock_items (category, name, brand, unit, qty_on_hand, min_qty, implant_system_component_id, category_id) VALUES ('component'::stock_category, v_comp->>'name', _name, COALESCE(NULLIF(v_comp->>'unit',''), 'un'), COALESCE((v_comp->>'qty')::numeric, 0), COALESCE((v_comp->>'min_qty')::numeric, 0), v_comp_id, v_cat_id);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('success', true, 'implant_system_id', v_system_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.create_implant_system_with_stock(text, text, jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.backend_backups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid, schema_hash text NOT NULL, size_bytes bigint NOT NULL DEFAULT 0, storage_path text);
GRANT SELECT, INSERT ON public.backend_backups TO authenticated;
GRANT ALL ON public.backend_backups TO service_role;
ALTER TABLE public.backend_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read backend_backups" ON public.backend_backups FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert backend_backups" ON public.backend_backups FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.backend_schema_hash() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT md5(coalesce(string_agg(sig, E'\n' ORDER BY sig), '')) FROM (SELECT table_name || ':' || column_name || ':' || data_type AS sig FROM information_schema.columns WHERE table_schema = 'public') s;
$$;
GRANT EXECUTE ON FUNCTION public.backend_schema_hash() TO authenticated;

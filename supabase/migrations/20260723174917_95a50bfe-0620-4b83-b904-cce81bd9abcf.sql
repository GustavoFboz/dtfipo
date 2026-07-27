-- BATCH 1/6

CREATE TABLE public.doctors (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.patients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, photo_url TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.case_types (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, abbreviation TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.tooth_colors (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.stages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3b82f6', position INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  case_type_id UUID REFERENCES public.case_types(id) ON DELETE SET NULL,
  tooth_color_id UUID REFERENCES public.tooth_colors(id) ON DELETE SET NULL,
  case_label TEXT, entry_date DATE NOT NULL DEFAULT CURRENT_DATE, delivery_date DATE NOT NULL,
  finished_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'active',
  model_done BOOLEAN NOT NULL DEFAULT false, scan_done BOOLEAN NOT NULL DEFAULT false,
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cases_status_idx ON public.cases(status);
CREATE INDEX cases_delivery_idx ON public.cases(delivery_date);
CREATE TABLE public.case_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  pending_count INT NOT NULL DEFAULT 0, position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(case_id, stage_id)
);
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER cases_set_updated BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooth_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_stages ENABLE ROW LEVEL SECURITY;

INSERT INTO public.stages (name, color, position) VALUES ('CADISTA','#0a4dbd',1),('FORNO','#f59e0b',2),('PROVISORIO','#fef3c7',3),('MAQUIAGEM','#ec4899',4);
INSERT INTO public.tooth_colors (code) VALUES ('A1'),('A2'),('A3'),('A3.5'),('B1'),('B2'),('C1'),('D2');
INSERT INTO public.case_types (name, abbreviation) VALUES ('Coroa','Coroa'),('Prótese Superior','Pr. Sup.'),('Prótese Inferior','Pr. Inf.'),('Faceta','Faceta'),('Implante','Implante');
INSERT INTO public.doctors (name) VALUES ('Dr. Leandro');
INSERT INTO public.patients (name) VALUES ('Ieda Queiroz'),('Abidon');

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS folder_url text, ADD COLUMN IF NOT EXISTS folder_done boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_stages ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(), ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE public.phases (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, color text NOT NULL DEFAULT '#3b82f6', position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ADD COLUMN phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;

CREATE TABLE public.cadistas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.cadistas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.components (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, category text, manufacturer text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.case_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  qty int NOT NULL DEFAULT 1, notes text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id, component_id)
);
ALTER TABLE public.case_components ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cases
  ADD COLUMN cadista_id uuid REFERENCES public.cadistas(id) ON DELETE SET NULL,
  ADD COLUMN current_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  ADD COLUMN sibling_case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN arch text;

INSERT INTO public.phases (name, color, position) VALUES ('Entrada','#22c55e',1),('Escaneamento','#06b6d4',2),('Modelo','#a855f7',3),('CAD','#3b82f6',4),('Aprovação','#f59e0b',5),('Produção','#ef4444',6),('Forno','#f97316',7),('Caracterização','#ec4899',8),('Checkup','#14b8a6',9),('Entrega','#10b981',10);

CREATE INDEX idx_cases_status_delivery_date ON public.cases(status, delivery_date);
CREATE INDEX idx_cases_patient_id ON public.cases(patient_id);
CREATE INDEX idx_cases_current_stage_id ON public.cases(current_stage_id);
CREATE INDEX idx_case_stages_case_id ON public.case_stages(case_id);
CREATE INDEX idx_case_components_case_id ON public.case_components(case_id);

ALTER TABLE public.cases ADD COLUMN current_phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL;
CREATE INDEX idx_cases_current_phase_id ON public.cases(current_phase_id);

ALTER TABLE public.cases ADD COLUMN reopened_at timestamptz, ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE public.burrs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, material text NOT NULL CHECK (material IN ('zirconia','dissilicato')), installed_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.burrs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.burr_usages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), burr_id uuid NOT NULL REFERENCES public.burrs(id) ON DELETE CASCADE, case_id uuid, material text NOT NULL CHECK (material IN ('zirconia','dissilicato')), teeth_count int NOT NULL DEFAULT 0, teeth_numbers int[] NOT NULL DEFAULT '{}', milled_at timestamptz NOT NULL DEFAULT now(), notes text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.burr_usages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_burr_usages_burr ON public.burr_usages(burr_id);
CREATE INDEX idx_burr_usages_case ON public.burr_usages(case_id);

ALTER TABLE public.cases
  ADD COLUMN teeth_numbers int[] NOT NULL DEFAULT '{}',
  ADD COLUMN elements_count int NOT NULL DEFAULT 0,
  ADD COLUMN elements_zirconia int NOT NULL DEFAULT 0,
  ADD COLUMN elements_dissilicato int NOT NULL DEFAULT 0,
  ADD COLUMN teeth_zirconia int[] NOT NULL DEFAULT '{}',
  ADD COLUMN teeth_dissilicato int[] NOT NULL DEFAULT '{}';

CREATE TABLE public.case_types_link (
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_type_id uuid NOT NULL REFERENCES public.case_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, case_type_id)
);
ALTER TABLE public.case_types_link ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_case_types_link_case ON public.case_types_link(case_id);

CREATE TABLE public.holders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.holders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.burrs ADD COLUMN holder_id uuid REFERENCES public.holders(id) ON DELETE SET NULL, ADD COLUMN code text;
CREATE UNIQUE INDEX burrs_one_active_per_holder_material ON public.burrs(holder_id, material) WHERE removed_at IS NULL AND holder_id IS NOT NULL;

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','dentista','recepcionista','auxiliar','protetico','cadista'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.cadistas ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, full_name TEXT, email TEXT, phone TEXT, is_default_admin BOOLEAN NOT NULL DEFAULT false, role TEXT DEFAULT 'USER', account_subtype TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role public.app_role NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (user_id, role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[]) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)) $$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','dentista','recepcionista','auxiliar','protetico')) $$;
CREATE OR REPLACE FUNCTION public.is_cadista(_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'cadista') $$;
CREATE OR REPLACE FUNCTION public.can_access_case(_case_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.cases c JOIN public.cadistas cd ON cd.id = c.cadista_id WHERE c.id = _case_id AND cd.user_id = auth.uid()) $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role TEXT; v_full_name TEXT; is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  v_role := COALESCE(new.raw_user_meta_data->>'role','USER');
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  INSERT INTO public.profiles (id, full_name, email, role, is_default_admin) VALUES (new.id, v_full_name, new.email, v_role, is_first) ON CONFLICT (id) DO NOTHING;
  IF is_first THEN INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING; END IF;
  IF v_role = 'CADISTA' THEN INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id); END IF;
  RETURN new;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.backups (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), file_name TEXT NOT NULL, file_size_bytes BIGINT, notes TEXT, created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctors, public.patients, public.case_types, public.tooth_colors, public.stages, public.cases, public.case_stages, public.phases, public.cadistas, public.components, public.case_components, public.burrs, public.burr_usages, public.case_types_link, public.holders TO authenticated;
GRANT ALL ON public.doctors, public.patients, public.case_types, public.tooth_colors, public.stages, public.cases, public.case_stages, public.phases, public.cadistas, public.components, public.case_components, public.burrs, public.burr_usages, public.case_types_link, public.holders TO service_role;

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

CREATE TABLE public.case_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL, file_name text NOT NULL, storage_path text NOT NULL, size_bytes bigint, mime_type text, uploaded_by uuid, uploaded_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'), expired_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_case_attachments_case ON public.case_attachments(case_id);
CREATE INDEX idx_case_attachments_pending_expiry ON public.case_attachments(expires_at) WHERE expired_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_attachments TO authenticated;
GRANT ALL ON public.case_attachments TO service_role;
ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_attachments_select ON public.case_attachments FOR SELECT TO authenticated USING (public.can_access_case(case_id));
CREATE POLICY case_attachments_insert ON public.case_attachments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND public.can_access_case(case_id));
CREATE POLICY case_attachments_update ON public.case_attachments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()) AND public.can_access_case(case_id));
CREATE POLICY case_attachments_delete ON public.case_attachments FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY case_files_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'case-files' AND EXISTS (SELECT 1 FROM public.case_attachments a WHERE a.storage_path = storage.objects.name AND public.can_access_case(a.case_id)));
CREATE POLICY case_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'case-files' AND public.is_staff(auth.uid()));
CREATE POLICY case_files_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'case-files' AND public.is_staff(auth.uid()));
CREATE POLICY patient_photos_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));
CREATE POLICY patient_photos_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));
CREATE POLICY patient_photos_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid())) WITH CHECK (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));
CREATE POLICY patient_photos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'patient-photos' AND public.is_staff(auth.uid()));

CREATE TYPE public.stock_category AS ENUM ('zirconia','dissilicato','component','hygiene');
CREATE TYPE public.stock_movement_type AS ENUM ('in','out','auto_case','reverse_case','adjust');
CREATE TABLE public.stock_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category public.stock_category NOT NULL, name text NOT NULL, brand text, color text, block_type text, unit text NOT NULL DEFAULT 'un', qty_on_hand numeric NOT NULL DEFAULT 0, min_qty numeric NOT NULL DEFAULT 0, component_id uuid REFERENCES public.components(id) ON DELETE SET NULL, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_stock_items_category ON public.stock_items(category);
CREATE INDEX idx_stock_items_component ON public.stock_items(component_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_items_staff_select ON public.stock_items FOR SELECT TO authenticated USING (is_staff(auth.uid()) AND NOT is_cadista(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY stock_items_staff_insert ON public.stock_items FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));
CREATE POLICY stock_items_staff_update ON public.stock_items FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));
CREATE POLICY stock_items_admin_delete ON public.stock_items FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_stock_items_updated_at BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.stock_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE, type public.stock_movement_type NOT NULL, qty numeric NOT NULL, qty_before numeric NOT NULL, qty_after numeric NOT NULL, case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL, user_id uuid, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_stock_movements_item ON public.stock_movements(stock_item_id, created_at DESC);
CREATE INDEX idx_stock_movements_case ON public.stock_movements(case_id);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(created_at DESC);
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

ALTER TABLE public.cases ADD COLUMN zirconia_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL, ADD COLUMN dissilicato_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL, ADD COLUMN stock_consumed_at timestamptz;

CREATE TABLE public.notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sender_id UUID REFERENCES public.profiles(id), recipient_id UUID REFERENCES public.profiles(id), title TEXT NOT NULL, content TEXT NOT NULL, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = recipient_id OR recipient_id IS NULL);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

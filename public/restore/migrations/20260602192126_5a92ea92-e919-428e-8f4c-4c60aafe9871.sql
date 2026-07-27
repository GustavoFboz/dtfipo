-- BLOCK 1: AUTH, ROLES, RLS HARDENING

-- 1. Enum de papéis
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','dentista','recepcionista','auxiliar','protetico','cadista');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Adicionar user_id em cadistas ANTES das funções
ALTER TABLE public.cadistas ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  is_default_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Funções
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('admin','dentista','recepcionista','auxiliar','protetico'))
$$;

CREATE OR REPLACE FUNCTION public.is_cadista(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'cadista')
$$;

CREATE OR REPLACE FUNCTION public.can_access_case(_case_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.cases c
    JOIN public.cadistas cd ON cd.id = c.cadista_id
    WHERE c.id = _case_id AND cd.user_id = auth.uid()
  )
$$;

-- 6. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  INSERT INTO public.profiles (id, full_name, email, is_default_admin)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email, is_first);
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. backups
CREATE TABLE IF NOT EXISTS public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- 8. RLS POLICIES
-- profiles
DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- user_roles
DROP POLICY IF EXISTS user_roles_self_select ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_self_select ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- patients
DROP POLICY IF EXISTS open_select_patients ON public.patients;
DROP POLICY IF EXISTS open_insert_patients ON public.patients;
DROP POLICY IF EXISTS open_update_patients ON public.patients;
DROP POLICY IF EXISTS open_delete_patients ON public.patients;
CREATE POLICY patients_staff_select ON public.patients FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY patients_staff_insert ON public.patients FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY patients_staff_update ON public.patients FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY patients_admin_delete ON public.patients FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- doctors
DROP POLICY IF EXISTS open_select_doctors ON public.doctors;
DROP POLICY IF EXISTS open_insert_doctors ON public.doctors;
DROP POLICY IF EXISTS open_update_doctors ON public.doctors;
DROP POLICY IF EXISTS open_delete_doctors ON public.doctors;
CREATE POLICY doctors_staff_select ON public.doctors FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY doctors_staff_insert ON public.doctors FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY doctors_staff_update ON public.doctors FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY doctors_admin_delete ON public.doctors FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- phases
DROP POLICY IF EXISTS open_select_phases ON public.phases;
DROP POLICY IF EXISTS open_insert_phases ON public.phases;
DROP POLICY IF EXISTS open_update_phases ON public.phases;
DROP POLICY IF EXISTS open_delete_phases ON public.phases;
CREATE POLICY phases_staff_select ON public.phases FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY phases_admin_write ON public.phases FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- stages
DROP POLICY IF EXISTS open_select_stages ON public.stages;
DROP POLICY IF EXISTS open_insert_stages ON public.stages;
DROP POLICY IF EXISTS open_update_stages ON public.stages;
DROP POLICY IF EXISTS open_delete_stages ON public.stages;
CREATE POLICY stages_staff_select ON public.stages FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY stages_admin_write ON public.stages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- tooth_colors
DROP POLICY IF EXISTS open_select_tooth_colors ON public.tooth_colors;
DROP POLICY IF EXISTS open_insert_tooth_colors ON public.tooth_colors;
DROP POLICY IF EXISTS open_update_tooth_colors ON public.tooth_colors;
DROP POLICY IF EXISTS open_delete_tooth_colors ON public.tooth_colors;
CREATE POLICY tooth_colors_staff_select ON public.tooth_colors FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_staff_insert ON public.tooth_colors FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_staff_update ON public.tooth_colors FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY tooth_colors_admin_delete ON public.tooth_colors FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- case_types
DROP POLICY IF EXISTS open_select_case_types ON public.case_types;
DROP POLICY IF EXISTS open_insert_case_types ON public.case_types;
DROP POLICY IF EXISTS open_update_case_types ON public.case_types;
DROP POLICY IF EXISTS open_delete_case_types ON public.case_types;
CREATE POLICY case_types_staff_select ON public.case_types FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY case_types_admin_write ON public.case_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- components
DROP POLICY IF EXISTS open_select_components ON public.components;
DROP POLICY IF EXISTS open_insert_components ON public.components;
DROP POLICY IF EXISTS open_update_components ON public.components;
DROP POLICY IF EXISTS open_delete_components ON public.components;
CREATE POLICY components_staff_select ON public.components FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY components_staff_insert ON public.components FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY components_staff_update ON public.components FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY components_admin_delete ON public.components FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- holders
DROP POLICY IF EXISTS open_select_holders ON public.holders;
DROP POLICY IF EXISTS open_insert_holders ON public.holders;
DROP POLICY IF EXISTS open_update_holders ON public.holders;
DROP POLICY IF EXISTS open_delete_holders ON public.holders;
CREATE POLICY holders_staff_select ON public.holders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY holders_staff_insert ON public.holders FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY holders_staff_update ON public.holders FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY holders_admin_delete ON public.holders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- burrs
DROP POLICY IF EXISTS open_select_burrs ON public.burrs;
DROP POLICY IF EXISTS open_insert_burrs ON public.burrs;
DROP POLICY IF EXISTS open_update_burrs ON public.burrs;
DROP POLICY IF EXISTS open_delete_burrs ON public.burrs;
CREATE POLICY burrs_staff_select ON public.burrs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY burrs_staff_insert ON public.burrs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY burrs_staff_update ON public.burrs FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY burrs_admin_delete ON public.burrs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- cadistas
DROP POLICY IF EXISTS open_select_cadistas ON public.cadistas;
DROP POLICY IF EXISTS open_insert_cadistas ON public.cadistas;
DROP POLICY IF EXISTS open_update_cadistas ON public.cadistas;
DROP POLICY IF EXISTS open_delete_cadistas ON public.cadistas;
CREATE POLICY cadistas_staff_select ON public.cadistas FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY cadistas_admin_write ON public.cadistas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- cases
DROP POLICY IF EXISTS open_select_cases ON public.cases;
DROP POLICY IF EXISTS open_insert_cases ON public.cases;
DROP POLICY IF EXISTS open_update_cases ON public.cases;
DROP POLICY IF EXISTS open_delete_cases ON public.cases;
CREATE POLICY cases_staff_select ON public.cases FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR (cadista_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.cadistas cd WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()))
);
CREATE POLICY cases_staff_insert ON public.cases FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY cases_staff_update ON public.cases FOR UPDATE TO authenticated USING (
  public.is_staff(auth.uid())
  OR (cadista_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.cadistas cd WHERE cd.id = cases.cadista_id AND cd.user_id = auth.uid()))
);
CREATE POLICY cases_admin_delete ON public.cases FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- case_stages
DROP POLICY IF EXISTS open_select_case_stages ON public.case_stages;
DROP POLICY IF EXISTS open_insert_case_stages ON public.case_stages;
DROP POLICY IF EXISTS open_update_case_stages ON public.case_stages;
DROP POLICY IF EXISTS open_delete_case_stages ON public.case_stages;
CREATE POLICY case_stages_access ON public.case_stages FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- case_components
DROP POLICY IF EXISTS open_select_cc ON public.case_components;
DROP POLICY IF EXISTS open_insert_cc ON public.case_components;
DROP POLICY IF EXISTS open_update_cc ON public.case_components;
DROP POLICY IF EXISTS open_delete_cc ON public.case_components;
CREATE POLICY case_components_access ON public.case_components FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- case_types_link
DROP POLICY IF EXISTS open_select_ctl ON public.case_types_link;
DROP POLICY IF EXISTS open_insert_ctl ON public.case_types_link;
DROP POLICY IF EXISTS open_update_ctl ON public.case_types_link;
DROP POLICY IF EXISTS open_delete_ctl ON public.case_types_link;
CREATE POLICY case_types_link_access ON public.case_types_link FOR ALL TO authenticated USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- burr_usages
DROP POLICY IF EXISTS open_select_bu ON public.burr_usages;
DROP POLICY IF EXISTS open_insert_bu ON public.burr_usages;
DROP POLICY IF EXISTS open_update_bu ON public.burr_usages;
DROP POLICY IF EXISTS open_delete_bu ON public.burr_usages;
CREATE POLICY burr_usages_access ON public.burr_usages FOR ALL TO authenticated USING (case_id IS NULL OR public.can_access_case(case_id)) WITH CHECK (case_id IS NULL OR public.can_access_case(case_id));

-- backups
CREATE POLICY backups_admin_all ON public.backups FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

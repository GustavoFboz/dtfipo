-- Extras columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS user_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS clinic_id uuid;

-- Clinics
CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text,
  company_type text NOT NULL DEFAULT 'LAB',
  modules_enabled text[] NOT NULL DEFAULT ARRAY['laboratory']::text[],
  invite_code text UNIQUE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.clinic_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'USER',
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_members TO authenticated;
GRANT ALL ON public.clinic_members TO service_role;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_clinic_member(_clinic_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id=_clinic_id AND user_id=_user_id AND status='active')
$$;

CREATE POLICY clinics_member_select ON public.clinics FOR SELECT TO authenticated
  USING (public.is_clinic_member(id, auth.uid()) OR owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY clinics_owner_update ON public.clinics FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY clinics_insert_authed ON public.clinics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY clinics_admin_delete ON public.clinics FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY cm_self_select ON public.clinic_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_clinic_member(clinic_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY cm_owner_write ON public.clinic_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = clinic_id AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = clinic_id AND (c.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY cm_self_insert ON public.clinic_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Implant systems (referenced by types)
CREATE TABLE IF NOT EXISTS public.implant_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  manufacturer text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implant_systems TO authenticated;
GRANT ALL ON public.implant_systems TO service_role;
ALTER TABLE public.implant_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY implant_systems_staff_select ON public.implant_systems FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY implant_systems_staff_write ON public.implant_systems FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- User code generator
CREATE OR REPLACE FUNCTION public.generate_user_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; BEGIN
  LOOP
    v := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_code = v);
  END LOOP;
  RETURN v;
END $$;

-- Seed IPO clinic + link the user as CEO/admin
DO $$
DECLARE
  v_user uuid := '02be7548-3474-4981-ad1a-865bee3fe309';
  v_clinic uuid;
BEGIN
  INSERT INTO public.clinics (name, kind, company_type, modules_enabled, owner_id, invite_code)
  VALUES ('IPO — Instituto Praia de Odontologia', 'laboratorio', 'IPO',
          ARRAY['laboratory','financial','clinical']::text[], v_user,
          upper(substring(md5(random()::text) from 1 for 8)))
  RETURNING id INTO v_clinic;

  INSERT INTO public.profiles (id, full_name, email, role, account_subtype, is_default_admin, clinic_id, user_code)
  VALUES (v_user, 'Gustavo Vitor', 'gustavovitorfa@gmail.com', 'CEO', 'CEO', true, v_clinic, public.generate_user_code())
  ON CONFLICT (id) DO UPDATE SET
    role='CEO', account_subtype='CEO', is_default_admin=true, clinic_id=v_clinic,
    user_code = COALESCE(public.profiles.user_code, EXCLUDED.user_code);

  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, decided_by, decided_at)
  VALUES (v_clinic, v_user, 'CEO', 'active', v_user, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE SET role='CEO', status='active', decided_at=now();
END $$;
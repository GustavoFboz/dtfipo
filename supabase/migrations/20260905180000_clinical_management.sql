-- Dental Flow / Lovable Cloud — módulo Clínica
-- Cria agenda clínica, financeiro clínico e permissões por perfil.
-- Idempotente e separado do financeiro legado do laboratório.

CREATE TABLE IF NOT EXISTS public.clinic_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role text NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, role, permission)
);

CREATE TABLE IF NOT EXISTS public.clinic_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  title text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.clinic_financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('revenue','expense')),
  category text,
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  due_date date,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.clinic_appointments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_role_permissions_clinic_role_idx
  ON public.clinic_role_permissions (clinic_id, role);
CREATE INDEX IF NOT EXISTS clinic_appointments_clinic_starts_idx
  ON public.clinic_appointments (clinic_id, starts_at);
CREATE INDEX IF NOT EXISTS clinic_appointments_patient_idx
  ON public.clinic_appointments (patient_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS clinic_appointments_doctor_idx
  ON public.clinic_appointments (doctor_id, starts_at);
CREATE INDEX IF NOT EXISTS clinic_financial_entries_clinic_due_idx
  ON public.clinic_financial_entries (clinic_id, due_date);
CREATE INDEX IF NOT EXISTS clinic_financial_entries_patient_idx
  ON public.clinic_financial_entries (patient_id);

CREATE OR REPLACE FUNCTION public.touch_clinical_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinic_role_permissions_touch ON public.clinic_role_permissions;
CREATE TRIGGER trg_clinic_role_permissions_touch
BEFORE UPDATE ON public.clinic_role_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_clinical_updated_at();

DROP TRIGGER IF EXISTS trg_clinic_appointments_touch ON public.clinic_appointments;
CREATE TRIGGER trg_clinic_appointments_touch
BEFORE UPDATE ON public.clinic_appointments
FOR EACH ROW EXECUTE FUNCTION public.touch_clinical_updated_at();

DROP TRIGGER IF EXISTS trg_clinic_financial_entries_touch ON public.clinic_financial_entries;
CREATE TRIGGER trg_clinic_financial_entries_touch
BEFORE UPDATE ON public.clinic_financial_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_clinical_updated_at();

CREATE OR REPLACE FUNCTION public.clinic_module_enabled(_clinic_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinics c
    WHERE c.id = _clinic_id
      AND lower(trim(_module)) = ANY (
        SELECT lower(trim(x)) FROM unnest(c.modules_enabled) AS x
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_clinic_role(_clinic_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(cm.role), ''), NULLIF(trim(p.role), ''), 'USER'))
  FROM public.profiles p
  LEFT JOIN public.clinic_members cm
    ON cm.user_id = p.id
   AND cm.clinic_id = _clinic_id
   AND cm.status = 'approved'
  WHERE p.id = auth.uid()
    AND p.clinic_id = _clinic_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_clinic_permissions(_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.clinic_id = _clinic_id
      AND (
        p.is_default_admin = true
        OR upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(p.role), ''), 'USER')) IN ('CEO','ADMIN')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.clinical_permission_allowed(_clinic_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT public.is_clinic_member(_clinic_id, auth.uid()) THEN RETURN false; END IF;
  IF NOT public.clinic_module_enabled(_clinic_id, 'clinical') THEN RETURN false; END IF;
  IF public.can_manage_clinic_permissions(_clinic_id) THEN RETURN true; END IF;

  v_role := public.current_clinic_role(_clinic_id);
  RETURN EXISTS (
    SELECT 1
    FROM public.clinic_role_permissions p
    WHERE p.clinic_id = _clinic_id
      AND upper(p.role) = upper(COALESCE(v_role, 'USER'))
      AND p.permission = _permission
      AND p.allowed = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_module_enabled(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_clinic_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_clinic_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clinical_permission_allowed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_module_enabled(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_clinic_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_clinic_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_permission_allowed(uuid, text) TO authenticated;

ALTER TABLE public.clinic_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_role_permissions_select ON public.clinic_role_permissions;
CREATE POLICY clinic_role_permissions_select
ON public.clinic_role_permissions FOR SELECT TO authenticated
USING (
  public.is_clinic_member(clinic_id, auth.uid())
  AND public.clinic_module_enabled(clinic_id, 'clinical')
);

DROP POLICY IF EXISTS clinic_role_permissions_write ON public.clinic_role_permissions;
CREATE POLICY clinic_role_permissions_write
ON public.clinic_role_permissions FOR ALL TO authenticated
USING (public.can_manage_clinic_permissions(clinic_id))
WITH CHECK (public.can_manage_clinic_permissions(clinic_id));

DROP POLICY IF EXISTS clinic_appointments_select ON public.clinic_appointments;
CREATE POLICY clinic_appointments_select
ON public.clinic_appointments FOR SELECT TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.appointments'));

DROP POLICY IF EXISTS clinic_appointments_insert ON public.clinic_appointments;
CREATE POLICY clinic_appointments_insert
ON public.clinic_appointments FOR INSERT TO authenticated
WITH CHECK (
  public.clinical_permission_allowed(clinic_id, 'clinical.appointments')
  AND (created_by IS NULL OR created_by = auth.uid())
);

DROP POLICY IF EXISTS clinic_appointments_update ON public.clinic_appointments;
CREATE POLICY clinic_appointments_update
ON public.clinic_appointments FOR UPDATE TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.appointments'))
WITH CHECK (public.clinical_permission_allowed(clinic_id, 'clinical.appointments'));

DROP POLICY IF EXISTS clinic_appointments_delete ON public.clinic_appointments;
CREATE POLICY clinic_appointments_delete
ON public.clinic_appointments FOR DELETE TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.appointments'));

DROP POLICY IF EXISTS clinic_financial_entries_select ON public.clinic_financial_entries;
CREATE POLICY clinic_financial_entries_select
ON public.clinic_financial_entries FOR SELECT TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.financial'));

DROP POLICY IF EXISTS clinic_financial_entries_insert ON public.clinic_financial_entries;
CREATE POLICY clinic_financial_entries_insert
ON public.clinic_financial_entries FOR INSERT TO authenticated
WITH CHECK (
  public.clinical_permission_allowed(clinic_id, 'clinical.financial')
  AND (created_by IS NULL OR created_by = auth.uid())
);

DROP POLICY IF EXISTS clinic_financial_entries_update ON public.clinic_financial_entries;
CREATE POLICY clinic_financial_entries_update
ON public.clinic_financial_entries FOR UPDATE TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.financial'))
WITH CHECK (public.clinical_permission_allowed(clinic_id, 'clinical.financial'));

DROP POLICY IF EXISTS clinic_financial_entries_delete ON public.clinic_financial_entries;
CREATE POLICY clinic_financial_entries_delete
ON public.clinic_financial_entries FOR DELETE TO authenticated
USING (public.clinical_permission_allowed(clinic_id, 'clinical.financial'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_appointments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_financial_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_role_permissions TO authenticated;
GRANT ALL ON public.clinic_appointments, public.clinic_financial_entries, public.clinic_role_permissions TO service_role;

-- Defaults conservadores. Administradores sempre têm acesso total via função acima;
-- estas linhas controlam os demais perfis e podem ser editadas na gestão da Clínica.
INSERT INTO public.clinic_role_permissions (clinic_id, role, permission, allowed)
SELECT c.id, r.role, p.permission, p.allowed
FROM public.clinics c
CROSS JOIN (VALUES
  ('CEO'), ('ADMIN'), ('DR'), ('DENTISTA'), ('ATENDIMENTO'), ('CADISTA'), ('PROTETICO'), ('SOLICITANTE'), ('USER')
) AS r(role)
CROSS JOIN LATERAL (
  VALUES
    ('clinical.dashboard', CASE WHEN r.role IN ('CEO','ADMIN','DR','DENTISTA','ATENDIMENTO') THEN true ELSE false END),
    ('clinical.appointments', CASE WHEN r.role IN ('CEO','ADMIN','DR','DENTISTA','ATENDIMENTO') THEN true ELSE false END),
    ('clinical.patients', CASE WHEN r.role IN ('CEO','ADMIN','DR','DENTISTA','ATENDIMENTO') THEN true ELSE false END),
    ('clinical.financial', CASE WHEN r.role IN ('CEO','ADMIN') THEN true ELSE false END),
    ('clinical.team', CASE WHEN r.role IN ('CEO','ADMIN') THEN true ELSE false END),
    ('clinical.settings', CASE WHEN r.role IN ('CEO','ADMIN') THEN true ELSE false END)
) AS p(permission, allowed)
WHERE public.clinic_module_enabled(c.id, 'clinical')
ON CONFLICT (clinic_id, role, permission) DO NOTHING;

NOTIFY pgrst, 'reload schema';

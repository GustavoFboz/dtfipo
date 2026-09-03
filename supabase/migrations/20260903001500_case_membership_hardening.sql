-- Dental Flow critical case isolation / participation history / approval flow
-- 2026-09-02
--
-- Important model rule:
-- profiles.account_subtype is the concrete working type when present.
-- Example: a profile can have a legacy/base role PROTETICO but account_subtype CADISTA.
-- In that situation the user MUST behave as CADISTA, not as a global PROTETICO.

CREATE OR REPLACE FUNCTION public.effective_user_type(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(
    COALESCE(
      NULLIF(trim(p.account_subtype), ''),
      NULLIF(trim(p.role), ''),
      ''
    )
  )
  FROM public.profiles p
  WHERE p.id = _user_id
$$;

REVOKE ALL ON FUNCTION public.effective_user_type(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_user_type(uuid) TO authenticated, service_role;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cases_accepted_by ON public.cases(accepted_by);

CREATE TABLE IF NOT EXISTS public.case_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_role text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_participants_case_user
  ON public.case_participants(case_id, user_id);
CREATE INDEX IF NOT EXISTS idx_case_participants_user_active
  ON public.case_participants(user_id, case_id)
  WHERE left_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_case_participants_active_role
  ON public.case_participants(case_id, user_id, participant_role)
  WHERE left_at IS NULL;

ALTER TABLE public.case_participants ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.case_participants TO authenticated;
GRANT ALL ON public.case_participants TO service_role;

-- Authoritative case visibility.
CREATE OR REPLACE FUNCTION public.can_access_case(_case_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type text;
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.effective_user_type(v_user), COALESCE(p.is_default_admin, false)
    INTO v_type, v_is_default_admin
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_is_default_admin OR v_type IN ('CEO', 'ADMIN', 'PROTETICO') THEN
    RETURN true;
  END IF;

  IF v_type = 'SOLICITANTE' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      WHERE c.id = _case_id
        AND c.requested_by = v_user
    );
  END IF;

  -- Assigned specialists only receive the case AFTER approval.
  IF v_type = 'CADISTA' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      JOIN public.cadistas cd ON cd.id = c.cadista_id
      WHERE c.id = _case_id
        AND c.status <> 'pendente'
        AND cd.user_id = v_user
    );
  END IF;

  IF v_type IN ('DR', 'DENTISTA') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      JOIN public.doctors d ON d.id = c.doctor_id
      WHERE c.id = _case_id
        AND c.status <> 'pendente'
        AND d.user_id = v_user
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_modify_case(_case_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type text;
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.effective_user_type(v_user), COALESCE(p.is_default_admin, false)
    INTO v_type, v_is_default_admin
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_is_default_admin OR v_type IN ('CEO', 'ADMIN', 'PROTETICO') THEN
    RETURN true;
  END IF;

  IF v_type = 'SOLICITANTE' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      WHERE c.id = _case_id
        AND c.requested_by = v_user
        AND c.status = 'pendente'
    );
  END IF;

  IF v_type = 'CADISTA' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      JOIN public.cadistas cd ON cd.id = c.cadista_id
      WHERE c.id = _case_id
        AND c.status <> 'pendente'
        AND cd.user_id = v_user
    );
  END IF;

  IF v_type IN ('DR', 'DENTISTA') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cases c
      JOIN public.doctors d ON d.id = c.doctor_id
      WHERE c.id = _case_id
        AND c.status <> 'pendente'
        AND d.user_id = v_user
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_case(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_modify_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_modify_case(uuid) TO authenticated, service_role;

-- Remove every old permissive SELECT/UPDATE/DELETE policy from cases.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cases'
      AND cmd IN ('SELECT','UPDATE','DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.cases', p.policyname);
  END LOOP;
END $$;

CREATE POLICY cases_select_by_effective_membership
ON public.cases
FOR SELECT TO authenticated
USING (public.can_access_case(id));

CREATE POLICY cases_update_by_effective_membership
ON public.cases
FOR UPDATE TO authenticated
USING (public.can_modify_case(id))
WITH CHECK (public.can_modify_case(id));

CREATE POLICY cases_delete_by_effective_membership
ON public.cases
FOR DELETE TO authenticated
USING (public.can_modify_case(id));

-- Patient information follows case access. This fixes specialist rows arriving
-- as only "Caso" while also preventing unrelated patient records from leaking.
CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type text;
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN RETURN false; END IF;

  SELECT public.effective_user_type(v_user), COALESCE(p.is_default_admin, false)
    INTO v_type, v_is_default_admin
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_is_default_admin OR v_type IN ('CEO','ADMIN','PROTETICO') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.patient_id = _patient_id
      AND public.can_access_case(c.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_patient(uuid) TO authenticated, service_role;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public' AND tablename='patients' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.patients', p.policyname);
  END LOOP;
END $$;

CREATE POLICY patients_select_by_case_access
ON public.patients
FOR SELECT TO authenticated
USING (public.can_access_patient(id));

-- Keep participation intervals synchronized whenever assigned professionals change.
CREATE OR REPLACE FUNCTION public.sync_case_participant_intervals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_user uuid;
  v_new_user uuid;
  v_now timestamptz := now();
BEGIN
  -- Requester belongs from request creation onward.
  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_by IS NOT NULL THEN
      INSERT INTO public.case_participants(case_id,user_id,participant_role,joined_at)
      VALUES (NEW.id,NEW.requested_by,'SOLICITANTE',COALESCE(NEW.created_at,v_now))
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    IF OLD.requested_by IS NOT NULL THEN
      UPDATE public.case_participants
        SET left_at=v_now
      WHERE case_id=NEW.id AND user_id=OLD.requested_by
        AND participant_role='SOLICITANTE' AND left_at IS NULL;
    END IF;
    IF NEW.requested_by IS NOT NULL THEN
      INSERT INTO public.case_participants(case_id,user_id,participant_role,joined_at)
      VALUES (NEW.id,NEW.requested_by,'SOLICITANTE',v_now)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- CADISTA: pending requests are not visible until accepted.
  IF TG_OP = 'UPDATE' AND OLD.cadista_id IS DISTINCT FROM NEW.cadista_id AND OLD.cadista_id IS NOT NULL THEN
    SELECT user_id INTO v_old_user FROM public.cadistas WHERE id=OLD.cadista_id;
    IF v_old_user IS NOT NULL THEN
      UPDATE public.case_participants SET left_at=v_now
      WHERE case_id=NEW.id AND user_id=v_old_user
        AND participant_role='CADISTA' AND left_at IS NULL;
    END IF;
  END IF;

  IF NEW.status <> 'pendente' AND NEW.cadista_id IS NOT NULL
     AND (TG_OP='INSERT' OR OLD.cadista_id IS DISTINCT FROM NEW.cadista_id OR OLD.status='pendente') THEN
    SELECT user_id INTO v_new_user FROM public.cadistas WHERE id=NEW.cadista_id;
    IF v_new_user IS NOT NULL THEN
      INSERT INTO public.case_participants(case_id,user_id,participant_role,joined_at)
      VALUES (NEW.id,v_new_user,'CADISTA',v_now)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- DENTISTA/DR: same visibility rule as cadista.
  v_old_user := NULL;
  v_new_user := NULL;
  IF TG_OP = 'UPDATE' AND OLD.doctor_id IS DISTINCT FROM NEW.doctor_id AND OLD.doctor_id IS NOT NULL THEN
    SELECT user_id INTO v_old_user FROM public.doctors WHERE id=OLD.doctor_id;
    IF v_old_user IS NOT NULL THEN
      UPDATE public.case_participants SET left_at=v_now
      WHERE case_id=NEW.id AND user_id=v_old_user
        AND participant_role='DENTISTA' AND left_at IS NULL;
    END IF;
  END IF;

  IF NEW.status <> 'pendente' AND NEW.doctor_id IS NOT NULL
     AND (TG_OP='INSERT' OR OLD.doctor_id IS DISTINCT FROM NEW.doctor_id OR OLD.status='pendente') THEN
    SELECT user_id INTO v_new_user FROM public.doctors WHERE id=NEW.doctor_id;
    IF v_new_user IS NOT NULL THEN
      INSERT INTO public.case_participants(case_id,user_id,participant_role,joined_at)
      VALUES (NEW.id,v_new_user,'DENTISTA',v_now)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_case_participant_intervals ON public.cases;
CREATE TRIGGER trg_sync_case_participant_intervals
AFTER INSERT OR UPDATE OF cadista_id, doctor_id, requested_by, status
ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.sync_case_participant_intervals();

-- Backfill current membership. Existing current professionals are considered to
-- have joined at case creation because historic assignment timestamps did not exist.
INSERT INTO public.case_participants(case_id,user_id,participant_role,joined_at)
SELECT c.id,c.requested_by,'SOLICITANTE',c.created_at
FROM public.cases c
WHERE c.requested_by IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.case_participants(case_id,user_id,participant_role,joined_at)
SELECT c.id,cd.user_id,'CADISTA',c.created_at
FROM public.cases c
JOIN public.cadistas cd ON cd.id=c.cadista_id
WHERE c.status <> 'pendente' AND cd.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.case_participants(case_id,user_id,participant_role,joined_at)
SELECT c.id,d.user_id,'DENTISTA',c.created_at
FROM public.cases c
JOIN public.doctors d ON d.id=c.doctor_id
WHERE c.status <> 'pendente' AND d.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE POLICY case_participants_select_self_or_global
ON public.case_participants
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.effective_user_type(auth.uid()) IN ('CEO','ADMIN','PROTETICO')
);

-- Chat privacy: a newly assigned professional cannot read comments sent before
-- their current participation interval began.
CREATE OR REPLACE FUNCTION public.can_read_case_message(_case_id uuid, _created_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type text;
  v_is_default_admin boolean := false;
BEGIN
  IF v_user IS NULL THEN RETURN false; END IF;

  SELECT public.effective_user_type(v_user), COALESCE(p.is_default_admin,false)
    INTO v_type,v_is_default_admin
  FROM public.profiles p
  WHERE p.id=v_user;

  IF v_is_default_admin OR v_type IN ('CEO','ADMIN','PROTETICO') THEN RETURN true; END IF;

  IF v_type='SOLICITANTE' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id=_case_id AND c.requested_by=v_user
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.case_participants cp
    WHERE cp.case_id=_case_id
      AND cp.user_id=v_user
      AND cp.joined_at <= _created_at
      AND (cp.left_at IS NULL OR _created_at < cp.left_at)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_case_message(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_case_message(uuid,timestamptz) TO authenticated, service_role;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public' AND tablename='case_activity' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.case_activity', p.policyname);
  END LOOP;
END $$;

CREATE POLICY case_activity_select_by_membership_time
ON public.case_activity
FOR SELECT TO authenticated
USING (
  public.can_access_case(case_id)
  AND (
    kind <> 'comment'
    OR public.can_read_case_message(case_id, created_at)
  )
);

-- Atomic acceptance: accepting user becomes responsible prosthetist.
CREATE OR REPLACE FUNCTION public.accept_case_request_secure(p_case_id uuid)
RETURNS public.cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type text;
  v_admin boolean := false;
  v_case public.cases;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT public.effective_user_type(v_user), COALESCE(p.is_default_admin,false)
    INTO v_type,v_admin
  FROM public.profiles p
  WHERE p.id=v_user;

  IF NOT (v_admin OR v_type IN ('CEO','ADMIN','PROTETICO')) THEN
    RAISE EXCEPTION 'Sem permissão para aceitar solicitações';
  END IF;

  UPDATE public.cases
  SET status='em_andamento',
      accepted_by=v_user,
      accepted_at=now(),
      updated_at=now()
  WHERE id=p_case_id
    AND status='pendente'
  RETURNING * INTO v_case;

  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou já processada';
  END IF;

  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_case_request_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_case_request_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_case_request_secure(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_cadistas_user_id ON public.cadistas(user_id);
CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON public.doctors(user_id);


-- Attachment deletion must follow case membership, not the legacy admin-only rule.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public' AND tablename='case_attachments' AND cmd='DELETE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.case_attachments', p.policyname);
  END LOOP;
END $$;

CREATE POLICY case_attachments_delete_by_case_access
ON public.case_attachments
FOR DELETE TO authenticated
USING (public.can_modify_case(case_id));

-- Storage object deletion for case-files. The first path segment is the case UUID.
DROP POLICY IF EXISTS case_files_delete_by_case_access ON storage.objects;
CREATE POLICY case_files_delete_by_case_access
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'case-files'
  AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  AND public.can_modify_case(split_part(name, '/', 1)::uuid)
);


-- Small, permission-aware projection used by the case dialog.
CREATE OR REPLACE FUNCTION public.get_case_responsibility(p_case_id uuid)
RETURNS TABLE (
  accepted_by uuid,
  accepted_name text,
  requester_id uuid,
  requester_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.accepted_by,
    COALESCE(ap.full_name, ap.email),
    c.requested_by,
    COALESCE(rp.full_name, rp.email)
  FROM public.cases c
  LEFT JOIN public.profiles ap ON ap.id = c.accepted_by
  LEFT JOIN public.profiles rp ON rp.id = c.requested_by
  WHERE c.id = p_case_id
    AND public.can_access_case(c.id)
$$;

REVOKE ALL ON FUNCTION public.get_case_responsibility(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_case_responsibility(uuid) TO authenticated, service_role;


-- Conditional workflow flags (Mockup / Provisório).
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS has_mockup boolean NOT NULL DEFAULT false;

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS condition_key text;

-- Existing named stages become conditional automatically. Custom stages remain
-- unconditional unless condition_key is assigned later.
UPDATE public.stages
SET condition_key = CASE
  WHEN lower(unaccent(name)) LIKE '%mockup%' THEN 'mockup'
  WHEN lower(unaccent(name)) LIKE '%provisor%' THEN 'provisional'
  ELSE condition_key
END
WHERE condition_key IS NULL;

ALTER TABLE public.stages
  DROP CONSTRAINT IF EXISTS stages_condition_key_check;
ALTER TABLE public.stages
  ADD CONSTRAINT stages_condition_key_check
  CHECK (condition_key IS NULL OR condition_key IN ('mockup','provisional'));

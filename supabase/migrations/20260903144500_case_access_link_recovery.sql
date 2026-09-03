-- Recover legitimate specialist access when legacy cadista/doctor rows are not
-- linked through user_id but share the authenticated profile id.
-- This remains case-scoped and does not grant access to unrelated specialists.

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
  IF v_user IS NULL THEN RETURN false; END IF;

  SELECT public.effective_user_type(v_user), COALESCE(p.is_default_admin,false)
    INTO v_type,v_is_default_admin
  FROM public.profiles p WHERE p.id=v_user;

  IF v_is_default_admin OR v_type IN ('CEO','ADMIN','PROTETICO') THEN RETURN true; END IF;

  IF v_type='SOLICITANTE' THEN
    RETURN EXISTS (SELECT 1 FROM public.cases c WHERE c.id=_case_id AND c.requested_by=v_user);
  END IF;

  IF v_type='CADISTA' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.cases c
      JOIN public.cadistas cd ON cd.id=c.cadista_id
      WHERE c.id=_case_id AND c.status <> 'pendente'
        AND (cd.user_id=v_user OR cd.id=v_user)
    );
  END IF;

  IF v_type IN ('DR','DENTISTA') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.cases c
      JOIN public.doctors d ON d.id=c.doctor_id
      WHERE c.id=_case_id AND c.status <> 'pendente'
        AND (d.user_id=v_user OR d.id=v_user)
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
  IF v_user IS NULL THEN RETURN false; END IF;
  SELECT public.effective_user_type(v_user), COALESCE(p.is_default_admin,false)
    INTO v_type,v_is_default_admin FROM public.profiles p WHERE p.id=v_user;

  IF v_is_default_admin OR v_type IN ('CEO','ADMIN','PROTETICO') THEN RETURN true; END IF;
  IF v_type='SOLICITANTE' THEN
    RETURN EXISTS (SELECT 1 FROM public.cases c WHERE c.id=_case_id AND c.requested_by=v_user AND c.status='pendente');
  END IF;
  IF v_type='CADISTA' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.cases c JOIN public.cadistas cd ON cd.id=c.cadista_id
      WHERE c.id=_case_id AND c.status <> 'pendente' AND (cd.user_id=v_user OR cd.id=v_user)
    );
  END IF;
  IF v_type IN ('DR','DENTISTA') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.cases c JOIN public.doctors d ON d.id=c.doctor_id
      WHERE c.id=_case_id AND c.status <> 'pendente' AND (d.user_id=v_user OR d.id=v_user)
    );
  END IF;
  RETURN false;
END;
$$;

NOTIFY pgrst, 'reload schema';

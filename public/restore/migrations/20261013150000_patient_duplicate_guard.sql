-- Guard patient identity at the database boundary without making names globally unique.
-- The clinic-scoped advisory lock serializes concurrent inserts with the same normalized name.
CREATE OR REPLACE FUNCTION public.guard_patient_duplicate_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_clinic uuid;
  v_clinic uuid;
  v_name text;
  v_cpf text;
  v_rg text;
  v_phone text;
  v_duplicate_name boolean;
  v_duplicate_identity boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND TG_OP = 'INSERT' THEN
    v_actor_clinic := public.storage_current_clinic_id();
    IF v_actor_clinic IS NULL THEN
      RAISE EXCEPTION 'PATIENT_CLINIC_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF NEW.clinic_id IS NOT NULL AND NEW.clinic_id IS DISTINCT FROM v_actor_clinic THEN
      RAISE EXCEPTION 'PATIENT_CLINIC_MISMATCH' USING ERRCODE = '42501';
    END IF;
    NEW.clinic_id := v_actor_clinic;
  ELSIF auth.uid() IS NOT NULL AND TG_OP = 'UPDATE'
      AND NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
    RAISE EXCEPTION 'PATIENT_CLINIC_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_clinic := COALESCE(NEW.clinic_id, public.resolve_patient_clinic_id(NEW.id));
  v_name := public.normalize_text(
    regexp_replace(trim(COALESCE(NEW.name, concat_ws(' ', NEW.first_name, NEW.last_name))), '[[:space:]]+', ' ', 'g')
  );
  IF v_clinic IS NULL OR v_name = '' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_clinic::text || ':' || v_name, 0));

  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id IS DISTINCT FROM NEW.id
      AND (
        p.clinic_id = v_clinic
        OR (p.clinic_id IS NULL AND public.resolve_patient_clinic_id(p.id) = v_clinic)
      )
      AND public.normalize_text(regexp_replace(trim(COALESCE(p.name, '')), '[[:space:]]+', ' ', 'g')) = v_name
  ) INTO v_duplicate_name;

  IF NOT v_duplicate_name THEN
    RETURN NEW;
  END IF;

  v_cpf := regexp_replace(COALESCE(NEW.cpf, ''), '[^0-9]', '', 'g');
  v_rg := public.normalize_text(regexp_replace(trim(COALESCE(NEW.rg, '')), '[^[:alnum:]]', '', 'g'));
  v_phone := regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]', '', 'g');

  IF v_cpf = '' AND v_rg = '' AND v_phone = '' THEN
    RAISE EXCEPTION 'PATIENT_DUPLICATE_NAME_REQUIRES_IDENTIFIER'
      USING ERRCODE = '23514',
      HINT = 'Informe CPF, RG ou telefone para cadastrar outra pessoa com o mesmo nome.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id IS DISTINCT FROM NEW.id
      AND (
        p.clinic_id = v_clinic
        OR (p.clinic_id IS NULL AND public.resolve_patient_clinic_id(p.id) = v_clinic)
      )
      AND public.normalize_text(regexp_replace(trim(COALESCE(p.name, '')), '[[:space:]]+', ' ', 'g')) = v_name
      AND (
        (v_cpf <> '' AND regexp_replace(COALESCE(p.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
        OR (v_rg <> '' AND public.normalize_text(regexp_replace(trim(COALESCE(p.rg, '')), '[^[:alnum:]]', '', 'g')) = v_rg)
        OR (
          v_cpf = '' AND v_rg = '' AND v_phone <> ''
          AND regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') = v_phone
          AND NULLIF(trim(COALESCE(p.cpf, '')), '') IS NULL
          AND NULLIF(trim(COALESCE(p.rg, '')), '') IS NULL
        )
      )
  ) INTO v_duplicate_identity;

  IF v_duplicate_identity THEN
    RAISE EXCEPTION 'PATIENT_DUPLICATE_IDENTITY_EXISTS'
      USING ERRCODE = '23505',
      HINT = 'Selecione o paciente existente em vez de criar uma duplicata.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_patient_duplicate_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_patient_duplicate_identity() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_patients_duplicate_guard ON public.patients;
CREATE TRIGGER trg_patients_duplicate_guard
BEFORE INSERT OR UPDATE OF name, cpf, rg, phone, clinic_id
ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.guard_patient_duplicate_identity();

NOTIFY pgrst, 'reload schema';

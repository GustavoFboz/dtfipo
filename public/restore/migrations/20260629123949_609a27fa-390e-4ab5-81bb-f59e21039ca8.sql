
-- Patient details columns (form expects them)
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS medical_history text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS medications text,
  ADD COLUMN IF NOT EXISTS clinical_notes text,
  ADD COLUMN IF NOT EXISTS name_unaccent text;

-- Helper para busca sem acento (sem extensão unaccent)
CREATE OR REPLACE FUNCTION public.normalize_text(s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(coalesce(s,''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;

CREATE OR REPLACE FUNCTION public.patients_set_unaccent()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.name_unaccent := public.normalize_text(NEW.name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_patients_unaccent ON public.patients;
CREATE TRIGGER trg_patients_unaccent BEFORE INSERT OR UPDATE OF name ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_set_unaccent();

UPDATE public.patients SET name_unaccent = public.normalize_text(name) WHERE name_unaccent IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_name_unaccent ON public.patients (name_unaccent);

-- ============ N4: Numeração sequencial amigável de casos ============
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_number bigint;
CREATE SEQUENCE IF NOT EXISTS public.cases_case_number_seq START WITH 1000;

-- Backfill ordenado por created_at
DO $$
DECLARE r RECORD; n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.cases WHERE case_number IS NULL) THEN
    FOR r IN SELECT id FROM public.cases WHERE case_number IS NULL ORDER BY created_at LOOP
      n := nextval('public.cases_case_number_seq');
      UPDATE public.cases SET case_number = n WHERE id = r.id;
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.cases ALTER COLUMN case_number SET DEFAULT nextval('public.cases_case_number_seq');
ALTER TABLE public.cases ALTER COLUMN case_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_key ON public.cases(case_number);

-- ============ N1: RPC para edição de membros (evita problemas de RLS) ============
CREATE OR REPLACE FUNCTION public.update_team_member(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text,
  p_category_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  UPDATE public.profiles
     SET full_name = p_full_name,
         email = p_email,
         phone = p_phone,
         role = p_role,
         account_subtype = p_role,
         updated_at = now()
   WHERE id = p_user_id;

  DELETE FROM public.user_stock_access
   WHERE user_id = p_user_id
     AND (p_category_ids IS NULL OR NOT (category_id = ANY(p_category_ids)));

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO public.user_stock_access(user_id, category_id, created_by)
    SELECT p_user_id, c, auth.uid() FROM unnest(p_category_ids) AS c
    ON CONFLICT (user_id, category_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

GRANT EXECUTE ON FUNCTION public.update_team_member(uuid, text, text, text, text, uuid[]) TO authenticated;

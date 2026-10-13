-- Transactional, idempotent patient/case creation.
-- The UI never falls back to a non-idempotent INSERT when these RPCs are missing.
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS has_mockup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prosthesis_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.creation_requests (
  idempotency_key uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('patient', 'case')),
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creation_requests_actor_created_idx
  ON public.creation_requests (actor_id, created_at DESC);

ALTER TABLE public.creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creation_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.creation_requests TO service_role;

CREATE OR REPLACE FUNCTION public.create_patient_idempotent_v1(
  _key uuid,
  _id uuid,
  _values jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_clinic uuid;
  v_hash text;
  v_name text;
  v_name_normalized text;
  v_cpf text;
  v_rg text;
  v_phone text;
  v_duplicate_name boolean := false;
  v_duplicate_identity boolean := false;
  v_request public.creation_requests%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_existing public.patients%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF _key IS NULL OR _id IS NULL OR _values IS NULL OR jsonb_typeof(_values) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_CREATION_ATTEMPT' USING ERRCODE = '22023';
  END IF;

  SELECT p.clinic_id
    INTO v_clinic
    FROM public.profiles p
   WHERE p.id = v_actor;

  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'PATIENT_CLINIC_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(public.company_has_operational_access(v_clinic), false) THEN
    RAISE EXCEPTION 'PATIENT_COMPANY_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(_values->>'clinic_id', '') IS NOT NULL
     AND NULLIF(_values->>'clinic_id', '')::uuid IS DISTINCT FROM v_clinic THEN
    RAISE EXCEPTION 'PATIENT_CLINIC_MISMATCH' USING ERRCODE = '42501';
  END IF;

  v_name := trim(regexp_replace(
    COALESCE(
      NULLIF(trim(_values->>'name'), ''),
      concat_ws(' ', NULLIF(trim(_values->>'first_name'), ''), NULLIF(trim(_values->>'last_name'), ''))
    ),
    '[[:space:]]+', ' ', 'g'
  ));
  IF COALESCE(v_name, '') = '' THEN
    RAISE EXCEPTION 'PATIENT_NAME_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_name_normalized := public.normalize_text(v_name);
  v_cpf := regexp_replace(COALESCE(_values->>'cpf', ''), '[^0-9]', '', 'g');
  v_rg := public.normalize_text(regexp_replace(trim(COALESCE(_values->>'rg', '')), '[^[:alnum:]]', '', 'g'));
  v_phone := regexp_replace(COALESCE(_values->>'phone', ''), '[^0-9]', '', 'g');
  v_hash := md5(jsonb_build_object('id', _id, 'values', _values)::text);

  PERFORM pg_advisory_xact_lock(hashtextextended('dentalflow:creation:' || _key::text, 0));

  SELECT *
    INTO v_request
    FROM public.creation_requests r
   WHERE r.idempotency_key = _key
   FOR UPDATE;

  IF FOUND THEN
    IF v_request.actor_id IS DISTINCT FROM v_actor
       OR v_request.operation IS DISTINCT FROM 'patient'
       OR v_request.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    SELECT *
      INTO v_existing
      FROM public.patients p
     WHERE p.id = NULLIF(v_request.result->>'id', '')::uuid
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF COALESCE(v_existing.clinic_id, public.resolve_patient_clinic_id(v_existing.id)) IS DISTINCT FROM v_clinic THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(v_existing);
  END IF;

  SELECT *
    INTO v_existing
    FROM public.patients p
   WHERE p.id = _id
   FOR UPDATE;

  IF FOUND THEN
    IF COALESCE(v_existing.clinic_id, public.resolve_patient_clinic_id(v_existing.id)) IS DISTINCT FROM v_clinic
       OR public.normalize_text(regexp_replace(trim(COALESCE(v_existing.name, '')), '[[:space:]]+', ' ', 'g')) IS DISTINCT FROM v_name_normalized
       OR (v_cpf <> '' AND regexp_replace(COALESCE(v_existing.cpf, ''), '[^0-9]', '', 'g') IS DISTINCT FROM v_cpf)
       OR (v_rg <> '' AND public.normalize_text(regexp_replace(trim(COALESCE(v_existing.rg, '')), '[^[:alnum:]]', '', 'g')) IS DISTINCT FROM v_rg)
       OR (v_phone <> '' AND regexp_replace(COALESCE(v_existing.phone, ''), '[^0-9]', '', 'g') IS DISTINCT FROM v_phone) THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    v_patient := v_existing;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.patients p
       WHERE p.id IS DISTINCT FROM _id
         AND (
           p.clinic_id = v_clinic
           OR (p.clinic_id IS NULL AND public.resolve_patient_clinic_id(p.id) = v_clinic)
         )
         AND public.normalize_text(regexp_replace(trim(COALESCE(p.name, '')), '[[:space:]]+', ' ', 'g')) = v_name_normalized
    ) INTO v_duplicate_name;

    IF v_duplicate_name THEN
      IF v_cpf = '' AND v_rg = '' AND v_phone = '' THEN
        RAISE EXCEPTION 'PATIENT_NAME_MATCH'
          USING ERRCODE = '23514',
          HINT = 'Selecione o paciente existente ou informe CPF, RG ou telefone.';
      END IF;

      SELECT EXISTS (
        SELECT 1
          FROM public.patients p
         WHERE p.id IS DISTINCT FROM _id
           AND (
             p.clinic_id = v_clinic
             OR (p.clinic_id IS NULL AND public.resolve_patient_clinic_id(p.id) = v_clinic)
           )
           AND public.normalize_text(regexp_replace(trim(COALESCE(p.name, '')), '[[:space:]]+', ' ', 'g')) = v_name_normalized
           AND (
             (v_cpf <> '' AND regexp_replace(COALESCE(p.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
             OR (v_rg <> '' AND public.normalize_text(regexp_replace(trim(COALESCE(p.rg, '')), '[^[:alnum:]]', '', 'g')) = v_rg)
             OR (
               v_phone <> ''
               AND regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') = v_phone
               AND (
                 (v_cpf = '' AND v_rg = '')
                 OR (
                   NULLIF(trim(COALESCE(p.cpf, '')), '') IS NULL
                   AND NULLIF(trim(COALESCE(p.rg, '')), '') IS NULL
                 )
               )
             )
           )
      ) INTO v_duplicate_identity;

      IF v_duplicate_identity THEN
        RAISE EXCEPTION 'PATIENT_DUPLICATE_IDENTITY_EXISTS'
          USING ERRCODE = '23505',
          HINT = 'Selecione o paciente existente em vez de criar uma duplicata.';
      END IF;
    END IF;

    INSERT INTO public.patients (
      id, name, first_name, last_name, age, birth_date, gender,
      cpf, rg, phone, email, address, medical_history, allergies,
      medications, clinical_notes, notes, photo_url, clinic_id
    ) VALUES (
      _id,
      v_name,
      NULLIF(trim(_values->>'first_name'), ''),
      NULLIF(trim(_values->>'last_name'), ''),
      CASE WHEN NULLIF(_values->>'age', '') ~ '^[0-9]+$' THEN (_values->>'age')::integer ELSE NULL END,
      CASE WHEN NULLIF(_values->>'birth_date', '') IS NULL THEN NULL ELSE (_values->>'birth_date')::date END,
      NULLIF(_values->>'gender', ''),
      NULLIF(_values->>'cpf', ''),
      NULLIF(_values->>'rg', ''),
      NULLIF(_values->>'phone', ''),
      NULLIF(_values->>'email', ''),
      NULLIF(_values->>'address', ''),
      NULLIF(_values->>'medical_history', ''),
      NULLIF(_values->>'allergies', ''),
      NULLIF(_values->>'medications', ''),
      NULLIF(_values->>'clinical_notes', ''),
      NULLIF(_values->>'notes', ''),
      NULLIF(_values->>'photo_url', ''),
      v_clinic
    )
    RETURNING * INTO v_patient;
  END IF;

  v_result := to_jsonb(v_patient);
  INSERT INTO public.creation_requests (idempotency_key, actor_id, operation, request_hash, result)
  VALUES (_key, v_actor, 'patient', v_hash, v_result);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_idempotent_v1(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_idempotent_v1(uuid, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_case_idempotent_v1(
  _key uuid,
  _input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_clinic uuid;
  v_role text;
  v_hash text;
  v_request public.creation_requests%ROWTYPE;
  v_case public.cases%ROWTYPE;
  v_existing public.cases%ROWTYPE;
  v_main_case public.cases%ROWTYPE;
  v_sibling_case public.cases%ROWTYPE;
  v_patient_id uuid;
  v_main_id uuid;
  v_sibling_id uuid;
  v_case_id uuid;
  v_case_type_id uuid;
  v_doctor_id uuid;
  v_cadista_id uuid;
  v_tooth_color_id uuid;
  v_implant_system_id uuid;
  v_scan_jig_id uuid;
  v_stage_id uuid;
  v_phase_id uuid;
  v_requested_by uuid;
  v_entry_date date;
  v_delivery_date date;
  v_arch text;
  v_also_arch text;
  v_row_arch text;
  v_sibling_for_row uuid;
  v_status text;
  v_case_label text;
  v_folder_url text;
  v_notes text;
  v_has_provisional boolean;
  v_has_mockup boolean;
  v_teeth_numbers integer[] := ARRAY[]::integer[];
  v_teeth_zirconia integer[] := ARRAY[]::integer[];
  v_teeth_dissilicato integer[] := ARRAY[]::integer[];
  v_implant_teeth integer[] := ARRAY[]::integer[];
  v_implant_system_ids uuid[] := ARRAY[]::uuid[];
  v_case_type_ids jsonb := '[]'::jsonb;
  v_component_ids jsonb := '[]'::jsonb;
  v_tooth_case_types jsonb := '{}'::jsonb;
  v_tooth_implant_systems jsonb := '{}'::jsonb;
  v_prosthesis_groups jsonb := '[]'::jsonb;
  v_gum_info jsonb;
  v_case_ids uuid[];
  v_arches text[];
  v_split boolean := false;
  v_replayed boolean := false;
  v_case_rows jsonb := '[]'::jsonb;
  v_result jsonb;
  v_case_id_text text;
  v_i integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF _key IS NULL OR _input IS NULL OR jsonb_typeof(_input) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_CREATION_ATTEMPT' USING ERRCODE = '22023';
  END IF;

  SELECT p.clinic_id,
         upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(p.role::text), ''), ''))
    INTO v_clinic, v_role
    FROM public.profiles p
   WHERE p.id = v_actor;

  IF v_clinic IS NULL OR NOT COALESCE(public.company_has_operational_access(v_clinic), false) THEN
    RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  v_hash := md5(_input::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('dentalflow:creation:' || _key::text, 0));

  SELECT *
    INTO v_request
    FROM public.creation_requests r
   WHERE r.idempotency_key = _key
   FOR UPDATE;

  IF FOUND THEN
    IF v_request.actor_id IS DISTINCT FROM v_actor
       OR v_request.operation IS DISTINCT FROM 'case'
       OR v_request.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    v_main_id := NULLIF(v_request.result->'case'->>'id', '')::uuid;
    SELECT * INTO v_main_case FROM public.cases c WHERE c.id = v_main_id;
    IF NOT FOUND OR NOT public.can_access_patient(v_main_case.patient_id) THEN
      RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;

    FOR v_case_id_text IN
      SELECT item.value->>'id'
        FROM jsonb_array_elements(COALESCE(v_request.result->'cases', '[]'::jsonb)) AS item(value)
    LOOP
      SELECT * INTO v_case FROM public.cases c WHERE c.id = v_case_id_text::uuid;
      IF NOT FOUND OR NOT public.can_access_patient(v_case.patient_id) THEN
        RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
      END IF;
      v_case_rows := v_case_rows || jsonb_build_array(to_jsonb(v_case));
    END LOOP;

    RETURN jsonb_build_object('case', to_jsonb(v_main_case), 'cases', v_case_rows, 'replayed', true);
  END IF;

  v_patient_id := NULLIF(_input->>'patient_id', '')::uuid;
  IF v_patient_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = v_patient_id) THEN
    RAISE EXCEPTION 'PATIENT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  v_entry_date := COALESCE(NULLIF(_input->>'entry_date', '')::date, CURRENT_DATE);
  v_delivery_date := NULLIF(_input->>'delivery_date', '')::date;
  IF v_delivery_date IS NULL THEN
    RAISE EXCEPTION 'CASE_DELIVERY_DATE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_doctor_id := NULLIF(_input->>'doctor_id', '')::uuid;
  v_cadista_id := NULLIF(_input->>'cadista_id', '')::uuid;
  v_tooth_color_id := NULLIF(_input->>'tooth_color_id', '')::uuid;
  v_case_label := NULLIF(_input->>'case_label', '');
  v_folder_url := NULLIF(_input->>'folder_url', '');
  v_notes := NULLIF(_input->>'notes', '');
  v_has_provisional := COALESCE(NULLIF(_input->>'has_provisional', '')::boolean, false);
  v_has_mockup := COALESCE(NULLIF(_input->>'has_mockup', '')::boolean, false);
  v_scan_jig_id := NULLIF(_input->>'scan_jig_id', '')::uuid;
  v_gum_info := CASE WHEN jsonb_typeof(_input->'gum_info') = 'object' THEN _input->'gum_info' ELSE NULL END;
  v_tooth_case_types := CASE WHEN jsonb_typeof(_input->'tooth_case_types') = 'object' THEN _input->'tooth_case_types' ELSE '{}'::jsonb END;
  v_tooth_implant_systems := CASE WHEN jsonb_typeof(_input->'tooth_implant_systems') = 'object' THEN _input->'tooth_implant_systems' ELSE '{}'::jsonb END;
  v_prosthesis_groups := CASE WHEN jsonb_typeof(_input->'prosthesis_groups') = 'array' THEN _input->'prosthesis_groups' ELSE '[]'::jsonb END;
  v_component_ids := CASE WHEN jsonb_typeof(_input->'component_ids') = 'array' THEN _input->'component_ids' ELSE '[]'::jsonb END;

  IF jsonb_typeof(_input->'case_type_ids') = 'array' AND jsonb_array_length(_input->'case_type_ids') > 0 THEN
    v_case_type_ids := _input->'case_type_ids';
  ELSIF NULLIF(_input->>'case_type_id', '') IS NOT NULL THEN
    v_case_type_ids := jsonb_build_array(_input->>'case_type_id');
  END IF;
  v_case_type_id := COALESCE(NULLIF(_input->>'case_type_id', '')::uuid, NULLIF(v_case_type_ids->>0, '')::uuid);

  SELECT COALESCE(array_agg(item.value::integer), ARRAY[]::integer[])
    INTO v_teeth_numbers
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(_input->'teeth_numbers') = 'array' THEN _input->'teeth_numbers' ELSE '[]'::jsonb END) AS item(value)
   WHERE item.value IS NOT NULL AND item.value <> '';
  SELECT COALESCE(array_agg(item.value::integer), ARRAY[]::integer[])
    INTO v_teeth_zirconia
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(_input->'teeth_zirconia') = 'array' THEN _input->'teeth_zirconia' ELSE '[]'::jsonb END) AS item(value)
   WHERE item.value IS NOT NULL AND item.value <> '';
  SELECT COALESCE(array_agg(item.value::integer), ARRAY[]::integer[])
    INTO v_teeth_dissilicato
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(_input->'teeth_dissilicato') = 'array' THEN _input->'teeth_dissilicato' ELSE '[]'::jsonb END) AS item(value)
   WHERE item.value IS NOT NULL AND item.value <> '';
  SELECT COALESCE(array_agg(item.value::integer), ARRAY[]::integer[])
    INTO v_implant_teeth
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(_input->'implant_teeth') = 'array' THEN _input->'implant_teeth' ELSE '[]'::jsonb END) AS item(value)
   WHERE item.value IS NOT NULL AND item.value <> '';
  SELECT COALESCE(array_agg(item.value::uuid), ARRAY[]::uuid[])
    INTO v_implant_system_ids
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(_input->'implant_system_ids') = 'array' THEN _input->'implant_system_ids' ELSE '[]'::jsonb END) AS item(value)
   WHERE item.value IS NOT NULL AND item.value <> '';

  v_implant_system_id := COALESCE(NULLIF(_input->>'implant_system_id', '')::uuid, v_implant_system_ids[1]);
  IF cardinality(v_implant_system_ids) = 0 AND v_implant_system_id IS NOT NULL THEN
    v_implant_system_ids := ARRAY[v_implant_system_id];
  END IF;

  v_stage_id := NULLIF(_input->>'current_stage_id', '')::uuid;
  IF v_stage_id IS NULL THEN
    SELECT s.id INTO v_stage_id FROM public.stages s ORDER BY s.position ASC LIMIT 1;
  END IF;
  v_phase_id := COALESCE(NULLIF(_input->>'current_phase_id', '')::uuid,
    (SELECT s.phase_id FROM public.stages s WHERE s.id = v_stage_id));

  v_requested_by := CASE
    WHEN v_role = 'SOLICITANTE' THEN COALESCE(NULLIF(_input->>'requested_by', '')::uuid, v_actor)
    ELSE NULL
  END;
  v_status := CASE WHEN v_role = 'SOLICITANTE' THEN 'pendente' ELSE 'em_andamento' END;

  v_main_id := COALESCE(NULLIF(_input->>'id', '')::uuid, gen_random_uuid());
  v_arch := NULLIF(_input->>'arch', '');
  v_also_arch := NULLIF(_input->>'also_arch', '');
  v_split := v_arch IS NOT NULL AND v_also_arch IS NOT NULL AND v_arch IS DISTINCT FROM v_also_arch;

  IF v_split THEN
    v_sibling_id := COALESCE(NULLIF(_input->>'also_arch_id', '')::uuid, gen_random_uuid());
    IF v_sibling_id = v_main_id THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    v_case_ids := ARRAY[v_main_id, v_sibling_id];
    v_arches := ARRAY[v_arch, v_also_arch];
  ELSE
    v_case_ids := ARRAY[v_main_id];
    v_arches := ARRAY[v_arch];
  END IF;

  FOR v_i IN 1..array_length(v_case_ids, 1) LOOP
    v_case_id := v_case_ids[v_i];
    v_row_arch := v_arches[v_i];
    v_sibling_for_row := CASE WHEN v_split AND v_i = 2 THEN v_main_id ELSE NULL END;

    SELECT * INTO v_case FROM public.cases c WHERE c.id = v_case_id FOR UPDATE;
    IF FOUND THEN
      IF v_case.patient_id IS DISTINCT FROM v_patient_id
         OR v_case.entry_date IS DISTINCT FROM v_entry_date
         OR v_case.delivery_date IS DISTINCT FROM v_delivery_date
         OR v_case.arch IS DISTINCT FROM v_row_arch
         OR v_case.case_type_id IS DISTINCT FROM v_case_type_id THEN
        RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
      END IF;
      IF NOT public.can_access_patient(v_case.patient_id) THEN
        RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
      v_replayed := true;
    ELSE
      INSERT INTO public.cases (
        id, patient_id, doctor_id, cadista_id, case_type_id, tooth_color_id,
        case_label, entry_date, delivery_date, folder_url, current_stage_id,
        current_phase_id, sibling_case_id, arch, notes, teeth_numbers,
        elements_count, elements_zirconia, elements_dissilicato,
        teeth_zirconia, teeth_dissilicato, tooth_case_types, implant_system_id,
        implant_system_ids, has_provisional, has_mockup, implant_teeth,
        scan_jig_id, gum_info, tooth_implant_systems, prosthesis_groups,
        requested_by, status
      ) VALUES (
        v_case_id, v_patient_id, v_doctor_id, v_cadista_id, v_case_type_id, v_tooth_color_id,
        v_case_label, v_entry_date, v_delivery_date, v_folder_url, v_stage_id,
        v_phase_id, v_sibling_for_row, v_row_arch, v_notes, v_teeth_numbers,
        cardinality(v_teeth_numbers), cardinality(v_teeth_zirconia), cardinality(v_teeth_dissilicato),
        v_teeth_zirconia, v_teeth_dissilicato, v_tooth_case_types, v_implant_system_id,
        v_implant_system_ids, v_has_provisional, v_has_mockup, v_implant_teeth,
        v_scan_jig_id, v_gum_info, v_tooth_implant_systems, v_prosthesis_groups,
        v_requested_by, v_status
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING * INTO v_case;

      IF NOT FOUND THEN
        SELECT * INTO v_existing FROM public.cases c WHERE c.id = v_case_id FOR UPDATE;
        IF NOT FOUND
           OR v_existing.patient_id IS DISTINCT FROM v_patient_id
           OR v_existing.entry_date IS DISTINCT FROM v_entry_date
           OR v_existing.delivery_date IS DISTINCT FROM v_delivery_date
           OR v_existing.arch IS DISTINCT FROM v_row_arch
           OR v_existing.case_type_id IS DISTINCT FROM v_case_type_id THEN
          RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
        END IF;
        IF NOT public.can_access_patient(v_existing.patient_id) THEN
          RAISE EXCEPTION 'CASE_COMPANY_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
        END IF;
        v_case := v_existing;
        v_replayed := true;
      END IF;
    END IF;

    IF v_case.current_stage_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.case_stages cs WHERE cs.case_id = v_case.id) THEN
      INSERT INTO public.case_stages (case_id, stage_id, position)
      VALUES (v_case.id, v_case.current_stage_id, 0)
      ON CONFLICT (case_id, stage_id) DO NOTHING;
    END IF;

    INSERT INTO public.case_components (case_id, component_id)
    SELECT v_case.id, item.value::uuid
      FROM jsonb_array_elements_text(v_component_ids) AS item(value)
     WHERE item.value IS NOT NULL AND item.value <> ''
    ON CONFLICT (case_id, component_id) DO NOTHING;

    INSERT INTO public.case_types_link (case_id, case_type_id)
    SELECT v_case.id, item.value::uuid
      FROM jsonb_array_elements_text(v_case_type_ids) AS item(value)
     WHERE item.value IS NOT NULL AND item.value <> ''
    ON CONFLICT (case_id, case_type_id) DO NOTHING;
  END LOOP;

  IF v_split THEN
    SELECT * INTO v_main_case FROM public.cases c WHERE c.id = v_main_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF v_main_case.sibling_case_id IS NOT NULL AND v_main_case.sibling_case_id IS DISTINCT FROM v_sibling_id THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF v_main_case.sibling_case_id IS DISTINCT FROM v_sibling_id THEN
      UPDATE public.cases SET sibling_case_id = v_sibling_id WHERE id = v_main_id;
    END IF;
  END IF;

  SELECT * INTO v_main_case FROM public.cases c WHERE c.id = v_main_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  v_case_rows := jsonb_build_array(to_jsonb(v_main_case));

  IF v_split THEN
    SELECT * INTO v_sibling_case FROM public.cases c WHERE c.id = v_sibling_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CREATION_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    v_case_rows := v_case_rows || jsonb_build_array(to_jsonb(v_sibling_case));
  END IF;

  v_result := jsonb_build_object('case', to_jsonb(v_main_case), 'cases', v_case_rows, 'replayed', v_replayed);
  INSERT INTO public.creation_requests (idempotency_key, actor_id, operation, request_hash, result)
  VALUES (_key, v_actor, 'case', v_hash, v_result);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_case_idempotent_v1(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_case_idempotent_v1(uuid, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Lovable Cloud hotfix for IPO storage quota reconciliation.
-- Fixes PostgreSQL environments where min(uuid) is not available.
-- Safe to run after 20260905014000_storage_entitlements_and_ipo_courtesy.sql.

DO $$
DECLARE
  v_clinic_id uuid;
  v_matches integer;
BEGIN
  IF to_regclass('public.clinic_storage_entitlements') IS NULL THEN
    RAISE EXCEPTION 'STORAGE_ENTITLEMENTS_NOT_INSTALLED: execute 20260905014000_storage_entitlements_and_ipo_courtesy.sql first';
  END IF;

  SELECT count(*)
    INTO v_matches
    FROM public.clinics c
   WHERE lower(trim(c.name)) = 'ipo'
      OR lower(c.name) LIKE '%instituto praia de odontologia%'
      OR (
        lower(c.name) LIKE '%instituto%'
        AND lower(c.name) LIKE '%praia%'
        AND lower(c.name) LIKE '%odontolog%'
      );

  IF v_matches = 0 THEN
    RAISE EXCEPTION 'IPO_CLINIC_NOT_FOUND: no clinic matched IPO / Instituto Praia de Odontologia';
  END IF;

  IF v_matches > 1 THEN
    RAISE EXCEPTION 'IPO_CLINIC_AMBIGUOUS: % clinics matched; no quota was changed', v_matches;
  END IF;

  SELECT c.id
    INTO v_clinic_id
    FROM public.clinics c
   WHERE lower(trim(c.name)) = 'ipo'
      OR lower(c.name) LIKE '%instituto praia de odontologia%'
      OR (
        lower(c.name) LIKE '%instituto%'
        AND lower(c.name) LIKE '%praia%'
        AND lower(c.name) LIKE '%odontolog%'
      )
   LIMIT 1;

  INSERT INTO public.clinic_storage_entitlements (
    clinic_id, entitlement_key, entitlement_type, product_code, bytes, status,
    notes, starts_at, ends_at, updated_at
  ) VALUES (
    v_clinic_id, 'base_included', 'base', 'base_1gb', 1073741824, 'active',
    'Cota base incluída no Dental Flow.', now(), NULL, now()
  )
  ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
    entitlement_type = 'base',
    product_code = 'base_1gb',
    bytes = 1073741824,
    status = 'active',
    ends_at = NULL,
    notes = 'Cota base incluída no Dental Flow.',
    updated_at = now();

  INSERT INTO public.clinic_storage_entitlements (
    clinic_id, entitlement_key, entitlement_type, product_code, bytes, status,
    notes, starts_at, ends_at, updated_at
  ) VALUES (
    v_clinic_id, 'courtesy_ipo_10gb_total', 'courtesy', NULL, 9663676416, 'active',
    'Cortesia permanente: cota total da IPO em 10 GB.', now(), NULL, now()
  )
  ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
    entitlement_type = 'courtesy',
    product_code = NULL,
    bytes = 9663676416,
    status = 'active',
    ends_at = NULL,
    notes = 'Cortesia permanente: cota total da IPO em 10 GB.',
    updated_at = now();

  PERFORM public.recalculate_clinic_storage_limit(v_clinic_id);
END $$;

SELECT
  c.id,
  c.name,
  c.storage_limit_bytes,
  round(c.storage_limit_bytes::numeric / 1073741824, 2) AS storage_limit_gib
FROM public.clinics c
WHERE lower(trim(c.name)) = 'ipo'
   OR lower(c.name) LIKE '%instituto praia de odontologia%'
   OR (
     lower(c.name) LIKE '%instituto%'
     AND lower(c.name) LIKE '%praia%'
     AND lower(c.name) LIKE '%odontolog%'
   );

NOTIFY pgrst, 'reload schema';

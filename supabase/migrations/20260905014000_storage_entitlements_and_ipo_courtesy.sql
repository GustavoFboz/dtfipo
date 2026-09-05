-- Variable storage quotas per clinic, ready for future paid add-ons.
-- Existing Dental Flow storage enforcement continues reading clinics.storage_limit_bytes;
-- this migration makes that value the materialized sum of active entitlements.

CREATE TABLE IF NOT EXISTS public.storage_products (
  code text PRIMARY KEY,
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('base', 'addon')),
  bytes bigint NOT NULL CHECK (bytes > 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.storage_products (code, name, product_type, bytes, sort_order)
VALUES
  ('base_1gb', 'Armazenamento incluído — 1 GB', 'base', 1073741824, 10),
  ('addon_10gb', 'Adicional — 10 GB', 'addon', 10737418240, 20),
  ('addon_25gb', 'Adicional — 25 GB', 'addon', 26843545600, 30),
  ('addon_50gb', 'Adicional — 50 GB', 'addon', 53687091200, 40),
  ('addon_100gb', 'Adicional — 100 GB', 'addon', 107374182400, 50)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  product_type = EXCLUDED.product_type,
  bytes = EXCLUDED.bytes,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.clinic_storage_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  entitlement_type text NOT NULL CHECK (entitlement_type IN ('base', 'purchase', 'courtesy', 'manual')),
  product_code text REFERENCES public.storage_products(code) ON DELETE SET NULL,
  bytes bigint NOT NULL CHECK (bytes > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  billing_provider text,
  external_reference text,
  notes text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, entitlement_key)
);

CREATE INDEX IF NOT EXISTS clinic_storage_entitlements_clinic_idx
  ON public.clinic_storage_entitlements (clinic_id, status);
CREATE INDEX IF NOT EXISTS clinic_storage_entitlements_external_idx
  ON public.clinic_storage_entitlements (billing_provider, external_reference)
  WHERE external_reference IS NOT NULL;

ALTER TABLE public.storage_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_storage_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_products_authenticated_select ON public.storage_products;
CREATE POLICY storage_products_authenticated_select
  ON public.storage_products FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS clinic_storage_entitlements_admin_select ON public.clinic_storage_entitlements;
CREATE POLICY clinic_storage_entitlements_admin_select
  ON public.clinic_storage_entitlements FOR SELECT TO authenticated
  USING (public.can_manage_clinic_storage(clinic_id));

GRANT SELECT ON public.storage_products TO authenticated;
GRANT SELECT ON public.clinic_storage_entitlements TO authenticated;
GRANT ALL ON public.storage_products, public.clinic_storage_entitlements TO service_role;

CREATE OR REPLACE FUNCTION public.recalculate_clinic_storage_limit(_clinic_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit bigint;
BEGIN
  SELECT COALESCE(sum(e.bytes), 1073741824::bigint)
    INTO v_limit
    FROM public.clinic_storage_entitlements e
   WHERE e.clinic_id = _clinic_id
     AND e.status = 'active'
     AND e.starts_at <= now()
     AND (e.ends_at IS NULL OR e.ends_at > now());

  v_limit := GREATEST(COALESCE(v_limit, 1073741824::bigint), 1073741824::bigint);

  UPDATE public.clinics
     SET storage_limit_bytes = v_limit
   WHERE id = _clinic_id
     AND storage_limit_bytes IS DISTINCT FROM v_limit;

  RETURN v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_clinic_storage_limit_from_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_clinic_storage_limit(OLD.clinic_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_clinic_storage_limit(NEW.clinic_id);
  IF TG_OP = 'UPDATE' AND OLD.clinic_id IS DISTINCT FROM NEW.clinic_id THEN
    PERFORM public.recalculate_clinic_storage_limit(OLD.clinic_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinic_storage_entitlements_sync ON public.clinic_storage_entitlements;
CREATE TRIGGER trg_clinic_storage_entitlements_sync
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_storage_entitlements
FOR EACH ROW EXECUTE FUNCTION public.sync_clinic_storage_limit_from_entitlements();

-- Future billing/administration entry point. Client users cannot call it directly;
-- a future Stripe/Mercado Pago webhook or platform-admin service can use service_role.
CREATE OR REPLACE FUNCTION public.set_clinic_storage_entitlement(
  _clinic_id uuid,
  _entitlement_key text,
  _entitlement_type text,
  _bytes bigint,
  _product_code text DEFAULT NULL,
  _billing_provider text DEFAULT NULL,
  _external_reference text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _active boolean DEFAULT true
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _clinic_id IS NULL OR COALESCE(trim(_entitlement_key), '') = '' THEN
    RAISE EXCEPTION 'INVALID_STORAGE_ENTITLEMENT';
  END IF;
  IF _entitlement_type NOT IN ('base', 'purchase', 'courtesy', 'manual') THEN
    RAISE EXCEPTION 'INVALID_STORAGE_ENTITLEMENT_TYPE';
  END IF;
  IF COALESCE(_bytes, 0) <= 0 THEN
    RAISE EXCEPTION 'INVALID_STORAGE_ENTITLEMENT_BYTES';
  END IF;

  INSERT INTO public.clinic_storage_entitlements (
    clinic_id, entitlement_key, entitlement_type, product_code, bytes, status,
    billing_provider, external_reference, notes, created_by, updated_at
  ) VALUES (
    _clinic_id, trim(_entitlement_key), _entitlement_type, _product_code, _bytes,
    CASE WHEN _active THEN 'active' ELSE 'cancelled' END,
    _billing_provider, _external_reference, _notes, auth.uid(), now()
  )
  ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
    entitlement_type = EXCLUDED.entitlement_type,
    product_code = EXCLUDED.product_code,
    bytes = EXCLUDED.bytes,
    status = EXCLUDED.status,
    billing_provider = EXCLUDED.billing_provider,
    external_reference = EXCLUDED.external_reference,
    notes = EXCLUDED.notes,
    updated_at = now();

  RETURN public.recalculate_clinic_storage_limit(_clinic_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_clinic_storage_entitlement(uuid, text, text, bigint, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_clinic_storage_entitlement(uuid, text, text, bigint, text, text, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_clinic_storage_entitlement(uuid, text, text, bigint, text, text, text, text, boolean) TO service_role;

-- Every existing clinic keeps the included 1 GB as its base entitlement.
INSERT INTO public.clinic_storage_entitlements (
  clinic_id, entitlement_key, entitlement_type, product_code, bytes, notes
)
SELECT c.id, 'base_included', 'base', 'base_1gb', 1073741824,
       'Cota base incluída no Dental Flow.'
  FROM public.clinics c
ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
  entitlement_type = 'base',
  product_code = 'base_1gb',
  bytes = 1073741824,
  status = 'active',
  ends_at = NULL,
  notes = 'Cota base incluída no Dental Flow.',
  updated_at = now();

-- IPO — Instituto Praia de Odontologia: 10 GB TOTAL, indefinitely as a courtesy.
-- Since 1 GB is already included, this entitlement adds 9 GB.
INSERT INTO public.clinic_storage_entitlements (
  clinic_id, entitlement_key, entitlement_type, bytes, notes
)
SELECT c.id, 'courtesy_ipo_10gb_total', 'courtesy', 9663676416,
       'Cortesia permanente: eleva a cota total da IPO para 10 GB. Alterar somente por decisão administrativa da plataforma.'
  FROM public.clinics c
 WHERE lower(c.name) LIKE '%instituto praia de odontologia%'
    OR lower(trim(c.name)) = 'ipo'
ON CONFLICT (clinic_id, entitlement_key) DO UPDATE SET
  entitlement_type = 'courtesy',
  bytes = 9663676416,
  status = 'active',
  ends_at = NULL,
  notes = 'Cortesia permanente: eleva a cota total da IPO para 10 GB. Alterar somente por decisão administrativa da plataforma.',
  updated_at = now();

-- Materialize the effective quota for every clinic so the existing quota enforcement
-- and UI immediately use the new value without any frontend compatibility break.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.clinics LOOP
    PERFORM public.recalculate_clinic_storage_limit(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

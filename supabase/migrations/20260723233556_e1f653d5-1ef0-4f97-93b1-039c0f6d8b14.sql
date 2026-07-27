
-- Tabela de campos personalizados de itens de estoque
CREATE TABLE IF NOT EXISTS public.stock_item_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sicf_item ON public.stock_item_custom_fields(stock_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_custom_fields TO authenticated;
GRANT ALL ON public.stock_item_custom_fields TO service_role;
ALTER TABLE public.stock_item_custom_fields ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.stock_item_custom_fields'::regclass AND polname='sicf_staff_all') THEN
    CREATE POLICY sicf_staff_all ON public.stock_item_custom_fields
      FOR ALL TO authenticated
      USING (public.is_staff(auth.uid()))
      WITH CHECK (public.is_staff(auth.uid()));
  END IF;
END $$;

ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS type text;

-- Backfill de clinic_id em perfis CEO/DR
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE clinic_id IS NULL AND role IN ('CEO','DR') LOOP
    UPDATE public.profiles SET clinic_id = gen_random_uuid() WHERE id = r.id;
  END LOOP;
END $$;

-- handle_new_user: cria clínica para CEO/DR e confirma e-mail do primeiro CEO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_role text; v_full_name text; is_first boolean; v_clinic uuid;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;
  v_role := COALESCE(new.raw_user_meta_data->>'role', CASE WHEN is_first THEN 'CEO' ELSE 'USER' END);
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);
  v_clinic := CASE WHEN is_first OR v_role IN ('CEO','DR') THEN gen_random_uuid() ELSE NULL END;
  INSERT INTO public.profiles (id, full_name, email, role, is_default_admin, clinic_id)
    VALUES (new.id, v_full_name, new.email, v_role, is_first, v_clinic)
    ON CONFLICT (id) DO NOTHING;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING;
    UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
                          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = new.id;
  END IF;
  IF v_role = 'CADISTA' THEN INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id); END IF;
  RETURN new;
END $$;

-- Hardening: GRANTs em massa (idempotente)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- =====================================================================
-- POST-RESTORE HARDENING
-- Consolida todos os ajustes que precisaram ser aplicados manualmente
-- durante uma restauração real do back-end para deixar o sistema 100%
-- funcional. Esta migration é idempotente e deve ser a ÚLTIMA a rodar.
--
-- Corrige:
--   1. GRANTs faltando em tabelas/sequences do schema public
--      (sintoma: "permission denied for table X" apesar da RLS estar ok).
--   2. EXECUTE em todas as funções public para authenticated
--      (sintoma: SELECT em tabela retorna vazio porque a RLS chama
--       helper SECURITY DEFINER sem permissão — ex.: stages/is_staff).
--   3. Colunas que ficaram para trás em migrations antigas:
--        - stages.requires_implant_components
--        - cases.gum_info
--        - cases.implant_system_ids, cases.tooth_implant_systems
--        - clinics.kind, clinics.owner_id, clinics.invite_code
--        - profiles.print_note_template
--   4. Valores do enum stock_movement_type usados pelo app:
--        implant_usage, implant_usage_reverse, tooth_usage,
--        tooth_usage_reverse, auto_rule, reverse_rule.
--   5. Buckets de Storage: case-files e patient-files (privados) +
--      políticas para usuários autenticados.
-- =====================================================================

-- 1) GRANTs em massa em tabelas + sequences do schema public --------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', r.sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', r.sequence_name);
  END LOOP;
END $$;

-- 2) EXECUTE em todas as funções public -----------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon, service_role', r.sig);
  END LOOP;
END $$;

-- 3) Colunas ausentes -----------------------------------------------------
ALTER TABLE public.stages   ADD COLUMN IF NOT EXISTS requires_implant_components boolean NOT NULL DEFAULT false;
ALTER TABLE public.cases    ADD COLUMN IF NOT EXISTS gum_info jsonb;
ALTER TABLE public.cases    ADD COLUMN IF NOT EXISTS implant_system_ids uuid[];
ALTER TABLE public.cases    ADD COLUMN IF NOT EXISTS tooth_implant_systems jsonb;
CREATE INDEX IF NOT EXISTS idx_cases_implant_system_ids ON public.cases USING gin (implant_system_ids);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS print_note_template jsonb;
ALTER TABLE public.clinics  ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.clinics  ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.clinics  ADD COLUMN IF NOT EXISTS invite_code text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clinics_invite_code_key') THEN
    ALTER TABLE public.clinics ADD CONSTRAINT clinics_invite_code_key UNIQUE (invite_code);
  END IF;
END $$;

-- 4) Valores de enum ausentes --------------------------------------------
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['implant_usage','implant_usage_reverse','tooth_usage','tooth_usage_reverse','auto_rule','reverse_rule']
  LOOP
    BEGIN
      EXECUTE format('ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS %L', v);
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
END $$;

-- 5) Buckets de Storage + políticas --------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('case-files','case-files',false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-files','patient-files',false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-photos','patient-photos',true)
  ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE b text; op text;
BEGIN
  FOREACH b IN ARRAY ARRAY['case-files','patient-files'] LOOP
    FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      BEGIN
        EXECUTE format(
          'CREATE POLICY %I ON storage.objects FOR %s TO authenticated USING (bucket_id = %L) %s',
          b||'_auth_'||lower(op), op, b,
          CASE WHEN op IN ('INSERT','UPDATE') THEN format('WITH CHECK (bucket_id = %L)', b) ELSE '' END
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END LOOP;
  END LOOP;
END $$;

-- Fim -------------------------------------------------------------------
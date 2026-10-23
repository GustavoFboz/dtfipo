-- =====================================================================
-- SELF-HEAL v2 — idempotente. Roda depois de todo o restore.
-- Consolida ajustes recorrentes descobertos em restaurações reais para
-- não precisar corrigir manualmente após reconstruir o projeto do zip.
--
-- Cobre:
--   1. Coluna requirements (jsonb) em public.stages (novo sistema de
--      "exigir na etapa" com dropdown de tipos).
--   2. RPCs advance_case_workflow / return_case_workflow /
--      case_stage_requirement_blockers (fluxo com bloqueio por requisito).
--   3. Função export_backup + backend_schema_hash (botão "Backup Backend").
--   4. Coluna stock_items.type (texto livre) usada pelo dialog de estoque.
--   5. Tabela stock_item_custom_fields (campos personalizados dos itens).
--   6. Backfill: garantir clinic_id em profiles CEO/DR + criar clinics.
--   7. Skip email confirmation para o primeiro CEO cadastrado.
-- =====================================================================

-- 1) requirements em stages ---------------------------------------------
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migra flag legada para o novo formato quando ainda não houver requisitos
UPDATE public.stages
   SET requirements = jsonb_build_array(jsonb_build_object(
         'type', 'implant_components',
         'blocks_advance', 'true'))
 WHERE COALESCE(requires_implant_components, false) = true
   AND (requirements IS NULL OR jsonb_typeof(requirements) <> 'array' OR jsonb_array_length(requirements) = 0);

-- 2) stock_items.type + stock_item_custom_fields ------------------------
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS type text;

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

-- 3) RPCs de fluxo -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.case_stage_requirement_blockers(_case_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_case public.cases%ROWTYPE;
  v_requirements jsonb := '[]'::jsonb;
  v_req jsonb;
  v_type text;
  v_blocks boolean;
  v_blockers text[] := ARRAY[]::text[];
  v_implant_teeth integer[];
  v_missing_implants integer[];
BEGIN
  SELECT * INTO v_case FROM public.cases WHERE id = _case_id;
  IF NOT FOUND THEN RETURN ARRAY['Caso não encontrado']; END IF;

  SELECT COALESCE(s.requirements,'[]'::jsonb) INTO v_requirements FROM public.stages s WHERE s.id = v_case.current_stage_id;
  IF v_requirements IS NULL OR jsonb_typeof(v_requirements) <> 'array' THEN RETURN ARRAY[]::text[]; END IF;

  FOR v_req IN SELECT value FROM jsonb_array_elements(v_requirements) LOOP
    v_blocks := lower(COALESCE(v_req->>'blocks_advance','false')) = 'true';
    IF NOT v_blocks THEN CONTINUE; END IF;
    v_type := v_req->>'type';

    IF v_type = 'implant_components' THEN
      v_implant_teeth := COALESCE(v_case.implant_teeth, ARRAY[]::integer[]);
      IF COALESCE(array_length(v_implant_teeth,1),0) = 0 THEN CONTINUE; END IF;
      SELECT array_agg(t ORDER BY t) INTO v_missing_implants
        FROM unnest(v_implant_teeth) AS t
        WHERE NOT EXISTS (SELECT 1 FROM public.case_implant_teeth cit
                          WHERE cit.case_id=_case_id AND cit.tooth_fdi=t AND cit.reversed_at IS NULL);
      IF COALESCE(array_length(v_missing_implants,1),0) > 0 THEN
        v_blockers := array_append(v_blockers,
          'Apontar componente para dentes com implantes (' || array_to_string(v_missing_implants, ', ') || ')');
      END IF;
    ELSIF v_type = 'download_scans' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_activity ca
        WHERE ca.case_id=_case_id AND ca.kind='download' AND ca.metadata->>'kind'='scans')
      THEN v_blockers := array_append(v_blockers, 'Baixar arquivos da aba "Escaneamentos"'); END IF;
    ELSIF v_type = 'upload_models' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id=_case_id AND a.kind='model' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Modelos"'); END IF;
    ELSIF v_type = 'upload_fabrication' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id=_case_id AND a.kind='fabrication' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Confecção"'); END IF;
    ELSIF v_type = 'upload_html' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id=_case_id AND a.kind='exocad_html' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar arquivo na aba "Html"'); END IF;
    ELSIF v_type = 'upload_gallery' THEN
      IF NOT EXISTS (SELECT 1 FROM public.case_attachments a
        WHERE a.case_id=_case_id AND a.kind='gallery' AND a.expired_at IS NULL)
      THEN v_blockers := array_append(v_blockers, 'Enviar imagem na aba "Galeria"'); END IF;
    END IF;
  END LOOP;
  RETURN v_blockers;
END $$;

-- 4) Backfill de clinic_id para CEO/DR ----------------------------------
DO $$
DECLARE r record; new_clinic uuid;
BEGIN
  FOR r IN SELECT id, role FROM public.profiles WHERE clinic_id IS NULL AND role IN ('CEO','DR') LOOP
    new_clinic := gen_random_uuid();
    UPDATE public.profiles SET clinic_id = new_clinic WHERE id = r.id;
  END LOOP;
END $$;

-- 5) handle_new_user cria clinic para o primeiro usuário ---------------
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
    -- Skip email confirmation para o primeiro CEO
    UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
                          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = new.id;
  END IF;
  IF v_role = 'CADISTA' THEN INSERT INTO public.cadistas (name, user_id) VALUES (v_full_name, new.id); END IF;
  RETURN new;
END $$;

-- 6) Re-executa hardening geral: GRANTs, EXECUTE em funções ------------
-- 6a) case_implant_teeth + RPCs register/remove ------------------------
CREATE TABLE IF NOT EXISTS public.case_implant_teeth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  tooth_fdi integer NOT NULL,
  implant_system_id uuid REFERENCES public.implant_systems(id) ON DELETE SET NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  qty numeric NOT NULL DEFAULT 1,
  reversed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cit_case ON public.case_implant_teeth(case_id) WHERE reversed_at IS NULL;
ALTER TABLE public.case_implant_teeth ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.case_implant_teeth'::regclass AND polname='cit_select') THEN
    CREATE POLICY cit_select ON public.case_implant_teeth FOR SELECT TO authenticated USING (public.can_access_case(case_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.case_implant_teeth'::regclass AND polname='cit_write') THEN
    CREATE POLICY cit_write ON public.case_implant_teeth FOR ALL TO authenticated
      USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_case_implant_tooth(_case_id uuid, _tooth_fdi integer, _stock_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_system uuid; v_id uuid; v_qty numeric;
BEGIN
  IF NOT public.can_access_case(_case_id) THEN RETURN jsonb_build_object('success', false, 'error', 'Sem permissão'); END IF;
  SELECT isc.implant_system_id INTO v_system FROM public.stock_items si
    LEFT JOIN public.implant_system_components isc ON isc.id = si.implant_system_component_id
   WHERE si.id = _stock_item_id;
  SELECT qty_on_hand INTO v_qty FROM public.stock_items WHERE id = _stock_item_id FOR UPDATE;
  IF v_qty IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Item de estoque não encontrado'); END IF;
  IF v_qty < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'Estoque insuficiente'); END IF;
  UPDATE public.case_implant_teeth SET reversed_at = now()
   WHERE case_id = _case_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL;
  INSERT INTO public.case_implant_teeth (case_id, tooth_fdi, implant_system_id, stock_item_id, qty, created_by)
    VALUES (_case_id, _tooth_fdi, v_system, _stock_item_id, 1, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.stock_movements (stock_item_id, type, qty, case_id, user_id, notes)
    VALUES (_stock_item_id, 'auto_case'::stock_movement_type, -1, _case_id, auth.uid(),
            'Apontamento implante · dente ' || _tooth_fdi::text);
  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $fn$;

CREATE OR REPLACE FUNCTION public.remove_case_implant_tooth(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_row public.case_implant_teeth%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.case_implant_teeth WHERE id = _id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado'); END IF;
  IF NOT public.can_access_case(v_row.case_id) THEN RETURN jsonb_build_object('success', false, 'error', 'Sem permissão'); END IF;
  IF v_row.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true); END IF;
  UPDATE public.case_implant_teeth SET reversed_at = now() WHERE id = _id;
  INSERT INTO public.stock_movements (stock_item_id, type, qty, case_id, user_id, notes)
    VALUES (v_row.stock_item_id, 'reverse_case'::stock_movement_type, v_row.qty, v_row.case_id, auth.uid(),
            'Reversão implante · dente ' || v_row.tooth_fdi::text);
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $fn$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- Restore-only SQL executors are intentionally available while historical
-- migrations are replayed, but must never survive in the restored database.
DROP FUNCTION IF EXISTS public.__restore_exec(text);
DROP FUNCTION IF EXISTS _restore.exec_sql(text);
DROP SCHEMA IF EXISTS _restore;

-- Financial and fiscal boundaries must be restored after the legacy blanket
-- grants above. Client roles may read/update only through explicitly validated
-- RPCs; provider identities and authoritative state changes remain backend-only.
REVOKE ALL ON FUNCTION public.billing_subscription_contract_amount(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_subscription_contract_amount(uuid)
  TO service_role;
-- Storage reservations are another authoritative ledger: the old blanket
-- grant must not allow clients to erase or forge usage after restore.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.storage_files
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_storage_upload(
  bigint,text,text,text,uuid,uuid,text,text
), public.complete_storage_upload(uuid,text), public.cancel_storage_upload(uuid),
  public.delete_managed_storage_file(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_upload_has_reservation_for_insert(text,text,jsonb),
  public.release_storage_upload_reservation(uuid,uuid) FROM PUBLIC, anon;

REVOKE ALL ON TABLE public.company_billing_profiles
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_provider_customers
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_provider_operations
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_test_access
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_test_tokens
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_event_replays
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.platform_operators, public.platform_operator_audit
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.company_billing_profiles TO service_role;
GRANT ALL ON TABLE public.billing_provider_customers TO service_role;
GRANT ALL ON TABLE public.billing_provider_operations TO service_role;
GRANT ALL ON TABLE public.billing_test_access TO service_role;
GRANT ALL ON TABLE public.billing_test_tokens TO service_role;
GRANT SELECT ON TABLE public.billing_event_replays TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_operators TO service_role;
GRANT SELECT ON TABLE public.platform_operator_audit TO service_role;

-- Stage 08 requests are private instructions, not a new browser billing ledger.
REVOKE ALL ON TABLE public.billing_change_requests, public.billing_change_request_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.billing_change_requests, public.billing_change_request_events TO service_role;
REVOKE ALL ON FUNCTION public.billing_change_request_quote(uuid,text,text),
  public.billing_change_request_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_change_request_quote(uuid,text,text),
  public.billing_change_request_summary(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.billing_company_change_context(uuid),
  public.billing_submit_change_request(uuid,uuid,text,text,text),
  public.billing_withdraw_change_request(uuid,uuid), public.platform_master_billing_change_requests(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_company_change_context(uuid),
  public.billing_submit_change_request(uuid,uuid,text,text,text),
  public.billing_withdraw_change_request(uuid,uuid), public.platform_master_billing_change_requests(text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.billing_apply_checkout_paid(
  uuid,text,text,text,text,timestamptz,timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_apply_subscription_state(
  uuid,text,timestamptz,timestamptz,timestamptz,text,text,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_bind_asaas_customer(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_bind_asaas_subscription(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_claim_provider_operation(text,text,text,text,text,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_finish_provider_operation(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_get_asaas_provisioning_context(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_get_checkout_provisioning_context(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_mark_asaas_checkout_ready(
  uuid,uuid,text,text,text,text,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_receive_asaas_event(text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_claim_asaas_events(text,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_finish_asaas_event(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_apply_asaas_initial_payment(
  uuid,uuid,text,text,text,integer,date,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_apply_asaas_payment_lifecycle(
  uuid,uuid,text,text,text,integer,date,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_apply_asaas_subscription_lifecycle(
  uuid,uuid,text,text,text,integer,text,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_list_asaas_expired_grace(text,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_suspend_asaas_expired_grace(
  uuid,text,text,text,text,text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_replay_asaas_event(text,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_claim_asaas_reconciliation_candidates(text,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_user_can_manage_company(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_get_asaas_payment_document_context(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_valid_br_tax_id(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_clinic_storage_entitlement(
  uuid,text,text,bigint,text,text,text,text,boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_clinic_storage_limit(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.billing_apply_checkout_paid(
  uuid,text,text,text,text,timestamptz,timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_apply_subscription_state(
  uuid,text,timestamptz,timestamptz,timestamptz,text,text,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_bind_asaas_customer(uuid,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_bind_asaas_subscription(uuid,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_claim_provider_operation(text,text,text,text,text,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_finish_provider_operation(uuid,uuid,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_get_asaas_provisioning_context(uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_get_checkout_provisioning_context(uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_mark_asaas_checkout_ready(
  uuid,uuid,text,text,text,text,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_receive_asaas_event(text,text,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_claim_asaas_events(text,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_finish_asaas_event(uuid,uuid,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_apply_asaas_initial_payment(
  uuid,uuid,text,text,text,integer,date,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_apply_asaas_payment_lifecycle(
  uuid,uuid,text,text,text,integer,date,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_apply_asaas_subscription_lifecycle(
  uuid,uuid,text,text,text,integer,text,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_list_asaas_expired_grace(text,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_suspend_asaas_expired_grace(
  uuid,text,text,text,text,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_replay_asaas_event(text,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_claim_asaas_reconciliation_candidates(text,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_user_can_manage_company(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_get_asaas_payment_document_context(uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_valid_br_tax_id(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_clinic_storage_entitlement(
  uuid,text,text,bigint,text,text,text,text,boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_clinic_storage_limit(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.billing_get_company_profile(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_upsert_company_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_get_company_profile(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_upsert_company_profile(
  uuid,text,text,text,text,text,text,text,text,text,text,text
) TO authenticated, service_role;

-- Stage 09 operational telemetry stays private after generic self-heal grants.
REVOKE ALL ON TABLE public.billing_worker_health FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.billing_worker_health TO service_role;
REVOKE ALL ON FUNCTION public.billing_record_worker_health(text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_record_worker_health(text,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.platform_master_operational_health() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_master_operational_health() TO authenticated;

-- Trigger-only case authorization must not inherit legacy blanket grants.
REVOKE ALL ON FUNCTION public.guard_case_company_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_case_clinic_id(uuid), public.can_access_case(uuid), public.can_modify_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_case_clinic_id(uuid), public.can_access_case(uuid), public.can_modify_case(uuid) TO authenticated, service_role;

-- Scheduler credentials and dispatch remain private after blanket grants.
-- Manual external-test review keeps the same operator/AAL2 boundary after restore.
REVOKE ALL ON FUNCTION public.platform_master_close_external_sandbox_test(text,text,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_master_close_external_sandbox_test(text,text,text,boolean)
  TO authenticated;

REVOKE ALL ON TABLE public.billing_database_scheduler,
  net.http_request_queue, net._http_response FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_enqueue_database_worker(text), public.billing_database_scheduler_boundary()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_configure_database_scheduler(text,text),
  public.billing_disable_database_scheduler(text), public.billing_database_scheduler_status(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_configure_database_scheduler(text,text),
  public.billing_disable_database_scheduler(text), public.billing_database_scheduler_status(text)
  TO service_role;

-- Cancellation executor: reseal after generic function grants above.
REVOKE ALL ON TABLE public.billing_cancel_executions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.billing_cancel_executions TO service_role;
REVOKE ALL ON FUNCTION public.billing_cancel_master_identity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_master_claim_cancel_request(uuid,text,text,boolean),
  public.platform_master_begin_cancel_write(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_master_claim_cancel_request(uuid,text,text,boolean),
  public.platform_master_begin_cancel_write(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.billing_finish_cancel_request(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_finish_cancel_request(uuid,uuid,jsonb,text) TO service_role;

-- Fixture acceptance capabilities remain private after generic self-heal.
REVOKE ALL ON FUNCTION public.can_access_user_avatar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_user_avatar(uuid) TO authenticated, service_role;
REVOKE ALL ON TABLE public.saas_fixture_acceptance_jobs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.saas_claim_fixture_acceptance_job(uuid,text),
  public.saas_finish_fixture_acceptance_job(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_claim_fixture_acceptance_job(uuid,text),
  public.saas_finish_fixture_acceptance_job(uuid,jsonb) TO service_role;

-- Company ownership security must remain last after generic self-heal.
CREATE OR REPLACE FUNCTION public.register_case_implant_tooth(_case_id uuid, _tooth_fdi integer, _stock_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_sys uuid; v_user uuid := auth.uid();
BEGIN
  PERFORM public.saas_require_stock_case_pair(_case_id,_stock_item_id);
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT c.implant_system_id INTO v_sys
    FROM public.stock_items si
    LEFT JOIN public.implant_system_components c ON c.id = si.implant_system_component_id
   WHERE si.id = _stock_item_id;

  UPDATE public.case_implant_teeth SET reversed_at = now()
   WHERE case_id = _case_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL;

  INSERT INTO public.case_implant_teeth (case_id, tooth_fdi, implant_system_id, stock_item_id, qty)
  VALUES (_case_id, _tooth_fdi, v_sys, _stock_item_id, 1)
  RETURNING id INTO v_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'tooth_usage', -1, 0, 0, _case_id, v_user, 'Componente de implante no dente ' || _tooth_fdi);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $function$
;
CREATE OR REPLACE FUNCTION public.remove_case_implant_tooth(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t RECORD; v_user uuid := auth.uid();
BEGIN
  SELECT * INTO t FROM public.case_implant_teeth WHERE id = _id;
  IF t IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado'); END IF;
  IF NOT public.can_access_case(t.case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF t.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true); END IF;

  UPDATE public.case_implant_teeth SET reversed_at = now() WHERE id = _id;

  IF t.stock_item_id IS NOT NULL THEN
    INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (t.stock_item_id, 'tooth_usage_reverse', COALESCE(t.qty, 1), 0, 0, t.case_id, v_user, 'Estorno de componente do dente ' || t.tooth_fdi);
  END IF;

  RETURN jsonb_build_object('success', true);
END $function$
;
-- Remove direct anonymous access, including helpers after restore self-heal.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE 'saas_company_%' OR p.proname IN ('saas_case_company_id','saas_owned_parent_company',
 'saas_assert_company_reference','saas_require_stock_case_pair','saas_guard_owned_record','saas_can_read_person',
 'saas_guard_person_directory','saas_guard_patient_company','saas_sync_person_company','add_implant_component','create_implant_system_with_stock',
 'register_case_implant_tooth','register_tooth_stock_usage','remove_case_implant_tooth','remove_tooth_stock_usage','case_requires_sintering','update_team_member')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.saas_company_current_id(),public.saas_company_can_read(uuid),
 public.saas_company_can_manage_stock(uuid),public.saas_company_can_manage_people(uuid),
 public.saas_can_read_person(uuid,uuid,uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.saas_company_trusted_backend(),public.saas_case_company_id(uuid),
 public.saas_owned_parent_company(text,uuid),public.saas_assert_company_reference(text,uuid,uuid),
 public.saas_guard_owned_record(),public.saas_guard_person_directory(),public.saas_guard_patient_company(),public.saas_sync_person_company()
 FROM authenticated,service_role;
NOTIFY pgrst,'reload schema';

-- Canonical company workflow functions (stage 07, 2026-10-23).

CREATE OR REPLACE FUNCTION public.saas_company_can_manage_workflow(_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.saas_company_can_manage_people(_clinic) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
  AND (COALESCE(p.is_default_admin,false) OR upper(COALESCE(p.account_subtype,'')) IN ('CEO','ADMIN') OR upper(COALESCE(p.role,''))='CEO'));
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_workflow()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.saas_company_can_manage_workflow(public.saas_company_current_id());
$$;

CREATE OR REPLACE FUNCTION public.saas_can_read_workflow_company(_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.saas_company_can_read(_clinic) OR EXISTS(SELECT 1 FROM public.cases c
  WHERE public.saas_case_company_id(c.id)=_clinic AND public.can_access_case(c.id));
$$;

CREATE OR REPLACE FUNCTION public.saas_guard_workflow_configuration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; c uuid; parent uuid; parent_company uuid; uid uuid;
 trusted boolean:=public.saas_company_trusted_backend(); bootstrapping boolean;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 c:=COALESCE(NULLIF(r->>'clinic_id','')::uuid,public.saas_company_current_id());
 bootstrapping:=pg_trigger_depth()>1 AND EXISTS(SELECT 1 FROM public.clinics WHERE id=c AND owner_id=auth.uid());
 IF c IS NULL THEN
  IF trusted AND TG_OP='UPDATE' AND OLD.clinic_id IS NULL AND NEW.clinic_id IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'WORKFLOW_COMPANY_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND OLD.clinic_id IS DISTINCT FROM c THEN
  RAISE EXCEPTION 'WORKFLOW_COMPANY_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 IF NOT trusted AND NOT bootstrapping AND NOT public.saas_company_can_manage_workflow(c) THEN
  RAISE EXCEPTION 'WORKFLOW_COMPANY_WRITE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN
  IF NOT trusted AND TG_TABLE_NAME='stages' AND (EXISTS(SELECT 1 FROM public.cases WHERE current_stage_id=(r->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM public.case_stages WHERE stage_id=(r->>'id')::uuid)) THEN RAISE EXCEPTION 'WORKFLOW_DEFINITION_IN_USE' USING ERRCODE='42501'; END IF;
  IF NOT trusted AND TG_TABLE_NAME='phases' AND (EXISTS(SELECT 1 FROM public.cases WHERE current_phase_id=(r->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM public.stages WHERE phase_id=(r->>'id')::uuid)) THEN RAISE EXCEPTION 'WORKFLOW_DEFINITION_IN_USE' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 END IF;
 IF TG_TABLE_NAME IN ('stages','phase_assignments') THEN
  parent:=NULLIF(r->>'phase_id','')::uuid;
  IF parent IS NOT NULL THEN
   SELECT clinic_id INTO parent_company FROM public.phases WHERE id=parent;
   IF parent_company IS DISTINCT FROM c THEN RAISE EXCEPTION 'FOREIGN_WORKFLOW_PHASE' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='stage_assignments' THEN
  SELECT clinic_id INTO parent_company FROM public.stages WHERE id=(r->>'stage_id')::uuid;
  IF parent_company IS DISTINCT FROM c THEN RAISE EXCEPTION 'FOREIGN_WORKFLOW_STAGE' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('phase_assignments','stage_assignments') THEN
  uid:=(r->>'user_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND clinic_id=c) THEN
   RAISE EXCEPTION 'FOREIGN_WORKFLOW_ASSIGNEE' USING ERRCODE='42501';
  END IF;
 END IF;
 parent:=NULLIF(r->>'target_phase_id','')::uuid;
 IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.phases WHERE id=parent AND clinic_id=c) THEN
  RAISE EXCEPTION 'FOREIGN_WORKFLOW_TARGET_PHASE' USING ERRCODE='42501';
 END IF;
 parent:=NULLIF(r->>'target_stage_id','')::uuid;
 IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stages WHERE id=parent AND clinic_id=c) THEN
  RAISE EXCEPTION 'FOREIGN_WORKFLOW_TARGET_STAGE' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='workflow_templates' AND NULLIF(r->>'updated_by','') IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(r->>'updated_by')::uuid AND clinic_id=c) THEN
  RAISE EXCEPTION 'FOREIGN_WORKFLOW_AUTHOR' USING ERRCODE='42501';
 END IF;
 NEW.clinic_id:=c;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.saas_seed_company_workflow(_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; item jsonb; phase uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.clinics WHERE id=_clinic) THEN RAISE EXCEPTION 'WORKFLOW_COMPANY_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.workflow_templates WHERE clinic_id=_clinic) THEN RETURN; END IF;
 IF NOT public.saas_company_trusted_backend() AND NOT (pg_trigger_depth()>0 AND EXISTS(SELECT 1 FROM public.clinics WHERE id=_clinic AND owner_id=auth.uid())) THEN
  RAISE EXCEPTION 'WORKFLOW_SEED_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.phases(name,color,position,clinic_id) VALUES('Fluxo','#1F8AFF',10,_clinic) RETURNING id INTO phase;
 INSERT INTO public.workflow_settings(id,phases_enabled,stages_enabled,auto_advance_enabled,progress_bar_enabled,clinic_id)
 VALUES(true,true,true,true,true,_clinic) ON CONFLICT(clinic_id,id) DO NOTHING;
 FOREACH k IN ARRAY ARRAY['common','provisional','mockup','mockup_provisional'] LOOP
  INSERT INTO public.workflow_templates(flow_key,name,active_version,clinic_id)
  VALUES(k,CASE k WHEN 'common' THEN 'Caso comum' WHEN 'provisional' THEN 'Caso com provisório' WHEN 'mockup' THEN 'Caso com mockup' ELSE 'Mockup + provisório' END,1,_clinic);
  FOR item IN SELECT * FROM jsonb_array_elements(public.workflow_default_stages(k)) LOOP
   INSERT INTO public.stages(name,color,position,phase_id,flow_key,workflow_version,stage_key,condition_key,requirements,clinic_id)
   VALUES(item->>'name',item->>'color',(item->>'position')::integer,phase,k,1,item->>'stage_key',item->>'condition_key','[]',_clinic);
  END LOOP;
 END LOOP;
 INSERT INTO public.stage_return_reasons(label,position,clinic_id)
 VALUES('Ajuste',10,_clinic),('Correção',20,_clinic),('Revisão',30,_clinic),('Outro',40,_clinic);
END $$;

CREATE OR REPLACE FUNCTION public.saas_on_clinic_seed_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.saas_seed_company_workflow(NEW.id); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.assign_case_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid; key text; version integer; active integer; semantic text;
 requested public.stages%ROWTYPE; target public.stages%ROWTYPE; changed boolean;
BEGIN
 SELECT COALESCE(p.clinic_id,r.clinic_id) INTO company
  FROM (SELECT NEW.patient_id AS patient_id,NEW.requested_by AS requested_by) x
  LEFT JOIN public.patients p ON p.id=x.patient_id LEFT JOIN public.profiles r ON r.id=x.requested_by;
 IF company IS NULL THEN RAISE EXCEPTION 'CASE_WORKFLOW_COMPANY_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.saas_company_trusted_backend() THEN
  IF TG_OP='INSERT' AND NOT public.saas_company_can_read(company) THEN RAISE EXCEPTION 'FOREIGN_CASE_WORKFLOW_COMPANY' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND company IS DISTINCT FROM public.saas_case_company_id(OLD.id) THEN RAISE EXCEPTION 'CASE_WORKFLOW_COMPANY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 END IF;
 key:=public.case_flow_key(NEW.has_mockup,NEW.has_provisional);
 SELECT active_version INTO active FROM public.workflow_templates WHERE clinic_id=company AND flow_key=key;
 IF active IS NULL THEN RAISE EXCEPTION 'COMPANY_WORKFLOW_NOT_INITIALIZED' USING ERRCODE='42501'; END IF;
 IF NEW.current_stage_id IS NOT NULL THEN
  SELECT * INTO requested FROM public.stages WHERE id=NEW.current_stage_id;
  IF requested.clinic_id IS DISTINCT FROM company THEN RAISE EXCEPTION 'FOREIGN_CASE_WORKFLOW_STAGE' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='INSERT' THEN version:=active; semantic:='entry';
 ELSE
  changed:=OLD.has_mockup IS DISTINCT FROM NEW.has_mockup OR OLD.has_provisional IS DISTINCT FROM NEW.has_provisional OR OLD.workflow_key IS DISTINCT FROM key;
  -- A normal stage move keeps its historical workflow version. Saving a new
  -- template without apply_open must not silently migrate ongoing cases.
  version:=CASE WHEN changed THEN active ELSE COALESCE(NEW.workflow_version,OLD.workflow_version,active) END;
  IF NEW.current_stage_id IS NULL AND NOT changed THEN NEW.workflow_key:=key; NEW.workflow_version:=version; NEW.current_phase_id:=NULL; RETURN NEW; END IF;
  IF requested.id IS NOT NULL AND requested.flow_key=key AND requested.workflow_version=version THEN
   NEW.workflow_key:=key; NEW.workflow_version:=version; NEW.current_phase_id:=requested.phase_id; RETURN NEW;
  END IF;
  semantic:=requested.stage_key;
  IF semantic IS NULL THEN SELECT stage_key INTO semantic FROM public.stages WHERE id=OLD.current_stage_id AND clinic_id=company; END IF;
 END IF;
 SELECT * INTO target FROM public.stages WHERE clinic_id=company AND flow_key=key AND workflow_version=version
  AND stage_key=COALESCE(semantic,'entry') ORDER BY position,id LIMIT 1;
 IF target.id IS NULL THEN SELECT * INTO target FROM public.stages WHERE clinic_id=company AND flow_key=key AND workflow_version=version AND stage_key='entry' ORDER BY position,id LIMIT 1; END IF;
 IF target.id IS NULL THEN RAISE EXCEPTION 'COMPANY_WORKFLOW_ENTRY_MISSING' USING ERRCODE='42501'; END IF;
 NEW.workflow_key:=key; NEW.workflow_version:=version; NEW.current_stage_id:=target.id; NEW.current_phase_id:=target.phase_id;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.saas_guard_case_workflow_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid; stage uuid; phase uuid; case_id uuid;
BEGIN
 IF TG_TABLE_NAME='cases' THEN
  SELECT COALESCE(p.clinic_id,r.clinic_id) INTO company FROM (SELECT NEW.patient_id AS patient_id,NEW.requested_by AS requested_by) x
   LEFT JOIN public.patients p ON p.id=x.patient_id LEFT JOIN public.profiles r ON r.id=x.requested_by;
  stage:=NEW.current_stage_id; phase:=NEW.current_phase_id;
 ELSE
  company:=public.saas_case_company_id(NEW.case_id); stage:=NEW.stage_id;
  IF NOT public.saas_company_trusted_backend() AND NOT public.can_modify_case(NEW.case_id) THEN
   RAISE EXCEPTION 'CASE_WORKFLOW_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF company IS NULL THEN RAISE EXCEPTION 'CASE_WORKFLOW_COMPANY_REQUIRED' USING ERRCODE='42501'; END IF;
 IF stage IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stages WHERE id=stage AND clinic_id=company) THEN
  RAISE EXCEPTION 'FOREIGN_CASE_WORKFLOW_STAGE' USING ERRCODE='42501'; END IF;
 IF phase IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.phases WHERE id=phase AND clinic_id=company) THEN
  RAISE EXCEPTION 'FOREIGN_CASE_WORKFLOW_PHASE' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.update_company_workflow_settings(_patch jsonb,_expected_clinic uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid:=public.saas_company_current_id(); k text; result jsonb;
BEGIN
 IF _expected_clinic IS NOT NULL AND _expected_clinic IS DISTINCT FROM company THEN RAISE EXCEPTION 'WORKFLOW_COMPANY_CHANGED' USING ERRCODE='42501'; END IF;
 IF NOT public.saas_company_can_manage_workflow(company) THEN RAISE EXCEPTION 'WORKFLOW_COMPANY_WRITE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_patch) IS DISTINCT FROM 'object' OR _patch-ARRAY['phases_enabled','stages_enabled','auto_advance_enabled','progress_bar_enabled']<>'{}'::jsonb THEN
  RAISE EXCEPTION 'INVALID_WORKFLOW_SETTINGS' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(_patch) LOOP IF jsonb_typeof(_patch->k)<>'boolean' THEN RAISE EXCEPTION 'INVALID_WORKFLOW_SETTINGS' USING ERRCODE='22023'; END IF; END LOOP;
 UPDATE public.workflow_settings SET phases_enabled=COALESCE((_patch->>'phases_enabled')::boolean,phases_enabled),
  stages_enabled=COALESCE((_patch->>'stages_enabled')::boolean,stages_enabled),auto_advance_enabled=COALESCE((_patch->>'auto_advance_enabled')::boolean,auto_advance_enabled),
  progress_bar_enabled=COALESCE((_patch->>'progress_bar_enabled')::boolean,progress_bar_enabled),updated_at=now()
 WHERE clinic_id=company AND id=true RETURNING to_jsonb(workflow_settings.*) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'COMPANY_WORKFLOW_NOT_INITIALIZED'; END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.save_workflow_template(_flow_key text, _stages jsonb, _apply_open boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid:=public.saas_company_current_id();
  v_old_version integer;
  v_new_version integer;
  v_phase uuid;
  item jsonb;
  v_new_stage uuid;
  v_source uuid;
  v_count integer := 0;
  c RECORD;
  v_current_key text;
  v_current_pos integer;
  v_target RECORD;
BEGIN
  IF NOT public.current_user_can_manage_workflow() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas Admin/CEO podem editar fluxos.');
  END IF;
  IF _flow_key NOT IN ('common','provisional','mockup','mockup_provisional') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fluxo inválido.');
  END IF;
  IF jsonb_typeof(_stages) IS DISTINCT FROM 'array' OR jsonb_array_length(_stages) < 2 OR jsonb_array_length(_stages)>100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'O fluxo precisa ter pelo menos duas etapas.');
  END IF;

  SELECT active_version INTO v_old_version FROM public.workflow_templates WHERE clinic_id=v_company AND flow_key = _flow_key FOR UPDATE;
  IF v_old_version IS NULL THEN RAISE EXCEPTION 'COMPANY_WORKFLOW_NOT_INITIALIZED' USING ERRCODE='42501'; END IF;
  v_new_version := v_old_version + 1;
  SELECT id INTO v_phase FROM public.phases WHERE clinic_id=v_company ORDER BY position,id LIMIT 1;

  FOR item IN SELECT * FROM jsonb_array_elements(_stages) LOOP
    v_count := v_count + 1;
    v_source := NULLIF(item->>'source_id','')::uuid;
    IF v_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stages WHERE id=v_source AND clinic_id=v_company AND flow_key=_flow_key) THEN RAISE EXCEPTION 'FOREIGN_WORKFLOW_SOURCE' USING ERRCODE='42501'; END IF;
    INSERT INTO public.stages(
      name, color, position, phase_id, flow_key, workflow_version, stage_key,
      condition_key, requirements, requires_implant_components, clinic_id
    ) VALUES (
      trim(COALESCE(item->>'name','Etapa')),
      COALESCE(NULLIF(item->>'color',''), '#94a3b8'),
      COALESCE((item->>'position')::integer, v_count * 10),
      v_phase,
      _flow_key,
      v_new_version,
      COALESCE(NULLIF(item->>'stage_key',''), 'custom_' || v_count::text),
      NULLIF(item->>'condition_key',''),
      COALESCE(item->'requirements', '[]'::jsonb),
      COALESCE((item->>'requires_implant_components')::boolean, false), v_company
    ) RETURNING id INTO v_new_stage;

    IF v_source IS NOT NULL THEN
      INSERT INTO public.stage_assignments(stage_id, user_id)
      SELECT v_new_stage, a.user_id FROM public.stage_assignments a
       WHERE a.stage_id = v_source AND a.clinic_id=v_company
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.workflow_templates
     SET active_version = v_new_version, updated_at = now(), updated_by = auth.uid()
   WHERE clinic_id=v_company AND flow_key = _flow_key;

  IF _apply_open THEN
    FOR c IN
      SELECT id, current_stage_id
        FROM public.cases
       WHERE public.saas_case_company_id(id)=v_company AND workflow_key = _flow_key
         AND finished_at IS NULL
         AND COALESCE(status,'') NOT IN ('finalizado','finished','arquivado','cancelado','deleted')
    LOOP
      SELECT stage_key, position INTO v_current_key, v_current_pos
        FROM public.stages WHERE id = c.current_stage_id AND clinic_id=v_company;
      SELECT id, phase_id INTO v_target
        FROM public.stages
       WHERE clinic_id=v_company AND flow_key = _flow_key AND workflow_version = v_new_version
         AND stage_key = v_current_key
       ORDER BY position LIMIT 1;
      IF NOT FOUND THEN
        SELECT id, phase_id INTO v_target
          FROM public.stages
         WHERE clinic_id=v_company AND flow_key = _flow_key AND workflow_version = v_new_version
         ORDER BY abs(position - COALESCE(v_current_pos,10)), position
         LIMIT 1;
      END IF;
      UPDATE public.cases
         SET workflow_version = v_new_version,
             current_stage_id = v_target.id,
             current_phase_id = v_target.phase_id,
             updated_at = now()
       WHERE id = c.id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'flow_key', _flow_key,
    'version', v_new_version,
    'applied_open_cases', _apply_open
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.advance_case_workflow(_case_id uuid, _stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur_stage RECORD; chosen RECORD;
  next_phase_id uuid; next_stage_id uuid;
  v_user uuid := auth.uid();
  v_next_stage_name text;
  r RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_modify_case(_case_id) THEN RAISE EXCEPTION 'CASE_WORKFLOW_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;
  IF NOT (public.user_can_advance(v_user, c.current_phase_id, c.current_stage_id) OR public.saas_company_can_manage_workflow(public.saas_case_company_id(_case_id))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas os responsáveis por esta etapa podem avançar.');
  END IF;

  IF _stage_id IS NOT NULL THEN
    SELECT * INTO chosen FROM public.stages
     WHERE id = _stage_id AND flow_key = c.workflow_key AND workflow_version = c.workflow_version AND clinic_id=public.saas_case_company_id(_case_id);
    IF chosen IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Etapa não pertence ao fluxo ativo deste caso.'); END IF;
    IF chosen.condition_key = 'requires_sintering' AND NOT public.case_requires_sintering(_case_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Este caso não requer sinterização.');
    END IF;
    next_phase_id := chosen.phase_id;
    next_stage_id := chosen.id;
  ELSE
    SELECT * INTO cur_stage FROM public.stages WHERE id = c.current_stage_id;
    SELECT id, phase_id INTO next_stage_id, next_phase_id
      FROM public.stages
     WHERE clinic_id=public.saas_case_company_id(_case_id) AND flow_key = c.workflow_key AND workflow_version = c.workflow_version
       AND position > COALESCE(cur_stage.position,0)
       AND (condition_key IS DISTINCT FROM 'requires_sintering' OR public.case_requires_sintering(_case_id))
     ORDER BY position LIMIT 1;
  END IF;

  IF next_stage_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não há próxima etapa no fluxo.');
  END IF;

  UPDATE public.cases SET current_phase_id=next_phase_id, current_stage_id=next_stage_id, updated_at=now() WHERE id=_case_id;
  SELECT name INTO v_next_stage_name FROM public.stages WHERE id=next_stage_id;
  FOR r IN SELECT user_id FROM public.stage_assignments WHERE stage_id=next_stage_id LOOP
    IF r.user_id <> v_user THEN
      INSERT INTO public.notifications(sender_id,recipient_id,title,content,type,metadata)
      VALUES(v_user,r.user_id,'Caso avançou no fluxo','Um caso chegou na etapa '||COALESCE(v_next_stage_name,'seguinte')||'.','workflow',jsonb_build_object('case_id',_case_id,'stage_id',next_stage_id));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success',true,'phase_id',next_phase_id,'stage_id',next_stage_id);
END $function$
;

CREATE OR REPLACE FUNCTION public.return_case_workflow(_case_id uuid, _reason_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text, _to_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; cur_stage RECORD; target RECORD; v_user uuid:=auth.uid();
  v_reason text; v_stage_name text; r RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_modify_case(_case_id) THEN RAISE EXCEPTION 'CASE_WORKFLOW_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.cases WHERE id=_case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success',false,'error','Caso não encontrado'); END IF;
  IF NOT (public.user_can_advance(v_user,c.current_phase_id,c.current_stage_id) OR public.saas_company_can_manage_workflow(public.saas_case_company_id(_case_id))) THEN
    RETURN jsonb_build_object('success',false,'error','Apenas os responsáveis por esta etapa podem retornar o caso.');
  END IF;

  IF _to_stage_id IS NOT NULL THEN
    SELECT * INTO target FROM public.stages
     WHERE id=_to_stage_id AND flow_key=c.workflow_key AND workflow_version=c.workflow_version AND clinic_id=public.saas_case_company_id(_case_id);
  ELSE
    SELECT * INTO cur_stage FROM public.stages WHERE id=c.current_stage_id;
    SELECT * INTO target FROM public.stages
     WHERE clinic_id=public.saas_case_company_id(_case_id) AND flow_key=c.workflow_key AND workflow_version=c.workflow_version
       AND position < COALESCE(cur_stage.position,2147483647)
       AND (condition_key IS DISTINCT FROM 'requires_sintering' OR public.case_requires_sintering(_case_id))
     ORDER BY position DESC LIMIT 1;
  END IF;
  IF target IS NULL THEN RETURN jsonb_build_object('success',false,'error','Não há etapa anterior válida no fluxo.'); END IF;

  IF _reason_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stage_return_reasons WHERE id=_reason_id AND clinic_id=public.saas_case_company_id(_case_id)) THEN RAISE EXCEPTION 'FOREIGN_WORKFLOW_REASON' USING ERRCODE='42501'; END IF;
  SELECT label INTO v_reason FROM public.stage_return_reasons WHERE id=_reason_id AND clinic_id=public.saas_case_company_id(_case_id);
  v_stage_name := target.name;
  UPDATE public.cases SET current_stage_id=target.id,current_phase_id=target.phase_id,updated_at=now() WHERE id=_case_id;
  INSERT INTO public.case_activity(case_id,actor_id,user_id,kind,message,metadata)
  VALUES(_case_id,v_user,v_user,'workflow_return','Caso retornado para '||COALESCE(v_stage_name,'etapa anterior')||COALESCE(' — '||v_reason,'')||COALESCE(' ('||_notes||')',''),jsonb_build_object('reason_id',_reason_id,'to_stage_id',target.id));
  FOR r IN SELECT user_id FROM public.stage_assignments WHERE stage_id=target.id LOOP
    IF r.user_id <> v_user THEN
      INSERT INTO public.notifications(sender_id,recipient_id,title,content,type,metadata)
      VALUES(v_user,r.user_id,'Caso retornou para sua etapa',COALESCE(v_reason,'Retorno de etapa')||COALESCE(': '||_notes,''),'workflow',jsonb_build_object('case_id',_case_id,'stage_id',target.id));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success',true,'phase_id',target.phase_id,'stage_id',target.id);
END $function$
;

CREATE OR REPLACE FUNCTION public.reset_default_workflows(_apply_open boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE k text; r jsonb;
BEGIN
  IF NOT public.current_user_can_manage_workflow() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas Admin/CEO podem restaurar fluxos.');
  END IF;
  FOREACH k IN ARRAY ARRAY['common','provisional','mockup','mockup_provisional'] LOOP
    r := public.save_workflow_template(k, public.workflow_default_stages(k), _apply_open);
    IF COALESCE((r->>'success')::boolean,false) = false THEN RETURN r; END IF;
  END LOOP;
  UPDATE public.workflow_settings SET phases_enabled=true, stages_enabled=true, progress_bar_enabled=true, updated_at=now() WHERE clinic_id=public.saas_company_current_id() AND id=true;
  RETURN jsonb_build_object('success', true, 'applied_open_cases', _apply_open);
END $function$
;

CREATE OR REPLACE FUNCTION public.user_can_advance(_user uuid,_phase_id uuid,_stage_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(_user=auth.uid(),false) AND
 CASE WHEN _stage_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id=_stage_id)
   THEN EXISTS(SELECT 1 FROM public.stage_assignments WHERE stage_id=_stage_id AND user_id=_user)
  WHEN _phase_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.phase_assignments WHERE phase_id=_phase_id)
   THEN EXISTS(SELECT 1 FROM public.phase_assignments WHERE phase_id=_phase_id AND user_id=_user)
  ELSE true END;
$$;

CREATE OR REPLACE FUNCTION public.saas_guard_shared_dictionary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.saas_company_trusted_backend() THEN RAISE EXCEPTION 'SHARED_DICTIONARY_READ_ONLY' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

REVOKE ALL ON FUNCTION public.saas_seed_company_workflow(uuid),public.saas_on_clinic_seed_workflow(),
 public.saas_guard_workflow_configuration(),public.saas_guard_case_workflow_references(),public.saas_guard_shared_dictionary()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.saas_company_can_manage_workflow(uuid),public.saas_can_read_workflow_company(uuid),
 public.current_user_can_manage_workflow(),public.user_can_advance(uuid,uuid,uuid),public.update_company_workflow_settings(jsonb,uuid),
 public.save_workflow_template(text,jsonb,boolean),public.reset_default_workflows(boolean),
 public.advance_case_workflow(uuid,uuid),public.return_case_workflow(uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_company_can_manage_workflow(uuid),public.saas_can_read_workflow_company(uuid),
 public.current_user_can_manage_workflow(),public.user_can_advance(uuid,uuid,uuid),public.update_company_workflow_settings(jsonb,uuid),
 public.save_workflow_template(text,jsonb,boolean),public.reset_default_workflows(boolean),
 public.advance_case_workflow(uuid,uuid),public.return_case_workflow(uuid,uuid,text,uuid) TO authenticated;
REVOKE ALL ON public.case_types,public.tooth_colors FROM PUBLIC,anon;
GRANT SELECT ON public.case_types,public.tooth_colors TO authenticated;
GRANT ALL ON public.case_types,public.tooth_colors TO service_role;
REVOKE ALL ON public.saas_legacy_workflow_settings_archive FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE ON public.workflow_templates FROM authenticated;
REVOKE DELETE ON public.workflow_settings FROM authenticated;

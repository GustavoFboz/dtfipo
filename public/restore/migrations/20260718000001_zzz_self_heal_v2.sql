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

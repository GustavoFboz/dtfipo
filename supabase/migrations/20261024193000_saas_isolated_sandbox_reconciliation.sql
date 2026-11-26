-- Fixed acceptance fixtures only. Never changes runtime environment, scheduler,
-- Production rows, MFA or operator enrollment. Normal lifecycle functions apply
-- provider-verified payments; these helpers only scope and lease the test work.
ALTER TABLE public.saas_fixture_acceptance_jobs DROP CONSTRAINT saas_fixture_acceptance_jobs_kind_check;
ALTER TABLE public.saas_fixture_acceptance_jobs ADD CONSTRAINT saas_fixture_acceptance_jobs_kind_check
 CHECK(kind IN('identity','storage','billing','ownership','configuration','reconciliation'));

CREATE TABLE public.saas_fixture_reconciliation_resources(
 job_id uuid NOT NULL REFERENCES public.saas_fixture_acceptance_jobs(id),
 subscription_id uuid NOT NULL REFERENCES public.account_subscriptions(id),
 payment_id text NOT NULL CHECK(payment_id ~ '^pay_[A-Za-z0-9]+$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(job_id,subscription_id),UNIQUE(job_id,payment_id));
ALTER TABLE public.saas_fixture_reconciliation_resources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_fixture_reconciliation_resources FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.saas_assert_fixture_reconciliation_job(p_job_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT EXISTS(
  SELECT 1 FROM public.saas_fixture_acceptance_jobs WHERE id=p_job_id AND kind='reconciliation'
   AND status='running' AND token_hash IS NULL AND claimed_at IS NOT NULL AND expires_at>now()) THEN
  RAISE EXCEPTION 'FIXTURE_RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
END $$;

CREATE FUNCTION public.saas_register_fixture_reconciliation_resource(p_job_id uuid,p_subscription_id uuid,p_payment_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c uuid; BEGIN
 PERFORM public.saas_assert_fixture_reconciliation_job(p_job_id);
 IF p_payment_id IS NULL OR p_payment_id !~ '^pay_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'FIXTURE_RESOURCE_INVALID' USING ERRCODE='42501'; END IF;
 SELECT s.clinic_id INTO c FROM public.account_subscriptions s JOIN public.clinics cl ON cl.id=s.clinic_id
 JOIN public.profiles p ON p.id=cl.owner_id AND p.clinic_id=cl.id JOIN auth.users u ON u.id=p.id
 WHERE s.id=p_subscription_id AND s.provider_environment='sandbox' AND s.billing_provider='asaas'
 AND s.plan_code='company_growth' AND s.status='active' AND s.external_subscription_id ~ '^sub_[A-Za-z0-9]+$'
 AND s.external_customer_id ~ '^cus_[A-Za-z0-9]+$' AND public.billing_subscription_contract_amount(s.id)=44900
 AND NOT cl.billing_exempt AND u.raw_user_meta_data->>'acceptance_fixture'='true'
 AND NOT EXISTS(SELECT 1 FROM public.platform_operators WHERE user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.account_subscriptions ps WHERE ps.clinic_id=cl.id AND ps.provider_environment='production')
 AND (u.id,u.email,cl.id) IN (
 ('ee083f63-1621-4b82-b7a4-fd13427c0b14'::uuid,'dentalflow-acceptance-20261004-e0537565-4015-4ffe-a249-5da489824e6e@example.invalid','081d3db4-1606-40f7-a878-19b51556317d'::uuid),
 ('24e7cdf9-457e-4af2-b1cb-cf366abbddb0'::uuid,'dentalflow-acceptance-20261004-237e6ef4-9893-43d2-b9a3-311f8708aa3d@example.invalid','3fc86c40-697e-4725-a9e9-633fc882aadc'::uuid));
 IF c IS NULL THEN RAISE EXCEPTION 'FIXTURE_RESOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.saas_fixture_reconciliation_resources r JOIN public.account_subscriptions s ON s.id=r.subscription_id
  WHERE r.job_id=p_job_id AND s.clinic_id=c AND (r.subscription_id<>p_subscription_id OR r.payment_id<>p_payment_id)) THEN
  RAISE EXCEPTION 'FIXTURE_RESOURCE_ALREADY_BOUND' USING ERRCODE='42501'; END IF;
 INSERT INTO public.saas_fixture_reconciliation_resources(job_id,subscription_id,payment_id)
 VALUES(p_job_id,p_subscription_id,p_payment_id) ON CONFLICT DO NOTHING;
 RETURN EXISTS(SELECT 1 FROM public.saas_fixture_reconciliation_resources WHERE job_id=p_job_id AND subscription_id=p_subscription_id AND payment_id=p_payment_id);
END $$;

CREATE FUNCTION public.saas_enqueue_fixture_asaas_recovery(p_job_id uuid,p_payment_id text,p_provider_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t text; BEGIN
 PERFORM public.saas_assert_fixture_reconciliation_job(p_job_id);
 IF p_provider_status IS NULL OR p_provider_status NOT IN('CONFIRMED','RECEIVED') OR NOT EXISTS(
  SELECT 1 FROM public.saas_fixture_reconciliation_resources r JOIN public.account_subscriptions s ON s.id=r.subscription_id
  WHERE r.job_id=p_job_id AND r.payment_id=p_payment_id AND s.provider_environment='sandbox'
   AND s.clinic_id IN('081d3db4-1606-40f7-a878-19b51556317d','3fc86c40-697e-4725-a9e9-633fc882aadc')) THEN
  RAISE EXCEPTION 'FIXTURE_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 t:=CASE p_provider_status WHEN 'CONFIRMED' THEN 'PAYMENT_CONFIRMED' ELSE 'PAYMENT_RECEIVED' END;
 RETURN public.billing_receive_asaas_event('sandbox','evt_reconcile_'||p_payment_id||'_'||p_provider_status,t,
  jsonb_build_object('paymentId',p_payment_id,'source','reconciliation'));
END $$;

CREATE FUNCTION public.saas_claim_fixture_asaas_events(p_job_id uuid)
RETURNS TABLE(id uuid,event_type text,payload jsonb,lease_token uuid,attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.saas_assert_fixture_reconciliation_job(p_job_id);
 RETURN QUERY WITH claimed AS (
  SELECT e.id FROM public.billing_events e WHERE e.provider='asaas' AND e.provider_environment='sandbox'
  AND e.next_attempt_at<=now() AND (e.status IN('received','failed') OR(e.status='processing' AND e.lease_until<now()))
  AND EXISTS(SELECT 1 FROM public.saas_fixture_reconciliation_resources r WHERE r.job_id=p_job_id AND r.payment_id=e.payload->>'paymentId')
  ORDER BY e.received_at,e.id LIMIT 10 FOR UPDATE SKIP LOCKED)
 UPDATE public.billing_events e SET status='processing',lease_token=gen_random_uuid(),
  lease_until=now()+interval '90 seconds',attempt_count=e.attempt_count+1
 FROM claimed c WHERE e.id=c.id RETURNING e.id,e.event_type,e.payload,e.lease_token,e.attempt_count;
END $$;

CREATE FUNCTION public.saas_fixture_business_fingerprint(p_job_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t text; clause text; n bigint; h text; accumulated text:=''; BEGIN
 PERFORM public.saas_assert_fixture_reconciliation_job(p_job_id);
 FOREACH t IN ARRAY ARRAY['account_subscriptions','billing_payments','patients','cases',
 'component_categories','components','implant_systems','implant_component_types','implant_system_components','scan_jigs',
 'stock_items','stock_item_custom_fields','stock_movements','stock_consumption_rules','case_stock_consumptions',
 'case_tooth_stock_usage','case_implant_teeth','holders','burrs','burr_usages','resin_pots','resin_weighings','user_stock_access',
 'cadistas','doctors','proteticos','phases','stages','phase_assignments','stage_assignments','stage_return_reasons','workflow_templates','workflow_settings'] LOOP
  clause:=CASE WHEN t='cases' THEN 'public.saas_case_company_id(r.id)' ELSE 'r.clinic_id' END;
  EXECUTE format('SELECT count(*),md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'''' ORDER BY md5(to_jsonb(r)::text)),'''')) FROM public.%I r WHERE %s IS NULL OR %s NOT IN(''081d3db4-1606-40f7-a878-19b51556317d''::uuid,''3fc86c40-697e-4725-a9e9-633fc882aadc''::uuid)',t,clause,clause) INTO n,h;
  accumulated:=accumulated||t||':'||n||':'||h||';';
 END LOOP;
 RETURN md5(accumulated);
END $$;

REVOKE ALL ON FUNCTION public.saas_assert_fixture_reconciliation_job(uuid),
 public.saas_register_fixture_reconciliation_resource(uuid,uuid,text),public.saas_enqueue_fixture_asaas_recovery(uuid,text,text),
 public.saas_claim_fixture_asaas_events(uuid),public.saas_fixture_business_fingerprint(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.saas_register_fixture_reconciliation_resource(uuid,uuid,text),
 public.saas_enqueue_fixture_asaas_recovery(uuid,text,text),public.saas_claim_fixture_asaas_events(uuid),
 public.saas_fixture_business_fingerprint(uuid) TO service_role;
NOTIFY pgrst,'reload schema';

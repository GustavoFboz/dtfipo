-- Read-only, usable after the period migration on a restore or the live DB.
BEGIN TRANSACTION READ ONLY;
DO $$ BEGIN
 IF to_regclass('public.billing_plan_periods') IS NULL
 OR has_table_privilege('authenticated','public.billing_plan_periods','SELECT')
 OR has_table_privilege('service_role','public.billing_plan_periods','INSERT')
 OR has_table_privilege('service_role','public.billing_plan_change_executions','UPDATE')
 OR has_function_privilege('authenticated','public.billing_finish_plan_change(uuid,uuid,jsonb,text)','EXECUTE')
 OR has_function_privilege('service_role','public.platform_master_claim_plan_change(uuid,text,text,boolean)','EXECUTE')
 OR has_function_privilege('anon','public.billing_refresh_subscription_plan(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.billing_subscription_price_context(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.platform_master_claim_plan_change(uuid,text,text,boolean)','EXECUTE') THEN
 RAISE EXCEPTION 'Plan price periods grants are unsafe'; END IF;
 IF EXISTS(SELECT 1 FROM public.billing_plan_periods t JOIN public.billing_change_requests r ON r.id=t.request_id
 JOIN public.account_subscriptions s ON s.id=t.subscription_id
 WHERE r.kind<>'change_plan' OR r.status<>'completed' OR t.clinic_id IS DISTINCT FROM s.clinic_id
 OR t.provider_environment IS DISTINCT FROM s.provider_environment OR t.amount_cents IS DISTINCT FROM r.target_amount_cents
 OR t.plan_code IS DISTINCT FROM r.target_plan_code) THEN RAISE EXCEPTION 'Period agreement differs from its authorized request'; END IF;
END $$;
ROLLBACK;
SELECT 'passed' AS plan_price_periods_private_contract;

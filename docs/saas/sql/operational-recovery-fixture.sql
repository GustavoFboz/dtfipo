-- DISPOSABLE CI SOURCE DATABASE ONLY. Committed synthetic data intentionally
-- survives until a real encrypted backup and isolated restore have been tested.
-- No real Auth/MFA/payment or Asaas API acceptance is asserted by these rows.
BEGIN;
-- This is data seeding in a disposable database, not an Auth onboarding test.
-- Populate the cyclic users/profiles/clinic graph explicitly, without the
-- legacy first-user trigger generating an unrelated clinic UUID.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) VALUES
 ('92900000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','recovery-a@example.invalid','',now(),now()),
 ('92900000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','recovery-b@example.invalid','',now(),now());
INSERT INTO public.clinics(id,name,slug,owner_id) VALUES
 ('92900000-0000-4000-8000-000000000010','Disposable recovery A','recovery-a','92900000-0000-4000-8000-000000000001'),
 ('92900000-0000-4000-8000-000000000020','Disposable recovery B','recovery-b','92900000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,full_name,email,clinic_id,role,account_subtype,is_default_admin) VALUES
 ('92900000-0000-4000-8000-000000000001','Disposable Recovery A','recovery-a@example.invalid','92900000-0000-4000-8000-000000000010','CEO','CEO',false),
 ('92900000-0000-4000-8000-000000000002','Disposable Recovery B','recovery-b@example.invalid','92900000-0000-4000-8000-000000000020','CEO','CEO',false);
INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES
 ('92900000-0000-4000-8000-000000000010','92900000-0000-4000-8000-000000000001','CEO','active'),
 ('92900000-0000-4000-8000-000000000020','92900000-0000-4000-8000-000000000002','CEO','active');
INSERT INTO public.patients(id,name,clinic_id) VALUES
 ('92900000-0000-4000-8000-000000000011','Disposable ação 🦷 A','92900000-0000-4000-8000-000000000010'),
 ('92900000-0000-4000-8000-000000000021','Disposable ação 🦷 B','92900000-0000-4000-8000-000000000020');
INSERT INTO public.cases(id,patient_id,requested_by,status,delivery_date) VALUES
 ('92900000-0000-4000-8000-000000000012','92900000-0000-4000-8000-000000000011','92900000-0000-4000-8000-000000000001','pendente',current_date+7),
 ('92900000-0000-4000-8000-000000000022','92900000-0000-4000-8000-000000000021','92900000-0000-4000-8000-000000000002','pendente',current_date+7);
INSERT INTO public.account_subscriptions(id,scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,
 billing_provider,provider_environment,billing_cycle,external_customer_id,external_subscription_id) VALUES
 ('92900000-0000-4000-8000-000000000030','company','92900000-0000-4000-8000-000000000010','company_growth','active',18,current_date-10,current_date+20,
 'asaas','sandbox','MONTHLY','cus_DisposableRecoveryA','sub_DisposableRecoveryA'),
 ('92900000-0000-4000-8000-000000000040','company','92900000-0000-4000-8000-000000000020','company_initial','canceled',18,current_date-10,current_date+20,
 'asaas','sandbox','MONTHLY','cus_DisposableRecoveryB','sub_DisposableRecoveryB');
INSERT INTO public.billing_payments(id,subscription_id,clinic_id,amount_cents,currency,status,provider,provider_environment,provider_payment_id,paid_at,period_start,period_end) VALUES
 ('92900000-0000-4000-8000-000000000031','92900000-0000-4000-8000-000000000030','92900000-0000-4000-8000-000000000010',44900,'BRL','paid','asaas','sandbox','pay_DisposableRecoveryA',now(),current_date-10,current_date+20),
 ('92900000-0000-4000-8000-000000000041','92900000-0000-4000-8000-000000000040','92900000-0000-4000-8000-000000000020',500,'BRL','paid','asaas','sandbox','pay_DisposableRecoveryB',now(),current_date-10,current_date+20);
-- Preserve a scheduled price agreement as data; this is not evidence of a
-- provider write, real approval, MFA or calendar activation.
INSERT INTO public.billing_change_requests(id,clinic_id,subscription_id,requested_by,kind,status,provider_environment,
 current_plan_code,current_plan_name,current_amount_cents,target_plan_code,target_plan_name,target_amount_cents,
 currency,paid_period_end,effective_not_before,quote_token,quote_snapshot,completed_at) VALUES
 ('92900000-0000-4000-8000-000000000050','92900000-0000-4000-8000-000000000010','92900000-0000-4000-8000-000000000030',
 '92900000-0000-4000-8000-000000000001','change_plan','completed','sandbox','company_growth','Growth',44900,
 'company_initial','Initial',500,'BRL',current_date+20,current_date+20,repeat('f',64),'{"disposable_recovery":true}',now());
INSERT INTO public.billing_plan_periods(id,request_id,subscription_id,clinic_id,provider_environment,effective_date,
 previous_plan_code,previous_amount_cents,plan_code,amount_cents,quote_snapshot,state) VALUES
 ('92900000-0000-4000-8000-000000000051','92900000-0000-4000-8000-000000000050','92900000-0000-4000-8000-000000000030',
 '92900000-0000-4000-8000-000000000010','sandbox',current_date+20,'company_growth',44900,'company_initial',500,
 '{"disposable_recovery":true}','scheduled');
-- An independent bigint and generated-column sentinel detects JSON Number
-- truncation and incorrect generated-column writes in the database round trip.
CREATE TABLE public.recovery_bigint_sentinel(id bigint PRIMARY KEY, amount bigint NOT NULL,
 doubled numeric GENERATED ALWAYS AS (amount::numeric*2) STORED);
INSERT INTO public.recovery_bigint_sentinel VALUES(9007199254740993123,9007199254740993123);
COMMIT;

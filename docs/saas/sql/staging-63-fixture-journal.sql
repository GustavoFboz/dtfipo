-- SaaS 6.3: tiny disposable staging fixture, not a capacity benchmark.
-- Runs exclusively on the CI-restored Supabase PostgreSQL database.
-- Never runs on Cloud/Production; no Asaas calls, no clinical data.
BEGIN;
SET LOCAL statement_timeout = '25s';
INSERT INTO auth.users
 (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
VALUES
 ('73900000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staging-a@example.invalid','',now(),now()),
 ('73900000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staging-b@example.invalid','',now(),now());
INSERT INTO public.clinics(id,name,slug,owner_id) VALUES
 ('73900000-0000-4000-8000-000000000010','Fixture staging A','stage-6-3-fixture-a','73900000-0000-4000-8000-000000000001'),
 ('73900000-0000-4000-8000-000000000020','Fixture staging B','stage-6-3-fixture-b','73900000-0000-4000-8000-000000000002');
INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES
 ('73900000-0000-4000-8000-000000000010','73900000-0000-4000-8000-000000000001','CEO','active'),
 ('73900000-0000-4000-8000-000000000020','73900000-0000-4000-8000-000000000002','CEO','active');
INSERT INTO public.profiles(id,clinic_id,role,account_subtype,is_default_admin) VALUES
 ('73900000-0000-4000-8000-000000000001','73900000-0000-4000-8000-000000000010','CEO','CEO',false),
 ('73900000-0000-4000-8000-000000000002','73900000-0000-4000-8000-000000000020','CEO','CEO',false)
ON CONFLICT(id) DO UPDATE SET clinic_id=excluded.clinic_id,
 role=excluded.role,account_subtype=excluded.account_subtype;
INSERT INTO public.account_subscriptions
 (scope_type,clinic_id,plan_code,status,billing_day,current_period_start,
  current_period_end,billing_provider,provider_environment)
VALUES
 ('company','73900000-0000-4000-8000-000000000010','company_initial','active',1,now(),now()+interval '1 month','asaas','sandbox'),
 ('company','73900000-0000-4000-8000-000000000020','company_initial','active',1,now(),now()+interval '1 month','asaas','sandbox');
INSERT INTO public.patients(id,name,clinic_id) VALUES
 ('73900000-0000-4000-8000-000000000011','Synthetic A1','73900000-0000-4000-8000-000000000010'),
 ('73900000-0000-4000-8000-000000000012','Synthetic A2','73900000-0000-4000-8000-000000000010'),
 ('73900000-0000-4000-8000-000000000021','Synthetic B1','73900000-0000-4000-8000-000000000020'),
 ('73900000-0000-4000-8000-000000000022','Synthetic B2','73900000-0000-4000-8000-000000000020');
INSERT INTO public.cases(id,patient_id,requested_by,delivery_date) VALUES
 ('73900000-0000-4000-8000-000000000031','73900000-0000-4000-8000-000000000011','73900000-0000-4000-8000-000000000001',current_date+7),
 ('73900000-0000-4000-8000-000000000032','73900000-0000-4000-8000-000000000012','73900000-0000-4000-8000-000000000001',current_date+7),
 ('73900000-0000-4000-8000-000000000041','73900000-0000-4000-8000-000000000021','73900000-0000-4000-8000-000000000002',current_date+7),
 ('73900000-0000-4000-8000-000000000042','73900000-0000-4000-8000-000000000022','73900000-0000-4000-8000-000000000002',current_date+7);

-- Positive controls: fixture size is intentionally fixed and non-vacuous.
DO $$
BEGIN
 IF (SELECT count(*) FROM public.clinics WHERE id IN
 ('73900000-0000-4000-8000-000000000010','73900000-0000-4000-8000-000000000020'))<>2
 OR (SELECT count(*) FROM public.patients WHERE id::text LIKE '73900000-0000-4000-8000-%')<>4
 OR (SELECT count(*) FROM public.cases WHERE id::text LIKE '73900000-0000-4000-8000-%')<>4
 THEN RAISE EXCEPTION 'STAGING_FIXTURE_INCOMPLETE'; END IF;
END $$;

-- This is a real PostgreSQL role/fixture test, not a real Supabase Auth login.
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"73900000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','73900000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.patients WHERE id::text LIKE '73900000-0000-4000-8000-%')<>2
 OR (SELECT count(*) FROM public.cases WHERE id::text LIKE '73900000-0000-4000-8000-%')<>2
 OR EXISTS(SELECT 1 FROM public.patients WHERE id IN
 ('73900000-0000-4000-8000-000000000021','73900000-0000-4000-8000-000000000022'))
 THEN RAISE EXCEPTION 'STAGING_A_CROSS_TENANT_OR_EMPTY_RESULT'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"73900000-0000-4000-8000-000000000002"}',true);
SELECT set_config('request.jwt.claim.sub','73900000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.patients WHERE id::text LIKE '73900000-0000-4000-8000-%')<>2
 OR (SELECT count(*) FROM public.cases WHERE id::text LIKE '73900000-0000-4000-8000-%')<>2
 OR EXISTS(SELECT 1 FROM public.patients WHERE id IN
 ('73900000-0000-4000-8000-000000000011','73900000-0000-4000-8000-000000000012'))
 THEN RAISE EXCEPTION 'STAGING_B_CROSS_TENANT_OR_EMPTY_RESULT'; END IF;
END $$;
RESET ROLE;
SELECT 'STAGING_FIXTURE_VERIFIED:2_companies_2_SQL_roles_4_patients_4_cases_0_real_clients' AS sanitized_journal;
ROLLBACK;

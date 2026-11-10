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
-- Mirror the authenticated CEO/admin grant used by the clinical-creation CI fixture.
-- These roles exist only until ROLLBACK in this disposable database.
INSERT INTO public.user_roles(user_id,role) VALUES
 ('73900000-0000-4000-8000-000000000001','admin'),
 ('73900000-0000-4000-8000-000000000002','admin')
ON CONFLICT DO NOTHING;
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

-- Beta step 4: simulate two entirely fictional Storage objects AND their
-- required upload reservations inside this disposable transaction.
-- Privileged fixture preparation does not simulate Auth or real Storage uploads;
-- the actual tenant boundaries below run with SET LOCAL ROLE authenticated.
INSERT INTO public.storage_files
 (clinic_id,bucket,object_path,source_type,case_id,
  original_name,mime_type,size_bytes,uploaded_by,status)
VALUES
 ('73900000-0000-4000-8000-000000000010','case-files',
  '73900000-0000-4000-8000-000000000031/stage4-a.stl','case_attachment',
  '73900000-0000-4000-8000-000000000031',
  'stage4-a.stl','application/octet-stream',17,
  '73900000-0000-4000-8000-000000000001','reserved'),
 ('73900000-0000-4000-8000-000000000020','case-files',
  '73900000-0000-4000-8000-000000000041/stage4-b.stl','case_attachment',
  '73900000-0000-4000-8000-000000000041',
  'stage4-b.stl','application/octet-stream',17,
  '73900000-0000-4000-8000-000000000002','reserved');
INSERT INTO storage.objects(bucket_id,name,metadata,owner_id) VALUES
 ('case-files','73900000-0000-4000-8000-000000000031/stage4-a.stl',
  '{"size":17,"mimetype":"application/octet-stream"}',
  '73900000-0000-4000-8000-000000000001'),
 ('case-files','73900000-0000-4000-8000-000000000041/stage4-b.stl',
  '{"size":17,"mimetype":"application/octet-stream"}',
  '73900000-0000-4000-8000-000000000002');
-- The actual attachment INSERT trigger must find the exact reservation,
-- file size, object metadata and upload actor. Never disable this trigger.
SELECT set_config('request.jwt.claim.sub','73900000-0000-4000-8000-000000000001',true);
INSERT INTO public.case_attachments
 (id,case_id,file_name,storage_path,size_bytes,mime_type,uploaded_by,kind)
VALUES
 ('73900000-0000-4000-8000-000000000051','73900000-0000-4000-8000-000000000031',
  'synthetic-a.stl','73900000-0000-4000-8000-000000000031/stage4-a.stl',17,'application/octet-stream',
  '73900000-0000-4000-8000-000000000001','other');
SELECT set_config('request.jwt.claim.sub','73900000-0000-4000-8000-000000000002',true);
INSERT INTO public.case_attachments
 (id,case_id,file_name,storage_path,size_bytes,mime_type,uploaded_by,kind)
VALUES
 ('73900000-0000-4000-8000-000000000052','73900000-0000-4000-8000-000000000041',
  'synthetic-b.stl','73900000-0000-4000-8000-000000000041/stage4-b.stl',17,'application/octet-stream',
  '73900000-0000-4000-8000-000000000002','other');

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
-- Authenticated SQL role A can enumerate exactly its own fake attachment, not B's.
DO $step4_attach_a$
DECLARE n bigint;
BEGIN
 SELECT count(*) INTO n FROM public.case_attachments
 WHERE id IN ('73900000-0000-4000-8000-000000000051','73900000-0000-4000-8000-000000000052');
 IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.case_attachments
   WHERE id='73900000-0000-4000-8000-000000000051')
 OR EXISTS(SELECT 1 FROM public.case_attachments
   WHERE id='73900000-0000-4000-8000-000000000052')
 THEN RAISE EXCEPTION 'STAGE4_A_ATTACHMENT_READ_BOUNDARY_FAILED'; END IF;
 DELETE FROM public.case_attachments WHERE id='73900000-0000-4000-8000-000000000052';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'STAGE4_A_FOREIGN_ATTACHMENT_DELETED'; END IF;
END $step4_attach_a$;
-- Beta step 4: real SQL-role case read/edit and negative ownership controls.
-- Existing synthetic rows only; each mutation is inside the outer ROLLBACK.
DO $stage4_a$
DECLARE n bigint := 0; denied boolean := false;
BEGIN
 IF NOT public.can_access_case('73900000-0000-4000-8000-000000000031')
    OR public.can_access_case('73900000-0000-4000-8000-000000000041')
    OR (SELECT count(*) FROM public.cases WHERE id='73900000-0000-4000-8000-000000000031')<>1
    OR EXISTS(SELECT 1 FROM public.cases WHERE id='73900000-0000-4000-8000-000000000041')
 THEN RAISE EXCEPTION 'STAGE4_A_READ_BOUNDARY_FAILED'; END IF;

 UPDATE public.cases SET notes='STAGE4_A_OWN_EDIT'
 WHERE id='73900000-0000-4000-8000-000000000031';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'STAGE4_A_OWN_EDIT_ROWCOUNT_%', n; END IF;
 IF (SELECT notes FROM public.cases
    WHERE id='73900000-0000-4000-8000-000000000031') IS DISTINCT FROM 'STAGE4_A_OWN_EDIT'
 THEN RAISE EXCEPTION 'STAGE4_A_OWN_EDIT_READBACK_FAILED'; END IF;

 UPDATE public.cases SET notes='STAGE4_FORGED_B_EDIT'
 WHERE id='73900000-0000-4000-8000-000000000041';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'STAGE4_A_FOREIGN_CASE_EDITED'; END IF;

 -- A permitted own edit must NOT enable switching a case to B's patient.
 n:=0;
 BEGIN
  UPDATE public.cases SET patient_id='73900000-0000-4000-8000-000000000021'
  WHERE id='73900000-0000-4000-8000-000000000031';
  GET DIAGNOSTICS n = ROW_COUNT;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF (NOT denied AND n<>0) OR
    (SELECT patient_id FROM public.cases
     WHERE id='73900000-0000-4000-8000-000000000031')
    IS DISTINCT FROM '73900000-0000-4000-8000-000000000011'::uuid
 THEN RAISE EXCEPTION 'STAGE4_A_FOREIGN_PATIENT_RELINKED'; END IF;
END $stage4_a$;
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
-- Authenticated SQL role B has its own positive attachment and cannot delete A's.
DO $step4_attach_b$
DECLARE n bigint;
BEGIN
 SELECT count(*) INTO n FROM public.case_attachments
 WHERE id IN ('73900000-0000-4000-8000-000000000051','73900000-0000-4000-8000-000000000052');
 IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.case_attachments
   WHERE id='73900000-0000-4000-8000-000000000052')
 OR EXISTS(SELECT 1 FROM public.case_attachments
   WHERE id='73900000-0000-4000-8000-000000000051')
 THEN RAISE EXCEPTION 'STAGE4_B_ATTACHMENT_READ_BOUNDARY_FAILED'; END IF;
 DELETE FROM public.case_attachments WHERE id='73900000-0000-4000-8000-000000000051';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'STAGE4_B_FOREIGN_ATTACHMENT_DELETED'; END IF;
END $step4_attach_b$;
DO $stage4_b$
DECLARE n bigint := 0;
BEGIN
 IF NOT public.can_access_case('73900000-0000-4000-8000-000000000041')
    OR public.can_access_case('73900000-0000-4000-8000-000000000031')
    OR (SELECT count(*) FROM public.cases WHERE id='73900000-0000-4000-8000-000000000041')<>1
    OR EXISTS(SELECT 1 FROM public.cases WHERE id='73900000-0000-4000-8000-000000000031')
 THEN RAISE EXCEPTION 'STAGE4_B_READ_BOUNDARY_FAILED'; END IF;

 UPDATE public.cases SET notes='STAGE4_B_OWN_EDIT'
 WHERE id='73900000-0000-4000-8000-000000000041';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'STAGE4_B_OWN_EDIT_ROWCOUNT_%', n; END IF;
 IF (SELECT notes FROM public.cases
    WHERE id='73900000-0000-4000-8000-000000000041') IS DISTINCT FROM 'STAGE4_B_OWN_EDIT'
 THEN RAISE EXCEPTION 'STAGE4_B_OWN_EDIT_READBACK_FAILED'; END IF;

 UPDATE public.cases SET notes='STAGE4_FORGED_A_EDIT'
 WHERE id='73900000-0000-4000-8000-000000000031';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'STAGE4_B_FOREIGN_CASE_EDITED'; END IF;
END $stage4_b$;
RESET ROLE;
-- Privileged observer checks both own edits persisted only inside the disposable transaction.
DO $stage4_final$
BEGIN
 IF (SELECT notes FROM public.cases WHERE id='73900000-0000-4000-8000-000000000031')
    IS DISTINCT FROM 'STAGE4_A_OWN_EDIT'
 OR (SELECT notes FROM public.cases WHERE id='73900000-0000-4000-8000-000000000041')
    IS DISTINCT FROM 'STAGE4_B_OWN_EDIT'
 OR (SELECT patient_id FROM public.cases WHERE id='73900000-0000-4000-8000-000000000031')
    IS DISTINCT FROM '73900000-0000-4000-8000-000000000011'::uuid
 THEN RAISE EXCEPTION 'STAGE4_CASE_ISOLATION_FINAL_FAILED'; END IF;
END $stage4_final$;
-- Assert both synthetic metadata records survived forged deletes by opposite roles.
DO $stage4_attach_final$
BEGIN
 IF (SELECT count(*) FROM public.case_attachments
     WHERE id IN ('73900000-0000-4000-8000-000000000051',
                  '73900000-0000-4000-8000-000000000052'))<>2
 THEN RAISE EXCEPTION 'STAGE4_FOREIGN_ATTACHMENT_NOT_PRESERVED'; END IF;
END $stage4_attach_final$;
SELECT 'STAGING_FIXTURE_VERIFIED:2_companies_2_SQL_roles_4_patients_4_cases_0_real_clients' AS sanitized_journal;
SELECT 'BETA_STAGE4_CASE_CROSS_TENANT_DENIED_2_OWN_EDITS' AS sanitized_case_result;
SELECT 'BETA_STAGE4_ATTACHMENT_METADATA_ISOLATED_2_OWN_VISIBLE_0_FOREIGN_DELETED' AS sanitized_attachment_result;
ROLLBACK;

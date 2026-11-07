-- DISPOSABLE RESTORE DATABASE ONLY. These JWT settings are SQL simulations,
-- not real Auth/MFA evidence. All users, companies and records roll back.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
VALUES
 ('72200000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','read-a@example.invalid','',now(),now()),
 ('72200000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','read-b@example.invalid','',now(),now()),
 ('72200000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','read-cad@example.invalid','',now(),now());
INSERT INTO public.clinics(id,name,owner_id,billing_exempt) VALUES
 ('72200000-0000-4000-8000-000000000010','Read privacy A','72200000-0000-4000-8000-000000000001',false),
 ('72200000-0000-4000-8000-000000000020','Read privacy B','72200000-0000-4000-8000-000000000002',false);
-- Trusted setup in this disposable transaction normalizes the profiles created
-- by the Auth insert trigger. Restore the escalation guard before any RLS test;
-- no application or policy is evaluated while it is disabled.
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privilege_escalation;
INSERT INTO public.profiles(id,clinic_id,role,account_subtype,is_default_admin) VALUES
 ('72200000-0000-4000-8000-000000000001','72200000-0000-4000-8000-000000000010','USER','USER',false),
 ('72200000-0000-4000-8000-000000000002','72200000-0000-4000-8000-000000000020','USER','USER',false),
 ('72200000-0000-4000-8000-000000000003','72200000-0000-4000-8000-000000000010','CADISTA','CADISTA',false)
ON CONFLICT(id) DO UPDATE SET clinic_id=excluded.clinic_id,role=excluded.role,
  account_subtype=excluded.account_subtype,is_default_admin=false;
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privilege_escalation;
INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES
 ('72200000-0000-4000-8000-000000000010','72200000-0000-4000-8000-000000000001','USER','active'),
 ('72200000-0000-4000-8000-000000000020','72200000-0000-4000-8000-000000000002','USER','active'),
 ('72200000-0000-4000-8000-000000000010','72200000-0000-4000-8000-000000000003','CADISTA','active');
-- A legacy global staff role must still respect the company boundary.
INSERT INTO public.user_roles(user_id,role) VALUES ('72200000-0000-4000-8000-000000000002','admin');
INSERT INTO public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,provider_environment)
VALUES ('company','72200000-0000-4000-8000-000000000010','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox'),
 ('company','72200000-0000-4000-8000-000000000020','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox');
INSERT INTO public.patients(id,name,clinic_id) VALUES
 ('72200000-0000-4000-8000-000000000011','Disposable patient A','72200000-0000-4000-8000-000000000010'),
 ('72200000-0000-4000-8000-000000000021','Disposable patient B','72200000-0000-4000-8000-000000000020');
INSERT INTO public.cadistas(id,name,user_id)
SELECT '72200000-0000-4000-8000-000000000004','Disposable CAD','72200000-0000-4000-8000-000000000003'
WHERE NOT EXISTS (SELECT 1 FROM public.cadistas WHERE user_id='72200000-0000-4000-8000-000000000003');
INSERT INTO public.cases(id,patient_id,requested_by,cadista_id,delivery_date,status,created_at) VALUES
 ('72200000-0000-4000-8000-000000000012','72200000-0000-4000-8000-000000000011','72200000-0000-4000-8000-000000000001',
  (SELECT id FROM public.cadistas WHERE user_id='72200000-0000-4000-8000-000000000003'),current_date+7,'em_andamento',now()-interval '2 days'),
 ('72200000-0000-4000-8000-000000000022','72200000-0000-4000-8000-000000000021','72200000-0000-4000-8000-000000000002',null,current_date+7,'em_andamento',now());
-- A dedicated non-notifying kind exercises the same row policies without chat delivery.
INSERT INTO public.case_activity(id,case_id,user_id,kind,content,created_at) VALUES
 ('72200000-0000-4000-8000-000000000013','72200000-0000-4000-8000-000000000012','72200000-0000-4000-8000-000000000001','qa_read_boundary','old',now()-interval '1 day'),
 ('72200000-0000-4000-8000-000000000014','72200000-0000-4000-8000-000000000012','72200000-0000-4000-8000-000000000001','qa_read_boundary','current',now()+interval '1 second'),
 ('72200000-0000-4000-8000-000000000023','72200000-0000-4000-8000-000000000022','72200000-0000-4000-8000-000000000002','qa_read_boundary','other',now());
-- The case existed before assignment; metadata records the current CAD join.
INSERT INTO public.case_activity(id,case_id,user_id,kind,metadata,created_at) VALUES
 ('72200000-0000-4000-8000-000000000017','72200000-0000-4000-8000-000000000012','72200000-0000-4000-8000-000000000001',
  'case_edit',jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('field','cadista_id','to',
    (SELECT id::text FROM public.cadistas WHERE user_id='72200000-0000-4000-8000-000000000003')))),now());
INSERT INTO public.case_activity_reads(id,activity_id,user_id) VALUES
 ('72200000-0000-4000-8000-000000000015','72200000-0000-4000-8000-000000000013','72200000-0000-4000-8000-000000000001'),
 ('72200000-0000-4000-8000-000000000016','72200000-0000-4000-8000-000000000014','72200000-0000-4000-8000-000000000001'),
 ('72200000-0000-4000-8000-000000000024','72200000-0000-4000-8000-000000000023','72200000-0000-4000-8000-000000000002');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72200000-0000-4000-8000-000000000002"}',true);
SELECT set_config('request.jwt.claim.sub','72200000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE refused boolean; n bigint; BEGIN
  IF NOT public.can_access_case('72200000-0000-4000-8000-000000000022')
    OR public.can_access_case('72200000-0000-4000-8000-000000000012') THEN
    RAISE EXCEPTION 'INVALID_FOREIGN_STAFF_REHEARSAL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.case_activity_reads WHERE activity_id IN
    ('72200000-0000-4000-8000-000000000013','72200000-0000-4000-8000-000000000014')) THEN
    RAISE EXCEPTION 'FOREIGN_ACTIVITY_READS_EXPOSED';
  END IF;
  refused:=false;
  BEGIN
    INSERT INTO public.case_activity_reads(activity_id,user_id) VALUES
      ('72200000-0000-4000-8000-000000000014',auth.uid());
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'INVISIBLE_ACTIVITY_RECEIPT_INSERTED'; END IF;
  UPDATE public.case_activity_reads SET created_at=now() WHERE id='72200000-0000-4000-8000-000000000016';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'FOREIGN_RECEIPT_UPDATED'; END IF;
  DELETE FROM public.case_activity_reads WHERE id='72200000-0000-4000-8000-000000000016';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'FOREIGN_RECEIPT_DELETED'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72200000-0000-4000-8000-000000000003"}',true);
SELECT set_config('request.jwt.claim.sub','72200000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE refused boolean; BEGIN
  IF EXISTS (SELECT 1 FROM public.case_activity_reads WHERE id='72200000-0000-4000-8000-000000000015')
    OR NOT EXISTS (SELECT 1 FROM public.case_activity_reads WHERE id='72200000-0000-4000-8000-000000000016') THEN
    RAISE EXCEPTION 'CAD_ASSIGNMENT_INTERVAL_NOT_INHERITED';
  END IF;
  INSERT INTO public.case_activity_reads(activity_id,user_id) VALUES
    ('72200000-0000-4000-8000-000000000014',auth.uid());
  refused:=false;
  BEGIN INSERT INTO public.case_activity_reads(activity_id,user_id) VALUES
    ('72200000-0000-4000-8000-000000000013',auth.uid());
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'CAD_MARKED_PRE_ASSIGNMENT_ACTIVITY'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM public.case_activity_reads) THEN
      RAISE EXCEPTION 'ANONYMOUS_READ_RECEIPTS_EXPOSED';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72200000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72200000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE refused boolean; BEGIN
  IF (SELECT count(*) FROM public.case_activity_reads WHERE activity_id='72200000-0000-4000-8000-000000000014')<>2 THEN
    RAISE EXCEPTION 'AUTHORIZED_OTHER_READER_HIDDEN';
  END IF;
  INSERT INTO public.case_activity_reads(activity_id,user_id,created_at) VALUES
    ('72200000-0000-4000-8000-000000000014',auth.uid(),now()+interval '2 seconds')
    ON CONFLICT(activity_id,user_id) DO UPDATE SET created_at=excluded.created_at;
  refused:=false;
  BEGIN UPDATE public.case_activity_reads SET user_id='72200000-0000-4000-8000-000000000002'
    WHERE id='72200000-0000-4000-8000-000000000016';
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'RECEIPT_REASSIGNED_TO_ANOTHER_USER'; END IF;
  refused:=false;
  BEGIN UPDATE public.case_activity_reads SET activity_id='72200000-0000-4000-8000-000000000023'
    WHERE id='72200000-0000-4000-8000-000000000016';
  EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'RECEIPT_MOVED_TO_INVISIBLE_ACTIVITY'; END IF;
END $$;
RESET ROLE;

-- Revoking operational access hides existing markers but preserves their history.
SELECT set_config('request.jwt.claims','{}',true);
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.account_subscriptions SET status='suspended' WHERE clinic_id='72200000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72200000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72200000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.case_activity_reads WHERE activity_id='72200000-0000-4000-8000-000000000014') THEN
    RAISE EXCEPTION 'REVOKED_ACTIVITY_READS_STILL_VISIBLE';
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.case_activity_reads WHERE activity_id IN
    ('72200000-0000-4000-8000-000000000013','72200000-0000-4000-8000-000000000014','72200000-0000-4000-8000-000000000023'))<>4 THEN
    RAISE EXCEPTION 'READ_HISTORY_WAS_LOST';
  END IF;
END $$;
SELECT 'passed' AS stage_07_activity_read_rehearsal;
ROLLBACK;

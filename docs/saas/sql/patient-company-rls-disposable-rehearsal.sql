-- Disposable restore database ONLY: two real PostgreSQL 'authenticated' roles
-- with synthetic JWT contexts. No real Auth sessions, patients, payments or
-- provider calls. All fixture writes ROLLBACK even after successful checks.
BEGIN;
SET LOCAL statement_timeout='25s';

INSERT INTO auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
VALUES
 ('72600000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','patient-rls-a@example.invalid','',now(),now()),
 ('72600000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','patient-rls-b@example.invalid','',now(),now());

INSERT INTO public.clinics (id,name,owner_id)
VALUES
 ('72600000-0000-4000-8000-000000000010','Temporary patient boundary A','72600000-0000-4000-8000-000000000001'),
 ('72600000-0000-4000-8000-000000000020','Temporary patient boundary B','72600000-0000-4000-8000-000000000002');
INSERT INTO public.clinic_members (clinic_id,user_id,role,status)
VALUES
 ('72600000-0000-4000-8000-000000000010','72600000-0000-4000-8000-000000000001','CEO','active'),
 ('72600000-0000-4000-8000-000000000020','72600000-0000-4000-8000-000000000002','CEO','active');
INSERT INTO public.profiles (id,clinic_id,role,account_subtype,is_default_admin)
VALUES
 ('72600000-0000-4000-8000-000000000001','72600000-0000-4000-8000-000000000010','CEO','CEO',false),
 ('72600000-0000-4000-8000-000000000002','72600000-0000-4000-8000-000000000020','CEO','CEO',false)
ON CONFLICT (id) DO UPDATE SET clinic_id=excluded.clinic_id,
 role=excluded.role, account_subtype=excluded.account_subtype;
INSERT INTO public.account_subscriptions
 (scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,
  billing_provider,provider_environment)
VALUES
 ('company','72600000-0000-4000-8000-000000000010','company_initial','active',1,now(),now()+interval '1 month','asaas','sandbox'),
 ('company','72600000-0000-4000-8000-000000000020','company_initial','active',1,now(),now()+interval '1 month','asaas','sandbox');

-- Positive-control rows, created as restore operator not as either tenant.
INSERT INTO public.patients (id,name,clinic_id)
VALUES
 ('72600000-0000-4000-8000-000000000011','Synthetic RLS control A','72600000-0000-4000-8000-000000000010'),
 ('72600000-0000-4000-8000-000000000021','Synthetic RLS control B','72600000-0000-4000-8000-000000000020');

-- The test must not pass vacuously: two patients must really exist.
DO $$ BEGIN
 IF (SELECT count(*) FROM public.patients WHERE id IN (
  '72600000-0000-4000-8000-000000000011',
  '72600000-0000-4000-8000-000000000021'
 ))<>2 THEN RAISE EXCEPTION 'QA_PATIENT_CONTROLS_MISSING'; END IF;
END $$;

-- Acting as *database* authenticated users (not forged live JWT sessions).
SELECT set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"72600000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72600000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE own uuid:='72600000-0000-4000-8000-000000000011';
 other uuid:='72600000-0000-4000-8000-000000000021';
 my_company uuid:='72600000-0000-4000-8000-000000000010';
 foreign_company uuid:='72600000-0000-4000-8000-000000000020';
 n bigint; blocked boolean;
BEGIN
 IF (SELECT count(*) FROM public.patients WHERE id=own)<>1
   OR (SELECT clinic_id FROM public.patients WHERE id=own)<>my_company
   OR NOT public.can_access_patient(own) THEN
  RAISE EXCEPTION 'ACTOR_A_OWN_POSITIVE_CONTROL_FAILED';
 END IF;
 IF EXISTS(SELECT 1 FROM public.patients WHERE id=other)
   OR public.can_access_patient(other) THEN
  RAISE EXCEPTION 'ACTOR_A_FOREIGN_READ_LEAK';
 END IF;
 UPDATE public.patients SET name='Not allowed B update' WHERE id=other;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'ACTOR_A_FOREIGN_UPDATE_LEAK'; END IF;
 DELETE FROM public.patients WHERE id=other;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'ACTOR_A_FOREIGN_DELETE_LEAK'; END IF;

 -- A client-supplied foreign company must be rejected.
 blocked:=false;
 BEGIN
  INSERT INTO public.patients(id,name,clinic_id) VALUES
   ('72600000-0000-4000-8000-000000000013','Forged company',
    foreign_company);
 EXCEPTION WHEN OTHERS THEN
  blocked:=SQLERRM LIKE '%COMPANY%' OR SQLERRM LIKE '%clinic%';
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'ACTOR_A_FOREIGN_INSERT_NOT_REJECTED'; END IF;

 -- Missing explicit company must *resolve* to the current company, never NULL.
 INSERT INTO public.patients(id,name,clinic_id) VALUES
 ('72600000-0000-4000-8000-000000000014','No company provided',NULL);
 IF (SELECT clinic_id FROM public.patients
     WHERE id='72600000-0000-4000-8000-000000000014') IS DISTINCT FROM my_company THEN
  RAISE EXCEPTION 'ACTOR_A_ORPHAN_INSERTED';
 END IF;
 blocked:=false;
 BEGIN UPDATE public.patients SET clinic_id=foreign_company WHERE id=own;
 EXCEPTION WHEN OTHERS THEN blocked:=SQLERRM LIKE '%COMPANY%' OR SQLERRM LIKE '%clinic%'; END;
 IF NOT blocked THEN RAISE EXCEPTION 'ACTOR_A_COMPANY_MUTATED'; END IF;

 -- Idempotent RPC must reject a forged target company even if caller is CEO.
 blocked:=false;
 BEGIN
  PERFORM public.create_patient_idempotent_v1(
    '72600000-0000-4000-8000-000000000051',
    '72600000-0000-4000-8000-000000000052',
    jsonb_build_object('name','RPC foreign fixture','clinic_id',foreign_company));
 EXCEPTION WHEN OTHERS THEN blocked:=SQLERRM LIKE '%CREATION_INVALID%'
                             OR SQLERRM LIKE '%CREATION_FORBIDDEN%'; END;
 IF NOT blocked THEN RAISE EXCEPTION 'ACTOR_A_RPC_COMPANY_FORGED'; END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"72600000-0000-4000-8000-000000000002"}',true);
SELECT set_config('request.jwt.claim.sub','72600000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE own uuid:='72600000-0000-4000-8000-000000000021';
 other uuid:='72600000-0000-4000-8000-000000000011';
 my_company uuid:='72600000-0000-4000-8000-000000000020';
 n bigint;
BEGIN
 IF (SELECT count(*) FROM public.patients WHERE id=own)<>1
   OR (SELECT clinic_id FROM public.patients WHERE id=own)<>my_company
   OR NOT public.can_access_patient(own) THEN
  RAISE EXCEPTION 'ACTOR_B_OWN_POSITIVE_CONTROL_FAILED';
 END IF;
 IF EXISTS(SELECT 1 FROM public.patients WHERE id=other)
   OR public.can_access_patient(other) THEN
  RAISE EXCEPTION 'ACTOR_B_FOREIGN_READ_LEAK';
 END IF;
 UPDATE public.patients SET name='Not allowed A update' WHERE id=other;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'ACTOR_B_FOREIGN_UPDATE_LEAK'; END IF;
 DELETE FROM public.patients WHERE id=other;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'ACTOR_B_FOREIGN_DELETE_LEAK'; END IF;
END $$;
RESET ROLE;

-- No fixture is persisted, and no Production/Asaas/Storage service is used.
SELECT 'pass: two-tenant real-role positive/negative RLS, guarded insert and RPC (disposable SQL only)' AS result;
ROLLBACK;

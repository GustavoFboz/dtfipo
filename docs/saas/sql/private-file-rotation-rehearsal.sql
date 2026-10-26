-- DISPOSABLE CI DATABASE ONLY. Synthetic SQL identities; never real MFA proof.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) VALUES
 ('72800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','file-rotation-a@example.invalid','',now(),now()),
 ('72800000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','file-rotation-b@example.invalid','',now(),now()),
 ('72800000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','file-rotation-user@example.invalid','',now(),now());
INSERT INTO public.clinics(id,name,owner_id,billing_exempt) VALUES
 ('72800000-0000-4000-8000-000000000010','Creation A','72800000-0000-4000-8000-000000000001',false),
 ('72800000-0000-4000-8000-000000000020','Creation B','72800000-0000-4000-8000-000000000002',false);
INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES
 ('72800000-0000-4000-8000-000000000010','72800000-0000-4000-8000-000000000001','CEO','active'),
 ('72800000-0000-4000-8000-000000000020','72800000-0000-4000-8000-000000000002','CEO','active'),
 ('72800000-0000-4000-8000-000000000010','72800000-0000-4000-8000-000000000003','USER','active');
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privilege_escalation;
UPDATE public.profiles SET clinic_id=CASE WHEN id='72800000-0000-4000-8000-000000000002' THEN '72800000-0000-4000-8000-000000000020'::uuid ELSE '72800000-0000-4000-8000-000000000010'::uuid END,
 role=CASE WHEN id='72800000-0000-4000-8000-000000000003' THEN 'USER' ELSE 'CEO' END,
 account_subtype=CASE WHEN id='72800000-0000-4000-8000-000000000003' THEN 'USER' ELSE 'CEO' END,is_default_admin=false
 WHERE id IN ('72800000-0000-4000-8000-000000000001','72800000-0000-4000-8000-000000000002','72800000-0000-4000-8000-000000000003');
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privilege_escalation;
INSERT INTO public.user_roles(user_id,role) VALUES ('72800000-0000-4000-8000-000000000001','admin'),('72800000-0000-4000-8000-000000000002','admin') ON CONFLICT DO NOTHING;
INSERT INTO public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,provider_environment)
VALUES ('company','72800000-0000-4000-8000-000000000010','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox'),
 ('company','72800000-0000-4000-8000-000000000020','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox');

-- SQL identities, storage metadata and URL status below are synthetic CI guards.
-- They do not substitute the published Storage/API migration acceptance.
INSERT INTO public.patients(id,clinic_id,name,photo_url) VALUES
 ('72800000-0000-4000-8000-000000000041','72800000-0000-4000-8000-000000000010','Rotation patient',
 'https://fixture.invalid/storage/v1/object/sign/patient-photos/72800000-0000-4000-8000-000000000041/old.png?token=fixture');
UPDATE public.profiles SET avatar_url='https://fixture.invalid/storage/v1/object/sign/avatars/72800000-0000-4000-8000-000000000001/old.png?token=fixture'
 WHERE id='72800000-0000-4000-8000-000000000001';
INSERT INTO storage.buckets(id,name,public) VALUES('avatars','avatars',false),('patient-photos','patient-photos',false) ON CONFLICT DO NOTHING;
INSERT INTO public.storage_files(id,clinic_id,bucket,object_path,source_type,source_id,original_name,size_bytes,status,uploaded_by)
SELECT ('72800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'72800000-0000-4000-8000-000000000010',bucket,subject||'/old.png',kind,subject,'old.png',3,'ready','72800000-0000-4000-8000-000000000001'
 FROM (VALUES (61,'avatars','72800000-0000-4000-8000-000000000001','user_avatar'),
 (62,'patient-photos','72800000-0000-4000-8000-000000000041','patient_photo')) v(n,bucket,subject,kind);
INSERT INTO storage.objects(bucket_id,name,metadata,owner_id)
SELECT bucket,subject||'/'||file,'{"size":3,"mimetype":"image/png"}','72800000-0000-4000-8000-000000000001'
 FROM (VALUES('avatars','72800000-0000-4000-8000-000000000001'),('patient-photos','72800000-0000-4000-8000-000000000041')) t(bucket,subject)
 CROSS JOIN (VALUES('old.png'),('new.png')) p(file);
INSERT INTO public.private_file_rotation_jobs(id,token_hash,expires_at,authorization_note)
 VALUES('72800000-0000-4000-8000-000000000070',repeat('a',64),now()+interval '5 minutes','Isolated SQL rotation rehearsal only');
INSERT INTO public.private_file_rotation_targets(id,job_id,bucket,subject_id,old_path,new_path,old_reference,old_signed_url,storage_file_id,size_bytes)
SELECT ('72800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'72800000-0000-4000-8000-000000000070',bucket,subject::uuid,
 subject||'/old.png',subject||'/new.png',url,url,('72800000-0000-4000-8000-'||lpad((n-10)::text,12,'0'))::uuid,3
 FROM (VALUES(71,'avatars','72800000-0000-4000-8000-000000000001'),(72,'patient-photos','72800000-0000-4000-8000-000000000041')) t(n,bucket,subject)
 CROSS JOIN LATERAL(SELECT 'https://fixture.invalid/storage/v1/object/sign/'||bucket||'/'||subject||'/old.png?token=fixture' AS url) u;
CREATE TEMP TABLE rotation_before AS SELECT sum(size_bytes) AS bytes,count(*) AS n FROM public.storage_files WHERE clinic_id='72800000-0000-4000-8000-000000000010';
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.private_file_rotation_targets','SELECT')
  OR has_table_privilege('service_role','public.private_file_rotation_targets','UPDATE')
  OR has_function_privilege('authenticated','public.activate_private_file_rotation(uuid,uuid,uuid,text,bigint)','EXECUTE')
  OR has_function_privilege('anon','public.resolve_rotated_private_file(text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.prepare_fixture_private_file_rotation(uuid,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'ROTATION_PRIVATE_BOUNDARY_REOPENED'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE j jsonb; BEGIN
 BEGIN
  PERFORM public.claim_private_file_rotation('72800000-0000-4000-8000-000000000070',repeat('b',64)); RAISE EXCEPTION 'BAD_CAP_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 j:=public.claim_private_file_rotation('72800000-0000-4000-8000-000000000070',repeat('a',64));
 PERFORM set_config('test.rotation_lease',j->>'lease_token',true);
 IF jsonb_array_length(j->'targets')<>2 THEN RAISE EXCEPTION 'SCOPE_LOST'; END IF;
 BEGIN
  PERFORM public.claim_private_file_rotation('72800000-0000-4000-8000-000000000070',repeat('a',64)); RAISE EXCEPTION 'CAP_REUSED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.activate_private_file_rotation('72800000-0000-4000-8000-000000000070',gen_random_uuid(),'72800000-0000-4000-8000-000000000071',repeat('c',64),3);
  RAISE EXCEPTION 'WRONG_LEASE_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PRIVATE_ROTATION_LEASE_LOST' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.activate_private_file_rotation('72800000-0000-4000-8000-000000000070',(j->>'lease_token')::uuid,'72800000-0000-4000-8000-000000000071',repeat('c',64),4);
  RAISE EXCEPTION 'WRONG_SIZE_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PRIVATE_ROTATION_PROOF_INVALID' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
-- An absent copied object cannot authorize a reference switch.
DELETE FROM storage.objects WHERE bucket_id='avatars' AND name='72800000-0000-4000-8000-000000000001/new.png';
SET LOCAL ROLE service_role;
DO $$ BEGIN
 BEGIN
  PERFORM public.activate_private_file_rotation('72800000-0000-4000-8000-000000000070',current_setting('test.rotation_lease')::uuid,'72800000-0000-4000-8000-000000000071',repeat('c',64),3);
  RAISE EXCEPTION 'MISSING_COPY_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PRIVATE_ROTATION_REFERENCE_CHANGED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,metadata,owner_id) VALUES('avatars','72800000-0000-4000-8000-000000000001/new.png','{"size":3}','72800000-0000-4000-8000-000000000001');
SET LOCAL ROLE service_role;
SELECT public.activate_private_file_rotation('72800000-0000-4000-8000-000000000070',current_setting('test.rotation_lease')::uuid,id,repeat('c',64),3)
 FROM public.private_file_rotation_targets WHERE job_id='72800000-0000-4000-8000-000000000070';
DO $$ BEGIN
 BEGIN
  PERFORM public.verify_private_file_rotation('72800000-0000-4000-8000-000000000070',current_setting('test.rotation_lease')::uuid,'72800000-0000-4000-8000-000000000071',repeat('c',64),404);
  RAISE EXCEPTION 'EXISTING_ORIGINAL_MARKED_REVOKED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PRIVATE_ROTATION_REVOCATION_UNCONFIRMED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72800000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72800000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb; BEGIN
 a:=public.resolve_rotated_private_file('patient-photos','72800000-0000-4000-8000-000000000041/old.png');
 IF a->>'path' IS DISTINCT FROM '72800000-0000-4000-8000-000000000041/new.png' THEN RAISE EXCEPTION 'OWNER_ALIAS_MISSING'; END IF;
 a:=public.resolve_rotated_private_file('avatars','72800000-0000-4000-8000-000000000001/old.png');
 IF a->>'path' IS DISTINCT FROM '72800000-0000-4000-8000-000000000001/new.png'
  OR NOT public.private_file_path_is_retired('avatars','72800000-0000-4000-8000-000000000001/old.png') THEN RAISE EXCEPTION 'AVATAR_ALIAS_OR_RETIREMENT_MISSING'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72800000-0000-4000-8000-000000000002"}',true);
SELECT set_config('request.jwt.claim.sub','72800000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.resolve_rotated_private_file('patient-photos','72800000-0000-4000-8000-000000000041/old.png') IS NOT NULL
  OR public.resolve_rotated_private_file('avatars','72800000-0000-4000-8000-000000000001/old.png') IS NOT NULL
 THEN RAISE EXCEPTION 'FOREIGN_ALIAS_EXPOSED'; END IF;
END $$;
RESET ROLE;
DELETE FROM storage.objects WHERE name IN('72800000-0000-4000-8000-000000000001/old.png','72800000-0000-4000-8000-000000000041/old.png');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72800000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72800000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE reserved jsonb; refused boolean:=false; BEGIN
 SELECT to_jsonb(r) INTO reserved FROM public.reserve_storage_upload(3,'avatars','72800000-0000-4000-8000-000000000001/old.png','user_avatar',null,null,'old.png','image/png') r;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,metadata,owner_id) VALUES('avatars','72800000-0000-4000-8000-000000000001/old.png','{"size":3}','72800000-0000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'RETIRED_PATH_RESURRECTED'; END IF;
 PERFORM public.cancel_storage_upload((reserved->>'file_id')::uuid);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT public.verify_private_file_rotation('72800000-0000-4000-8000-000000000070',current_setting('test.rotation_lease')::uuid,id,repeat('c',64),404)
 FROM public.private_file_rotation_targets WHERE job_id='72800000-0000-4000-8000-000000000070';
DO $$ DECLARE result jsonb; BEGIN
 result:=public.finish_private_file_rotation('72800000-0000-4000-8000-000000000070',current_setting('test.rotation_lease')::uuid);
 IF result->>'passed' IS DISTINCT FROM 'true' OR result->>'verified' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'ROTATION_NOT_COMPLETED'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT sum(size_bytes) FROM public.storage_files WHERE clinic_id='72800000-0000-4000-8000-000000000010')<>(SELECT bytes FROM rotation_before)
  OR (SELECT count(*) FROM public.storage_files WHERE clinic_id='72800000-0000-4000-8000-000000000010')<>(SELECT n FROM rotation_before)
 THEN RAISE EXCEPTION 'ROTATION_QUOTA_OR_IDS_CHANGED'; END IF;
END $$;
-- Audit/tombstones must not prevent later, legitimate managed-file deletion.
DELETE FROM public.storage_files WHERE id IN('72800000-0000-4000-8000-000000000061','72800000-0000-4000-8000-000000000062');
SELECT 'passed' AS private_file_rotation_rehearsal;
ROLLBACK;

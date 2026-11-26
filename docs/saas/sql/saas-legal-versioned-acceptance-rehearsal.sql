-- DISPOSABLE CI RESTORE ONLY. Tests software contract with fictitious approved
-- document/actors and ROLLBACK. Never authorizes or publishes a real document.
BEGIN;
SET LOCAL statement_timeout='25s';
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
VALUES
 ('74200000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','terms-qa-a@example.invalid','',now(),now()),
 ('74200000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','terms-qa-b@example.invalid','',now(),now()),
 ('74200000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','terms-qa-visitor@example.invalid','',now(),now());
INSERT INTO public.clinics(id,name,owner_id) VALUES
 ('74200000-0000-4000-8000-000000000010','Legal fixture company A','74200000-0000-4000-8000-000000000001'),
 ('74200000-0000-4000-8000-000000000020','Legal fixture company B','74200000-0000-4000-8000-000000000002');
INSERT INTO public.saas_legal_document_versions
 (id,document_kind,version_label,body_markdown,body_sha256,status,
  approved_by,approval_reference,approved_at,published_at)
SELECT '74200000-0000-4000-8000-000000000040','saas_terms','2026-11-02-v1',
 repeat('Synthetic fixture terms only, not legally operative. ',3),
 encode(sha256(convert_to(repeat('Synthetic fixture terms only, not legally operative. ',3),'UTF8')),'hex'),
 'published','74200000-0000-4000-8000-000000000003',
 'SANDBOX_TEST_ONLY_SIGNOFF_NOT_A_LEGAL_DOCUMENT',now(),now();
INSERT INTO public.saas_legal_document_versions
 (id,document_kind,version_label,body_markdown,body_sha256)
SELECT '74200000-0000-4000-8000-000000000041','privacy_notice','2026-11-02-v1',
 repeat('Synthetic private draft not approved for users. ',3),
 encode(sha256(convert_to(repeat('Synthetic private draft not approved for users. ',3),'UTF8')),'hex');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74200000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','74200000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE doc uuid:='74200000-0000-4000-8000-000000000040';
 draft uuid:='74200000-0000-4000-8000-000000000041';
 own uuid:='74200000-0000-4000-8000-000000000010';
 other uuid:='74200000-0000-4000-8000-000000000020';
 hash text; a jsonb; b jsonb; rejected boolean;
BEGIN
 IF (SELECT count(*) FROM public.saas_legal_document_versions)<>1 OR
   EXISTS(SELECT 1 FROM public.saas_legal_document_versions WHERE id=draft) THEN
   RAISE EXCEPTION 'UNAPPROVED_DRAFT_LEAK'; END IF;
 SELECT body_sha256 INTO hash FROM public.saas_legal_document_versions WHERE id=doc;
 a:=public.record_saas_legal_acceptance(doc,hash,own);
 b:=public.record_saas_legal_acceptance(doc,hash,own);
 IF a->>'receipt_id' IS NULL OR a->>'receipt_id'<>b->>'receipt_id' OR
    a->>'document_sha256'<>hash OR a->>'clinic_id'<>own::text THEN
   RAISE EXCEPTION 'LEGAL_ACCEPTANCE_IDEMPOTENCY_FAILED'; END IF;
 rejected:=false;
 BEGIN PERFORM public.record_saas_legal_acceptance(doc,hash,other);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_FOREIGN_COMPANY'; END IF;
 rejected:=false;
 BEGIN PERFORM public.record_saas_legal_acceptance(doc,repeat('a',64),own);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_STALE_CONTENT'; END IF;
 rejected:=false;
 BEGIN PERFORM public.record_saas_legal_acceptance(draft,repeat('0',64),own);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'LEGAL_ACCEPTANCE_UNAPPROVED_DRAFT'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.saas_legal_acceptance_receipts
  (document_version_id,actor_user_id,clinic_id,document_sha256)
  VALUES(doc,'74200000-0000-4000-8000-000000000003',own,hash);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'DIRECT_ACCEPTANCE_INSERT'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"74200000-0000-4000-8000-000000000003"}',true);
SELECT set_config('request.jwt.claim.sub','74200000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE rejected boolean:=false; h text; BEGIN
 SELECT body_sha256 INTO h FROM public.saas_legal_document_versions
 WHERE id='74200000-0000-4000-8000-000000000040';
 BEGIN PERFORM public.record_saas_legal_acceptance(
 '74200000-0000-4000-8000-000000000040',h,
 '74200000-0000-4000-8000-000000000010');
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'NON_OWNER_COULD_ACCEPT_FOR_COMPANY'; END IF;
END $$;
RESET ROLE;
DO $$
DECLARE refused boolean:=false; BEGIN
 IF (SELECT count(*) FROM public.saas_legal_acceptance_receipts)<>1 THEN
  RAISE EXCEPTION 'LEGAL_RECEIPT_COUNT_WRONG'; END IF;
 BEGIN UPDATE public.saas_legal_acceptance_receipts SET accepted_at=now();
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'LEGAL_RECEIPT_MUTABLE'; END IF;
 refused:=false;
 BEGIN DELETE FROM public.saas_legal_document_versions WHERE id='74200000-0000-4000-8000-000000000040';
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'LEGAL_PUBLISHED_VERSION_MUTABLE'; END IF;
END $$;
SELECT 'SAAS_VERSIONED_LEGAL_CONTRACT_PASSED:synthetic_2_clinics_1_receipt_0_real_docs' AS sanitized_journal;
ROLLBACK;

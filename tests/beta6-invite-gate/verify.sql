-- Runs after synthetic fixture + migration; transaction rolled back in disposable CI.
BEGIN;
SET LOCAL statement_timeout = '20s';
DO $$
DECLARE
 a uuid:='70000000-0000-4000-8000-000000000001';
 b uuid:='70000000-0000-4000-8000-000000000002';
 c uuid:='70000000-0000-4000-8000-000000000003';
 d uuid:='70000000-0000-4000-8000-000000000004';
 refused boolean;
 terms_digest text;
 dpa_digest text;
 prior_receipt jsonb;
BEGIN
 -- Default OFF must not break existing account creation or checkout.
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 INSERT INTO public.clinics(id,owner_id,name)
 VALUES('71000000-0000-4000-8000-000000000001',b,'existing behavior');
 INSERT INTO public.checkout_intents(id,user_id)
 VALUES('72000000-0000-4000-8000-000000000001',b);

 -- No untrusted clients can read or change invitation/policy tables.
 IF has_table_privilege('authenticated','public.beta_release_policy','SELECT')
 OR has_table_privilege('authenticated','public.beta_company_invites','SELECT')
 OR has_table_privilege('anon','public.beta_release_policy','SELECT') THEN
   RAISE EXCEPTION 'BETA_POLICY_GRANTS_LEAK'; END IF;

 INSERT INTO public.beta_company_invites(email_sha256) VALUES
 (encode(sha256(convert_to('allowed@example.invalid','UTF8')),'hex')),
 (encode(sha256(convert_to('notverified@example.invalid','UTF8')),'hex'));
 INSERT INTO public.beta_company_invites(email_sha256,expires_at) VALUES
 (encode(sha256(convert_to('expired@example.invalid','UTF8')),'hex'),now()-interval '1 day');
 UPDATE public.beta_release_policy SET company_invites_required=true;

 -- Bypassing the public UI to create an uninvited company must be rejected.
 refused:=false;
 BEGIN
  INSERT INTO public.clinics(id,owner_id,name)
   VALUES('71000000-0000-4000-8000-000000000002',b,'uninvited');
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_UNINVITED_CREATED_COMPANY'; END IF;

 -- An invited actor cannot fake a different owner_id.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 refused:=false;
 BEGIN
  INSERT INTO public.clinics(id,owner_id,name)
   VALUES('71000000-0000-4000-8000-000000000003',b,'spoof');
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_OWNER_SPOOF_ALLOWED'; END IF;

 -- Confirmed email + valid one-use invite succeeds exactly once.
 INSERT INTO public.clinics(id,owner_id,name)
 VALUES('71000000-0000-4000-8000-000000000004',a,'approved');
 IF NOT EXISTS(SELECT 1 FROM public.beta_company_invites WHERE
  redeemed_by=a AND redeemed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'BETA_INVITE_NOT_REDEEMED'; END IF;
 refused:=false;
 BEGIN
  INSERT INTO public.clinics(id,owner_id,name)
   VALUES('71000000-0000-4000-8000-000000000005',a,'second');
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_INVITE_REPLAY_ALLOWED'; END IF;

 PERFORM set_config('request.jwt.claim.sub',c::text,true);
 refused:=false;
 BEGIN
  INSERT INTO public.clinics(id,owner_id,name)
   VALUES('71000000-0000-4000-8000-000000000006',c,'unverified');
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_UNVERIFIED_INVITE_ALLOWED'; END IF;

 PERFORM set_config('request.jwt.claim.sub',d::text,true);
 refused:=false;
 BEGIN
  INSERT INTO public.clinics(id,owner_id,name)
   VALUES('71000000-0000-4000-8000-000000000007',d,'expired');
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_EXPIRED_INVITE_ALLOWED'; END IF;

 -- RPC privilege must never be available directly to authenticated/anon.
 IF has_function_privilege('authenticated','public.beta_assert_new_checkout_handoff_allowed()','EXECUTE')
 OR has_function_privilege('anon','public.beta_assert_new_checkout_handoff_allowed()','EXECUTE') THEN
   RAISE EXCEPTION 'BETA_HANDOFF_RPC_PUBLICLY_EXECUTABLE'; END IF;
 IF public.beta_assert_new_checkout_handoff_allowed() IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'BETA_HANDOFF_OPEN_DEFAULT_DENIED'; END IF;

 -- A pause stops NEW checkout intents but does not alter existing invoice rows.
 UPDATE public.beta_release_policy SET new_checkout_intents_paused=true;
 refused:=false;
 BEGIN
  PERFORM public.beta_assert_new_checkout_handoff_allowed();
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_ISSUED_INTENT_HANDOFF_ALLOWED_DURING_PAUSE'; END IF;
 refused:=false;
 BEGIN
  INSERT INTO public.checkout_intents(id,user_id)
   VALUES('72000000-0000-4000-8000-000000000002',a);
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_NEW_CHECKOUT_CREATED_DURING_PAUSE'; END IF;
 UPDATE public.checkout_intents SET status='paid'
 WHERE id='72000000-0000-4000-8000-000000000001';
 IF NOT EXISTS(SELECT 1 FROM public.checkout_intents
 WHERE id='72000000-0000-4000-8000-000000000001' AND status='paid') THEN
  RAISE EXCEPTION 'BETA_EXISTING_INTENT_UPDATE_BLOCKED'; END IF;
 UPDATE public.beta_release_policy SET new_checkout_intents_paused=false;
 IF public.beta_assert_new_checkout_handoff_allowed() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'BETA_HANDOFF_NOT_RESUMED'; END IF;
 INSERT INTO public.checkout_intents(id,user_id)
 VALUES('72000000-0000-4000-8000-000000000003',a);

 -- Legal receipts feature OFF by default. Does not query draft legal tables.
 IF EXISTS(SELECT 1 FROM public.beta_release_policy WHERE legal_acceptance_required) THEN
  RAISE EXCEPTION 'BETA_LEGAL_GATE_ACTIVATED_UNEXPECTEDLY'; END IF;
 IF has_function_privilege('anon','public.beta_assert_checkout_legal_accepted(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.beta_assert_checkout_legal_accepted(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'BETA_LEGAL_RPC_EXPOSED_PUBLICLY'; END IF;

 -- Link an issued checkout to the invited owner (no Asaas calls).
 INSERT INTO public.checkout_intents(id,user_id,clinic_id,status)
 VALUES('72000000-0000-4000-8000-000000000004',
   a,'71000000-0000-4000-8000-000000000004','pending');
 IF public.beta_assert_checkout_legal_accepted(
   '72000000-0000-4000-8000-000000000004',a) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'BETA_DORMANT_LEGAL_GATE_BLOCKED_EXISTING_CHECKOUT'; END IF;
 UPDATE public.beta_release_policy SET legal_acceptance_required=true;

 -- Without approved published documents and receipts, deny provider checkout.
 refused:=false;
 BEGIN
  PERFORM public.beta_assert_checkout_legal_accepted(
   '72000000-0000-4000-8000-000000000004',a);
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_LEGAL_NO_TERMS_ALLOWED'; END IF;

 terms_digest:=encode(sha256(convert_to(repeat('SYNTHETIC TERMS ',8),'UTF8')),'hex');
 dpa_digest:=encode(sha256(convert_to(repeat('SYNTHETIC DPA ',9),'UTF8')),'hex');
 INSERT INTO public.saas_legal_document_versions(
   id,document_kind,version_label,body_markdown,body_sha256,status,
   approval_reference,approved_by,approved_at,published_at)
 VALUES
 ('74000000-0000-4000-8000-000000000001','saas_terms','2026-11-11-v1',
  repeat('SYNTHETIC TERMS ',8),terms_digest,'published',
  'synthetic-approved-review-001',a,now()-interval '1 minute',now()),
 ('74000000-0000-4000-8000-000000000002','dpa','2026-11-11-v1',
  repeat('SYNTHETIC DPA ',9),dpa_digest,'published',
  'synthetic-approved-review-002',a,now()-interval '1 minute',now());

 -- The real acceptance RPC validates the logged-in company owner and hash.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 prior_receipt:=public.record_saas_legal_acceptance(
  '74000000-0000-4000-8000-000000000001',terms_digest,
  '71000000-0000-4000-8000-000000000004');
 IF prior_receipt->>'document_sha256' IS DISTINCT FROM terms_digest THEN
  RAISE EXCEPTION 'BETA_TERMS_RECEIPT_HASH_INVALID'; END IF;
 IF public.record_saas_legal_acceptance(
  '74000000-0000-4000-8000-000000000001',terms_digest,
  '71000000-0000-4000-8000-000000000004') IS DISTINCT FROM prior_receipt THEN
  RAISE EXCEPTION 'BETA_RECEIPT_DOUBLE_CLICK_NONIDEMPOTENT'; END IF;
 refused:=false;
 BEGIN
  PERFORM public.beta_assert_checkout_legal_accepted(
    '72000000-0000-4000-8000-000000000004',a);
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_TERMS_WITHOUT_DPA_ALLOWED'; END IF;

 PERFORM public.record_saas_legal_acceptance(
  '74000000-0000-4000-8000-000000000002',dpa_digest,
  '71000000-0000-4000-8000-000000000004');
 IF public.beta_assert_checkout_legal_accepted(
   '72000000-0000-4000-8000-000000000004',a) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'BETA_BOTH_RECEIPTS_BLOCKED'; END IF;

 -- A different user cannot reuse the owner's receipts, even with an intent ID.
 refused:=false;
 BEGIN
  PERFORM public.beta_assert_checkout_legal_accepted(
   '72000000-0000-4000-8000-000000000004',b);
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_CROSS_ACTOR_LEGAL_BYPASS'; END IF;
 refused:=false;
 BEGIN
  PERFORM public.record_saas_legal_acceptance(
   '74000000-0000-4000-8000-000000000002',dpa_digest,
   '71000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_CROSS_CLINIC_LEGAL_RECEIPT'; END IF;

 -- Publishing a newer version invalidates reliance on old-version receipts.
 INSERT INTO public.saas_legal_document_versions(
   id,document_kind,version_label,body_markdown,body_sha256,status,
   approval_reference,approved_by,approved_at,published_at)
 VALUES (
  '74000000-0000-4000-8000-000000000003','saas_terms','2026-11-11-v2',
  repeat('SYNTHETIC TERMS NEW ',7),
  encode(sha256(convert_to(repeat('SYNTHETIC TERMS NEW ',7),'UTF8')),'hex'),
  'published','synthetic-approved-review-003',a,now()-interval '10 seconds',now()+interval '1 second');
 -- Future published version does not apply yet.
 IF public.beta_assert_checkout_legal_accepted(
   '72000000-0000-4000-8000-000000000004',a) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'BETA_FUTURE_TERMS_INCORRECTLY_REQUIRED'; END IF;

 -- Published versions must be immutable, including service-role changes.
 refused:=false;
 BEGIN
  UPDATE public.saas_legal_document_versions SET version_label='2026-11-11-v99'
  WHERE id='74000000-0000-4000-8000-000000000003';
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_PUBLISHED_TERMS_MUTATED'; END IF;

 -- With an already-effective new version, a new receipt is required.
 INSERT INTO public.saas_legal_document_versions(
   id,document_kind,version_label,body_markdown,body_sha256,status,
   approval_reference,approved_by,approved_at,published_at)
 VALUES (
  '74000000-0000-4000-8000-000000000004','saas_terms','2026-11-11-v3',
  repeat('SYNTHETIC TERMS LATEST ',7),
  encode(sha256(convert_to(repeat('SYNTHETIC TERMS LATEST ',7),'UTF8')),'hex'),
  'published','synthetic-approved-review-004',a,now()-interval '10 seconds',now());
 refused:=false;
 BEGIN
  PERFORM public.beta_assert_checkout_legal_accepted(
    '72000000-0000-4000-8000-000000000004',a);
 EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'BETA_OLDER_TERMS_ACCEPTANCE_REUSED'; END IF;

 RAISE NOTICE 'BETA6_GATES_SYNTHETIC_PASSED:default_off_invite_pause_legal_receipts';

END $$;
ROLLBACK;

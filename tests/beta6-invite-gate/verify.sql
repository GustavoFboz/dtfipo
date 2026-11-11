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

 -- A pause stops NEW checkout intents but does not alter existing invoice rows.
 UPDATE public.beta_release_policy SET new_checkout_intents_paused=true;
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
 INSERT INTO public.checkout_intents(id,user_id)
 VALUES('72000000-0000-4000-8000-000000000003',a);

 RAISE NOTICE 'BETA6_GATES_SYNTHETIC_PASSED:default_off_invite_atomic_pause_insert_only';
END $$;
ROLLBACK;

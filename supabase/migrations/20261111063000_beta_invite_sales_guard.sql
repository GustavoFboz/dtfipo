-- DentalFlow beta 6/8: PREPARATION ONLY. Do not deploy/enable without staged review.
-- Both toggles DEFAULT OFF: preserve all existing production onboarding/checkout.
-- Backend enforcement (not UI): company invitation via confirmed e-mail allowlist.
-- Pause denies new checkout_intents INSERTs and server-side Asaas checkout handoff
-- including old intents once server guard is deployed. Already-issued Asaas
-- payment URLs can remain payable; pausing does not cancel provider invoices.
CREATE TABLE IF NOT EXISTS public.beta_release_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  company_invites_required boolean NOT NULL DEFAULT false,
  new_checkout_intents_paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.beta_release_policy(singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;
ALTER TABLE public.beta_release_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_release_policy FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.beta_release_policy TO service_role;

CREATE TABLE IF NOT EXISTS public.beta_company_invites (
  email_sha256 text PRIMARY KEY CHECK (email_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  redeemed_by uuid,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_invite_redemption_consistency
    CHECK ((redeemed_by IS NULL AND redeemed_at IS NULL) OR
           (redeemed_by IS NOT NULL AND redeemed_at IS NOT NULL))
);
ALTER TABLE public.beta_company_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_company_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_company_invites TO service_role;

-- Executed for ALL clinic INSERTs, including direct RPC requests. The caller
-- does not supply clinic identity/email or a trusted client-side flag.
CREATE OR REPLACE FUNCTION public.beta_guard_new_clinic_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_required boolean;
  v_actor uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
  v_hash text;
BEGIN
  SELECT company_invites_required INTO v_required
    FROM public.beta_release_policy WHERE singleton = true;
  IF v_required IS FALSE THEN RETURN NEW; END IF;
  -- Missing policy is a denial, not an open sign-up.
  IF v_actor IS NULL OR NEW.owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'BETA_COMPANY_INVITATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(email)), email_confirmed_at INTO v_email, v_verified
    FROM auth.users WHERE id = v_actor;
  IF v_email IS NULL OR v_verified IS NULL THEN
    RAISE EXCEPTION 'BETA_COMPANY_INVITATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');

  -- Atomic one-time redemption, reverted with clinic INSERT if anything fails.
  UPDATE public.beta_company_invites
     SET redeemed_by = v_actor, redeemed_at = now()
   WHERE email_sha256 = v_hash AND redeemed_by IS NULL
     AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BETA_COMPANY_INVITATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.beta_guard_new_clinic_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS beta_guard_new_clinic_insert ON public.clinics;
CREATE TRIGGER beta_guard_new_clinic_insert
BEFORE INSERT ON public.clinics FOR EACH ROW
EXECUTE FUNCTION public.beta_guard_new_clinic_insert();

-- The checkout server calls this RPC with service_role BEFORE any Asaas handoff
-- (including an already issued/pending checkout intent). Cannot be invoked by
-- public/anonymous clients. No change to webhooks, renewals or issued invoices.
CREATE OR REPLACE FUNCTION public.beta_assert_new_checkout_handoff_allowed()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $
DECLARE v_paused boolean;
BEGIN
  SELECT new_checkout_intents_paused INTO v_paused
    FROM public.beta_release_policy WHERE singleton = true;
  IF v_paused IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'BETA_NEW_CHECKOUTS_PAUSED' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END $;
REVOKE ALL ON FUNCTION public.beta_assert_new_checkout_handoff_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beta_assert_new_checkout_handoff_allowed() TO service_role;

-- Intercepts new checkout intent INSERTs even if client bypasses React.
-- Existing paid subscriptions, invoices, and UPDATE processing are untouched.
CREATE OR REPLACE FUNCTION public.beta_guard_checkout_intent_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_paused boolean;
BEGIN
  SELECT new_checkout_intents_paused INTO v_paused
    FROM public.beta_release_policy WHERE singleton = true;
  IF v_paused IS NOT FALSE THEN
    RAISE EXCEPTION 'BETA_NEW_CHECKOUTS_PAUSED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.beta_guard_checkout_intent_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS beta_guard_checkout_intent_insert ON public.checkout_intents;
CREATE TRIGGER beta_guard_checkout_intent_insert
BEFORE INSERT ON public.checkout_intents FOR EACH ROW
EXECUTE FUNCTION public.beta_guard_checkout_intent_insert();

COMMENT ON TABLE public.beta_release_policy IS
  'Beta-only preparation. OFF by default. Never implies legal, financial or deployment approval.';

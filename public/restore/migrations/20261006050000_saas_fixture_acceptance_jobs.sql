-- Private, one-use QA capabilities. No financial worker secret, Master identity,
-- arbitrary user selector, email delivery, or automatic jobs are introduced.
CREATE TABLE IF NOT EXISTS public.saas_fixture_acceptance_jobs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('identity','storage','billing')),
  token_hash text CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','running','completed','failed')),
  receipt jsonb,
  CHECK (expires_at <= created_at + interval '15 minutes'),
  CHECK ((status='prepared') = (token_hash IS NOT NULL))
);
ALTER TABLE public.saas_fixture_acceptance_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_fixture_acceptance_jobs FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.saas_claim_fixture_acceptance_job(p_job_id uuid, p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job public.saas_fixture_acceptance_jobs%ROWTYPE; v_fixtures jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'FIXTURE_JOB_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM public.saas_fixture_acceptance_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'prepared' OR v_job.token_hash IS DISTINCT FROM p_token_hash
     OR v_job.expires_at <= now() THEN
    RAISE EXCEPTION 'FIXTURE_JOB_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  -- These are the two previously authorized fixtures. Metadata alone never
  -- allows a client to nominate a real account or acquire an administrative role.
  SELECT jsonb_agg(jsonb_build_object('user_id',u.id,'email',u.email,'clinic_id',c.id) ORDER BY u.id)
    INTO v_fixtures
    FROM auth.users u JOIN public.profiles p ON p.id=u.id
    JOIN public.clinics c ON c.id=p.clinic_id AND c.owner_id=u.id
    WHERE (u.id,u.email,c.id) IN (
      ('ee083f63-1621-4b82-b7a4-fd13427c0b14'::uuid,
       'dentalflow-acceptance-20261004-e0537565-4015-4ffe-a249-5da489824e6e@example.invalid',
       '081d3db4-1606-40f7-a878-19b51556317d'::uuid),
      ('24e7cdf9-457e-4af2-b1cb-cf366abbddb0'::uuid,
       'dentalflow-acceptance-20261004-237e6ef4-9893-43d2-b9a3-311f8708aa3d@example.invalid',
       '3fc86c40-697e-4725-a9e9-633fc882aadc'::uuid))
    AND u.raw_user_meta_data->>'acceptance_fixture'='true'
    AND u.email_confirmed_at IS NOT NULL
    AND NOT COALESCE(c.billing_exempt,false)
    AND NOT EXISTS (SELECT 1 FROM public.platform_operators op WHERE op.user_id=u.id)
    AND NOT EXISTS (SELECT 1 FROM public.account_subscriptions s
                    WHERE s.clinic_id=c.id AND s.provider_environment='production');
  IF jsonb_array_length(COALESCE(v_fixtures,'[]'::jsonb)) <> 2 THEN
    RAISE EXCEPTION 'FIXTURE_ALLOWLIST_MISMATCH' USING ERRCODE = '42501';
  END IF;
  UPDATE public.saas_fixture_acceptance_jobs SET status='running',claimed_at=now(),token_hash=NULL
    WHERE id=p_job_id;
  RETURN jsonb_build_object('id',v_job.id,'kind',v_job.kind,'fixtures',v_fixtures);
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_finish_fixture_acceptance_job(p_job_id uuid, p_receipt jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR jsonb_typeof(p_receipt)<>'object'
     OR octet_length(p_receipt::text)>24000
     OR p_receipt->>'contract' IS DISTINCT FROM 'dentalflow-fixture-acceptance-v1'
     OR p_receipt::text ~* '(bearer |access_token|refresh_token|hashed_token|action_link|password|secret|signedurl|https?://)' THEN
    RAISE EXCEPTION 'FIXTURE_RECEIPT_INVALID' USING ERRCODE = '42501';
  END IF;
  UPDATE public.saas_fixture_acceptance_jobs SET completed_at=now(),token_hash=NULL,
    status=CASE WHEN p_receipt->>'passed'='true' THEN 'completed' ELSE 'failed' END,
    receipt=p_receipt WHERE id=p_job_id AND status='running';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_claim_fixture_acceptance_job(uuid,text),
  public.saas_finish_fixture_acceptance_job(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saas_claim_fixture_acceptance_job(uuid,text),
  public.saas_finish_fixture_acceptance_job(uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';

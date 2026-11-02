-- PROPOSED SaaS legal acceptance schema, TESTED IN DISPOSABLE RESTORE ONLY.
-- DO NOT APPLY TO PRODUCTION UNTIL COUNSEL APPROVES REAL DOCUMENTS AND MIGRATION.
-- No records are seeded, published, accepted or charged by this script.
CREATE TABLE IF NOT EXISTS public.saas_legal_document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_kind text NOT NULL CHECK(document_kind IN ('saas_terms','privacy_notice','dpa')),
 version_label text NOT NULL CHECK(version_label~'^[0-9]{4}-[0-9]{2}-[0-9]{2}-v[0-9]+$'),
 body_markdown text NOT NULL CHECK(length(body_markdown) BETWEEN 80 AND 60000),
 body_sha256 text NOT NULL CHECK(body_sha256~'^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 approval_reference text,
 approved_by uuid REFERENCES auth.users(id),
 approved_at timestamptz,
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT saas_legal_unique_version UNIQUE(document_kind,version_label),
 CONSTRAINT saas_legal_content_hash_match
  CHECK(body_sha256=encode(sha256(convert_to(body_markdown,'UTF8')),'hex')),
 CONSTRAINT saas_legal_publication_guard CHECK (
   status='draft' AND approval_reference IS NULL AND approved_by IS NULL
   AND approved_at IS NULL AND published_at IS NULL
   OR status='published' AND approval_reference IS NOT NULL AND length(btrim(approval_reference))>=16
   AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL
   AND published_at>=approved_at)
);
ALTER TABLE public.saas_legal_document_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_legal_document_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.saas_legal_document_versions TO authenticated;
CREATE POLICY saas_legal_only_published_to_authenticated
 ON public.saas_legal_document_versions FOR SELECT TO authenticated
 USING(status='published');

CREATE TABLE IF NOT EXISTS public.saas_legal_acceptance_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_version_id uuid NOT NULL REFERENCES public.saas_legal_document_versions(id),
 actor_user_id uuid NOT NULL REFERENCES auth.users(id),
 clinic_id uuid NOT NULL REFERENCES public.clinics(id),
 document_sha256 text NOT NULL CHECK(document_sha256~'^[a-f0-9]{64}$'),
 accepted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_version_id,actor_user_id,clinic_id)
);
ALTER TABLE public.saas_legal_acceptance_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_legal_acceptance_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Immutable issued versions and receipts, including when a privileged backend
-- would otherwise be allowed to edit rows. For corrections publish new version.
CREATE OR REPLACE FUNCTION public.saas_legal_forbid_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'SAAS_LEGAL_HISTORY_IMMUTABLE' USING ERRCODE='42501';
END $$;
DROP TRIGGER IF EXISTS trg_saas_legal_versions_immutable ON public.saas_legal_document_versions;
CREATE TRIGGER trg_saas_legal_versions_immutable
 BEFORE UPDATE OR DELETE ON public.saas_legal_document_versions
 FOR EACH ROW EXECUTE FUNCTION public.saas_legal_forbid_history_mutation();
DROP TRIGGER IF EXISTS trg_saas_legal_receipts_immutable ON public.saas_legal_acceptance_receipts;
CREATE TRIGGER trg_saas_legal_receipts_immutable
 BEFORE UPDATE OR DELETE ON public.saas_legal_acceptance_receipts
 FOR EACH ROW EXECUTE FUNCTION public.saas_legal_forbid_history_mutation();
REVOKE ALL ON FUNCTION public.saas_legal_forbid_history_mutation()
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_saas_legal_acceptance(
 p_document_version_id uuid, p_expected_sha256 text, p_clinic_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid; v_document public.saas_legal_document_versions%ROWTYPE;
 v_receipt public.saas_legal_acceptance_receipts%ROWTYPE;
BEGIN
 v_actor:=auth.uid();
 IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor IS NULL OR
    p_clinic_id IS NULL OR p_expected_sha256 IS NULL OR
    p_expected_sha256 !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'SAAS_LEGAL_ACCEPTANCE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- The actual legal representative must be owner of the selected clinic.
 -- Caller-provided clinic_id NEVER grants membership or authority.
 IF NOT EXISTS(SELECT 1 FROM public.clinics c
   WHERE c.id=p_clinic_id AND c.owner_id=v_actor) THEN
  RAISE EXCEPTION 'SAAS_LEGAL_ACCEPTANCE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_document FROM public.saas_legal_document_versions
 WHERE id=p_document_version_id AND status='published'
   AND body_sha256=p_expected_sha256 AND published_at<=now();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'SAAS_LEGAL_DOCUMENT_NOT_APPROVED' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.saas_legal_acceptance_receipts(
   document_version_id,actor_user_id,clinic_id,document_sha256)
 VALUES(v_document.id,v_actor,p_clinic_id,v_document.body_sha256)
 ON CONFLICT(document_version_id,actor_user_id,clinic_id) DO NOTHING;
 SELECT * INTO v_receipt FROM public.saas_legal_acceptance_receipts
 WHERE document_version_id=v_document.id AND actor_user_id=v_actor
   AND clinic_id=p_clinic_id;
 IF v_receipt.id IS NULL OR v_receipt.document_sha256<>v_document.body_sha256 THEN
  RAISE EXCEPTION 'SAAS_LEGAL_ACCEPTANCE_CONFLICT' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('receipt_id',v_receipt.id,'document_version_id',v_document.id,
    'document_sha256',v_receipt.document_sha256,'clinic_id',v_receipt.clinic_id,
    'actor_id',v_receipt.actor_user_id,'accepted_at',v_receipt.accepted_at);
END $$;
REVOKE ALL ON FUNCTION public.record_saas_legal_acceptance(uuid,text,uuid)
 FROM PUBLIC,anon,service_role,authenticated;
GRANT EXECUTE ON FUNCTION public.record_saas_legal_acceptance(uuid,text,uuid) TO authenticated;

-- RLS, triggers and function are a software contract; NO approved document has
-- been created by these DDL statements. No legal signoff has been assumed.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const schema=readFileSync('docs/saas/sql/saas-legal-versioned-acceptance-schema.sql','utf8');
const fixture=readFileSync('docs/saas/sql/saas-legal-versioned-acceptance-rehearsal.sql','utf8');
const workflow=readFileSync('.github/workflows/saas-restore-rehearsal.yml','utf8');
const client=readFileSync('src/lib/saas-legal-acceptance.ts','utf8');
test('legal schema exposes no automatic published docs or backfilled customer acceptance',()=>{
 assert.doesNotMatch(schema,/\bINSERT\s+INTO\b/i);
 assert.match(schema,/status text NOT NULL DEFAULT 'draft'/);
 assert.match(schema,/status='published' AND approval_reference IS NOT NULL/);
 assert.match(schema,/CHECK\(body_sha256=encode\(sha256\(convert_to\(body_markdown/);
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(schema,/GRANT SELECT ON public\.saas_legal_document_versions TO authenticated/);
 assert.match(schema,/GRANT EXECUTE ON FUNCTION public\.record_saas_legal_acceptance\(uuid,text,uuid\) TO authenticated/);
 assert.match(schema,/CREATE TRIGGER trg_saas_legal_receipts_immutable/);
});
test('owner-only app receipt uses auth claim and fails closed for cross-company and unapproved doc',()=>{
 assert.match(schema,/v_actor:=auth\.uid\(\)/);
 assert.match(schema,/c\.owner_id=v_actor/);
 assert.match(schema,/status='published'/);
 assert.match(schema,/body_sha256=p_expected_sha256/);
 assert.match(schema,/ON CONFLICT\(document_version_id,actor_user_id,clinic_id\) DO NOTHING/);
 assert.match(client,/VITE_SAAS_LEGAL_ACCEPTANCE_ENABLED==="true"/);
 assert.match(client,/SAAS_LEGAL_NOT_APPROVED_FOR_USE/);
});
test('synthetic legal fixture requires rollback, two different companies and no real legal publication',()=>{
 assert.match(fixture,/^BEGIN;/m);assert.match(fixture,/ROLLBACK;\s*$/);
 assert.match(fixture,/SANDBOX_TEST_ONLY_SIGNOFF_NOT_A_LEGAL_DOCUMENT/);
 assert.match(fixture,/LEGAL_ACCEPTANCE_FOREIGN_COMPANY/);
 assert.match(fixture,/LEGAL_ACCEPTANCE_STALE_CONTENT/);
 assert.match(fixture,/LEGAL_ACCEPTANCE_UNAPPROVED_DRAFT/);
 assert.match(fixture,/NON_OWNER_COULD_ACCEPT_FOR_COMPANY/);
 assert.match(fixture,/LEGAL_RECEIPT_MUTABLE/);
 assert.match(fixture,/SAAS_VERSIONED_LEGAL_CONTRACT_PASSED:synthetic_2_clinics_1_receipt_0_real_docs/);
 assert.match(workflow,/Install dormant legal acceptance contract in disposable restored DB/);
 assert.match(workflow,/Rehearse immutable, owner-only legal acceptance in disposable DB/);
});

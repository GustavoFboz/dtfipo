import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const s=readFileSync('docs/saas/sql/staging-63-fixture-journal.sql','utf8');
const w=readFileSync('.github/workflows/saas-restore-rehearsal.yml','utf8');
test('isolated staging journal never touches financial provider or persists fixtures',()=>{
  assert.match(s,/BEGIN;/);
  assert.match(s,/ROLLBACK;\s*$/);
  assert.match(s,/SET LOCAL statement_timeout = '25s'/);
  assert.match(s,/SET LOCAL ROLE authenticated/g);
  assert.match(s,/STAGING_FIXTURE_VERIFIED:2_companies_2_SQL_roles_4_patients_4_cases_0_real_clients/);
  assert.equal((s.match(/@example\.invalid/g)||[]).length,2);
  assert.doesNotMatch(s,/\b(http|curl|wget|dblink|COPY\s|CREATE\s+EXTENSION|TRUNCATE|DROP\s+TABLE)\b/i);
  assert.match(w,/Build 6\.3 disposable staging fixture and sanitized journal/);
  assert.match(w,/docs\/saas\/sql\/staging-63-fixture-journal\.sql/);
  assert.match(w,/grep -Fq "STAGING_FIXTURE_VERIFIED/);
});

test('beta step 4 proves authenticated own-case edits and denies cross-company mutations',()=>{
  assert.equal((s.match(/SET LOCAL ROLE authenticated;/g)||[]).length,2);
  assert.equal((s.match(/UPDATE public\.cases SET notes=/g)||[]).length,4);
  assert.match(s,/STAGE4_A_OWN_EDIT_ROWCOUNT_/);
  assert.match(s,/STAGE4_A_OWN_EDIT_READBACK_FAILED/);
  assert.match(s,/STAGE4_B_OWN_EDIT_ROWCOUNT_/);
  assert.match(s,/STAGE4_B_OWN_EDIT_READBACK_FAILED/);
  assert.match(s,/STAGE4_A_FOREIGN_CASE_EDITED/);
  assert.match(s,/STAGE4_B_FOREIGN_CASE_EDITED/);
  assert.match(s,/STAGE4_A_FOREIGN_PATIENT_RELINKED/);
  assert.match(s,/STAGE4_CASE_ISOLATION_FINAL_FAILED/);
  assert.match(s,/BETA_STAGE4_CASE_CROSS_TENANT_DENIED_2_OWN_EDITS/);
  assert.match(s,/ROLLBACK;\s*$/);
});

test('beta step 4 denies cross-company attachment metadata reads and deletes',()=>{
  assert.match(s,/INSERT INTO public\.case_attachments/);
  assert.match(s,/STAGE4_A_ATTACHMENT_READ_BOUNDARY_FAILED/);
  assert.match(s,/STAGE4_B_ATTACHMENT_READ_BOUNDARY_FAILED/);
  assert.match(s,/STAGE4_A_FOREIGN_ATTACHMENT_DELETED/);
  assert.match(s,/STAGE4_B_FOREIGN_ATTACHMENT_DELETED/);
  assert.match(s,/STAGE4_FOREIGN_ATTACHMENT_NOT_PRESERVED/);
  assert.match(s,/BETA_STAGE4_ATTACHMENT_METADATA_ISOLATED_2_OWN_VISIBLE_0_FOREIGN_DELETED/);
  // Only two exact-UUID foreign-delete attempts; all SQL is rolled back.
  const deletes = s.match(/\bDELETE\s+FROM\s+[^;]+;/gi) || [];
  assert.equal(deletes.length,2);
  for(const item of deletes)
    assert.match(item,/^DELETE FROM public\.case_attachments WHERE id='73900000-0000-4000-8000-00000000005[12]';$/);
  assert.notEqual(deletes[0],deletes[1]);
  assert.match(s,/ROLLBACK;\s*$/);
});

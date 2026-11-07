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
  assert.doesNotMatch(s,/\b(http|curl|wget|dblink|COPY\s|CREATE\s+EXTENSION|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/i);
  assert.match(w,/Build 6\.3 disposable staging fixture and sanitized journal/);
  assert.match(w,/docs\/saas\/sql\/staging-63-fixture-journal\.sql/);
  assert.match(w,/grep -Fq "STAGING_FIXTURE_VERIFIED/);
});

test('beta step 4 proves authenticated own-case edits and denies cross-company mutations',()=>{
  assert.equal((s.match(/SET LOCAL ROLE authenticated;/g)||[]).length,2);
  assert.equal((s.match(/UPDATE public\\.cases SET notes=/g)||[]).length,4);
  assert.match(s,/STAGE4_A_OWN_EDIT_FAILED/);
  assert.match(s,/STAGE4_B_OWN_EDIT_FAILED/);
  assert.match(s,/STAGE4_A_FOREIGN_CASE_EDITED/);
  assert.match(s,/STAGE4_B_FOREIGN_CASE_EDITED/);
  assert.match(s,/STAGE4_A_FOREIGN_PATIENT_RELINKED/);
  assert.match(s,/STAGE4_CASE_ISOLATION_FINAL_FAILED/);
  assert.match(s,/BETA_STAGE4_CASE_CROSS_TENANT_DENIED_2_OWN_EDITS/);
  assert.match(s,/ROLLBACK;\\s*$/);
});

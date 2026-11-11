import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>JSON.parse(readFileSync(path,"utf8"));
const ui=read("src/data/saas-master-launch-panel.json");
const technical=read("src/data/saas-protocol-progress.json");
const plan=read("docs/saas/BETA-RELEASE-8-EXECUTIONS.json");
const p0=read("docs/saas/PAID-BETA-READINESS.json");
const ledger=read("docs/saas/IMPLEMENTATION-PROGRESS.json");
const legal=read("docs/saas/legal/BETA6-LEGAL-APPROVAL-REGISTER.json");

test("Master dashboard snapshot equals canonical beta, legal, P0 and original formal evidence",()=>{
  assert.equal(ui.schema,"dentalflow-saas-master-launch-panel-v1");
  assert.equal(ui.recorded_at,plan.recorded_at);
  assert.equal(ui.beta.completed,plan.steps.filter(x=>x.status==="done").length);
  assert.equal(ui.beta.total,plan.steps.length);
  assert.equal(ui.beta.release_state,plan.release_state);
  assert.equal(ui.beta.approval_status,plan.beta_approval_status);
  assert.equal(ui.formal_acceptance.accepted,ledger.official_acceptance.accepted_ids.length);
  assert.equal(ui.formal_acceptance.total,ledger.denominator);
  assert.equal(ui.release_checks.verified,p0.checks.filter(x=>x.status==="verified").length);
  assert.equal(ui.release_checks.total,p0.checks.length);
  assert.equal(ui.legal_decisions.verified,legal.blocking_decisions.filter(x=>x.state==="verified").length);
  assert.equal(ui.legal_decisions.total,legal.blocking_decisions.length);
  assert.deepEqual(ui.pending_launch_steps.map(s=>s.id),
    plan.steps.filter(s=>s.status!=="done").map(s=>s.id));
  assert.deepEqual(ui.source_documents,[
    "docs/saas/BETA-RELEASE-8-EXECUTIONS.json",
    "docs/saas/IMPLEMENTATION-PROGRESS.json",
    "docs/saas/PAID-BETA-READINESS.json",
    "docs/saas/legal/BETA6-LEGAL-APPROVAL-REGISTER.json",
  ]);
});

test("current panel does not imply commercial release or a published backend",()=>{
 assert.equal(ui.beta.completed,4);
 assert.equal(ui.beta.total,8);
 assert.equal(ui.beta.release_state,"not_published");
 assert.equal(ui.beta.approval_status,"pending");
 assert.equal(ui.release_checks.verified,0);
 assert.equal(ui.legal_decisions.verified,0);
 assert.equal(ui.formal_acceptance.accepted,13);
 assert.equal(ui.formal_acceptance.total,23);
 assert.equal(technical.overall_progress_percent,94.06);
 assert.equal(technical.recorded_at,"2026-11-01");
 assert.equal(technical.sales_release_status,"blocked");
});

test("rendered admin panel never equates technical progress with beta sales",()=>{
 const source=readFileSync("src/components/master/MasterSaasProtocolProgress.tsx","utf8");
 assert.ok(source.includes('saas-protocol-progress.json'));
 assert.ok(source.includes('saas-master-launch-panel.json'));
 assert.ok(source.includes('release.beta.completed'));
 assert.ok(source.includes('release.formal_acceptance.accepted'));
 assert.ok(source.includes('release.release_checks.verified'));
 assert.ok(source.includes("liberação comercial ainda bloqueada"));
 assert.ok(!source.includes("const betaPercent=normalized"));
});

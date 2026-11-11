import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessOfflineBetaHandoff} from "./saas-beta-offline-handoff.mjs";

const docs="docs/saas/";
const actual={
 plan:JSON.parse(readFileSync(docs+"BETA-RELEASE-8-EXECUTIONS.json","utf8")),
 readiness:JSON.parse(readFileSync(docs+"PAID-BETA-READINESS.json","utf8")),
 legal:JSON.parse(readFileSync(docs+"legal/BETA6-LEGAL-APPROVAL-REGISTER.json","utf8")),
};
const copy=()=>structuredClone(actual);

test("the current real tracker reports 4/8, 8 pending P0 and 13 pending legal decisions",()=>{
 const result=assessOfflineBetaHandoff(copy());
 assert.equal(result.progress,"4/8");
 assert.equal(result.percent,50);
 assert.deepEqual(result.stages.map(x=>x.id),[5,6,7,8]);
 assert.ok(result.stages.every(x=>x.status==="pending"));
 assert.equal(result.outstanding_p0_count,8);
 assert.deepEqual(result.unresolved_legal_decision_ids,
   Array.from({length:13},(_,i)=>"L"+String(i+1).padStart(2,"0")));
 assert.equal(result.release_authorized,false);
 assert.equal(result.commercial_payments_authorized,false);
 assert.equal(result.no_production_changes,true);
 assert.equal(result.no_payment_operations,true);
 assert.equal(result.evidence_links_are_not_verified_by_this_script,true);
 assert.equal(result.release_state,"not_published");
 assert.ok(!JSON.stringify(result).includes("cpf_number"));
});

test("an independently evidenced stage can advance out of order, but cannot authorize release",()=>{
 const data=copy();
 data.plan.steps[5].status="done";
 data.plan.steps[5].evidence.push("https://github.com/GustavoFboz/dtfipo/actions/runs/123456");
 const r=assessOfflineBetaHandoff(data);
 assert.equal(r.progress,"5/8");
 assert.equal(r.percent,62.5);
 assert.equal(r.outstanding_p0_count,8);
 assert.equal(r.release_authorized,false);
 assert.equal(r.commercial_payments_authorized,false);
});

test("refuses fabricated evidence for a completed stage even if the underlying audit counted it",()=>{
 const data=copy();
 data.plan.steps[5].status="done";
 data.plan.steps[5].evidence=["https://example.invalid/not-evidence"];
 assert.throws(()=>assessOfflineBetaHandoff(data),/BETA_HANDOFF_STEP_EVIDENCE_PLACEHOLDER/);
});

test("refuses fake or internal URLs when someone labels a P0 as verified",()=>{
 for(const fake of ["https://example.org/test","https://localhost:3000/private",
   "https://127.0.0.1/admin","http://github.com/example/repo",
   "https://github.com/repo?token=bad"]){
  const data=copy();
  data.readiness.checks[0].status="verified";
  data.readiness.checks[0].evidence=[fake];
  assert.throws(()=>assessOfflineBetaHandoff(data),/(BETA_HANDOFF_P0_EVIDENCE_PLACEHOLDER|BETA_READINESS_EVIDENCE_INVALID)/);
 }
});

test("rejects altered legal approval count, duplicates and ungrounded authority",()=>{
 const without=copy();
 without.legal.blocking_decisions.pop();
 assert.throws(()=>assessOfflineBetaHandoff(without),/BETA_HANDOFF_LEGAL_SCHEMA_OR_AUTHORITY_INVALID/);
 const duplicates=copy();
 duplicates.legal.blocking_decisions[1].id="L01";
 assert.throws(()=>assessOfflineBetaHandoff(duplicates),/BETA_HANDOFF_LEGAL_DECISIONS_INVALID/);
 const pending=copy();
 pending.legal.publication_authorized=true;
 assert.throws(()=>assessOfflineBetaHandoff(pending),/BETA_HANDOFF_LEGAL_SCHEMA_OR_AUTHORITY_INVALID/);
});

test("never interprets evidence links as permission to publish",()=>{
 const data=copy();
 data.plan.release_state="published";
 assert.throws(()=>assessOfflineBetaHandoff(data),/BETA_EXECUTIONS_FALSE_PUBLICATION/);
 data.plan.release_state="not_published";
 data.plan.beta_approval_status="approved";
 assert.throws(()=>assessOfflineBetaHandoff(data),/BETA_EXECUTIONS_FALSE_PUBLICATION/);
});

test("does not allow eight P0s to automatically enable new real charges",()=>{
 const data=copy();
 for(const p of data.readiness.checks){
  p.status="verified";
  p.evidence=["https://github.com/GustavoFboz/dtfipo/actions/runs/123456"];
 }
 assert.throws(()=>assessOfflineBetaHandoff(data),/BETA_HANDOFF_UNEXPECTED_RELEASE_AUTHORITY/);
});

test("no owner document or provider secret is required in the report",()=>{
 const result=assessOfflineBetaHandoff(copy());
 assert.equal(result.generated_from,"versioned_public_repo_control_files");
 assert.ok(result.stages.every(x=>x.offline_possible && x.external_dependency && x.owner_later));
 assert.equal(JSON.stringify(result).includes("ASAAS_API_KEY"),false);
});

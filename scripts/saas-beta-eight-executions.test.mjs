import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {assessBetaExecutionPlan} from "./saas-beta-eight-executions.mjs";

const plan=JSON.parse(readFileSync(new URL("../docs/saas/BETA-RELEASE-8-EXECUTIONS.json",import.meta.url)));
const readiness=JSON.parse(readFileSync(new URL("../docs/saas/PAID-BETA-READINESS.json",import.meta.url)));
const clone=v=>JSON.parse(JSON.stringify(v));

describe("eight execution phases of limited paid beta",()=>{
  it("reports four technically evidenced phases, with beta sales still locked",()=>{
    const r=assessBetaExecutionPlan(plan,readiness);
    assert.equal(r.completed_label,"4/8");
    assert.equal(r.percent,50);
    assert.equal(r.next_step,5);
    assert.equal(r.next_status,"pending");
    assert.equal(r.release_state,"not_published");
    assert.equal(r.release_authorized_by_this_script,false);
    assert.equal(r.commercial_payments_authorized_by_this_script,false);
  });
  it("rejects an unsupported premature completion",()=>{
    const p=clone(plan);
    p.steps[1].evidence=[];
    assert.throws(()=>assessBetaExecutionPlan(p,readiness),/BETA_EXECUTIONS_UNSUPPORTED_COMPLETE/);
  });
  it("counts independently completed step 6 before step 5 without unlocking sales",()=>{
    const p=clone(plan);
    p.steps[5].status="done";
    p.steps[5].evidence=["https://example.org/evidence"];
    const r=assessBetaExecutionPlan(p,readiness);
    assert.equal(r.completed_label,"5/8");
    assert.equal(r.percent,62.5);
    assert.equal(r.next_step,5);
    assert.equal(r.next_status,"pending");
    assert.equal(r.release_authorized_by_this_script,false);
    assert.equal(r.commercial_payments_authorized_by_this_script,false);
  });
  it("counts multiple non-adjacent verified stages and retains first unfinished item",()=>{
    const p=clone(plan);
    for(const i of [5,6]) {
      p.steps[i].status="done";
      p.steps[i].evidence=["https://example.org/evidence"];
    }
    const r=assessBetaExecutionPlan(p,readiness);
    assert.equal(r.completed_label,"6/8");
    assert.equal(r.percent,75);
    assert.equal(r.next_step,5);
    assert.equal(r.release_state,"not_published");
  });
  it("denies claiming publication until all eight stages are genuinely completed",()=>{
    const p=clone(plan);
    p.steps[7].status="done";
    p.steps[7].evidence=["https://example.org/evidence"];
    p.release_state="published";
    p.beta_approval_status="approved";
    p.release_url="https://example.org/";
    const verified=clone(readiness);
    for(const check of verified.checks) {
      check.status="verified";
      check.evidence=["https://example.org/evidence"];
    }
    assert.throws(()=>assessBetaExecutionPlan(p,verified),/BETA_EXECUTIONS_RELEASE_GATE_BLOCKED/);
  });
  it("rejects falsely stating production was published",()=>{
    const p=clone(plan);
    p.release_state="published";
    p.release_url="https://example.org/";
    assert.throws(()=>assessBetaExecutionPlan(p,readiness),/BETA_EXECUTIONS_FALSE_PUBLICATION/);
  });
  it("requires all eight P0 evidence checks even for a completed plan",()=>{
    const p=clone(plan);
    for(const phase of p.steps){
      phase.status="done";
      phase.evidence=["https://example.org/independent-evidence"];
    }
    p.release_state="published";
    p.release_url="https://example.org/";
    p.beta_approval_status="approved";
    assert.throws(()=>assessBetaExecutionPlan(p,readiness),/BETA_EXECUTIONS_RELEASE_GATE_BLOCKED/);
  });
  it("prohibits duplicate/moved stages or invalid receipts",()=>{
    const p=clone(plan);
    p.steps[0].id=2;
    assert.throws(()=>assessBetaExecutionPlan(p,readiness),/BETA_EXECUTIONS_STEP_INVALID/);
    const q=clone(plan);
    q.steps[0].evidence=["local-path-with-no-validated-source"];
    assert.throws(()=>assessBetaExecutionPlan(q,readiness),/BETA_EXECUTIONS_STEP_INVALID/);
  });
});

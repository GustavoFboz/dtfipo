import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

// Exercise the actual embedded Bash and jq with fake HTTP, never a real token
// or endpoint. This script is self-contained for the isolated main bridge.
function readSteps(file) {
  const source=fs.readFileSync(file,"utf8");
  const pieces=source.split(/^      - name: /m).slice(1);
  return pieces.flatMap((p) => {
    const start=p.indexOf("        run: |\n");
    if(start<0) return [];
    const lines=p.slice(start+"        run: |\n".length).split("\n");
    const body=[];
    for(const line of lines) {
      if(line.trim()==="") { body.push(""); continue; }
      if(!line.startsWith("          ")) break;
      body.push(line.slice(10));
    }
    return [{name:p.split("\n")[0],script:body.join("\n")}];
  });
}
const worker=fs.readFileSync(".github/workflows/saas-asaas-inbox-worker.yml","utf8");
const probe=fs.readFileSync(".github/workflows/saas-asaas-publication-probe.yml","utf8");
assert(worker.includes("X-Billing-Environment: $BILLING_ENVIRONMENT") && worker.includes("monitoringRecorded == true"));
assert(probe.includes("--request GET") && !probe.includes("--request POST"));
assert(!probe.includes("api.asaas.com") && !probe.includes("api-sandbox.asaas.com"));
const probeSteps=readSteps(".github/workflows/saas-asaas-publication-probe.yml");
const workerSteps=readSteps(".github/workflows/saas-asaas-inbox-worker.yml");
for(const s of [...workerSteps,...probeSteps]) {
  const r=spawnSync("bash",["-n"],{input:s.script,encoding:"utf8"});
  assert.equal(r.status,0,`${s.name}: invalid Bash`);
}
assert.equal(probeSteps.length,3);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"dentalflow-worker-probe-"));
try {
  const bin=path.join(tmp,"bin");fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,"curl"),`#!${process.execPath}
const fs=require('node:fs');const a=process.argv.slice(2);
const method=a[a.indexOf('--request')+1];
if(method!==process.env.FIXTURE_METHOD)process.exit(42);
if(!a.includes('X-Billing-Environment: '+process.env.BILLING_ENVIRONMENT))process.exit(43);
const token=process.env.BILLING_ENVIRONMENT==='production'?process.env.BILLING_PRODUCTION_WORKER_TOKEN:process.env.BILLING_WORKER_TOKEN;
if(!a.includes('Authorization: Bearer '+token))process.exit(44);
const out=a[a.indexOf('--output')+1];
fs.writeFileSync(out,process.env.FIXTURE_BODY);
process.stdout.write(process.env.FIXTURE_STATUS);
`);fs.chmodSync(path.join(bin,"curl"),0o700);
  fs.writeFileSync(path.join(bin,"sleep"),"#!/bin/sh\nexit 0\n");fs.chmodSync(path.join(bin,"sleep"),0o700);
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,
    BILLING_ENVIRONMENT:"sandbox",BILLING_PRODUCTION_ENABLED:"false",BILLING_PRODUCTION_WORKER_TOKEN:"",
    BILLING_WORKER_TOKEN:"fake-fixture-token-01234567890123456789",FIXTURE_METHOD:"GET",FIXTURE_STATUS:"200"};
  const healthy={available:true,contract:"dentalflow-worker-health-v1",environment:"sandbox",checked_at:"2026-10-04T01:30:00Z",
    worker:{status:"ok",started_at:"2026-10-04T01:29:00+00:00",finished_at:"2026-10-04T01:29:01+00:00",
      last_healthy_at:"2026-10-04T01:29:01+00:00",started_age_seconds:60,healthy_age_seconds:59}};
  const run=(script,body,status="200",method="GET", overrides={})=>spawnSync("bash",["-c",script],{cwd:tmp,encoding:"utf8",
    env:{...env,FIXTURE_STATUS:status,FIXTURE_BODY:JSON.stringify(body),FIXTURE_METHOD:method,...overrides},timeout:15_000});
  const inspect=probeSteps[0].script,assess=probeSteps[1].script;
  assert.equal(run(inspect,healthy).status,0,"healthy GET probe failed");
  assert.equal(run(assess,healthy).status,0,"fresh heartbeat rejected");
  // Empty telemetry still proves the deployed contract/database read, but the
  // separate operational assessment must never report a running worker.
  assert.equal(run(inspect,{...healthy,worker:null}).status,0);
  assert.notEqual(run(assess,healthy).status,0,"missing heartbeat accepted");
  for(const worker of [{...healthy.worker,healthy_age_seconds:900}, {...healthy.worker,status:"review"},
    {...healthy.worker,status:"failed"}, {...healthy.worker,status:"running",started_age_seconds:300}]) {
    assert.equal(run(inspect,{...healthy,worker}).status,0);
    assert.notEqual(run(assess,healthy).status,0,"unhealthy worker accepted");
  }
  // Extra HTTP fields must not enter the evidence; private-looking dates and
  // malformed payloads are refused. No arbitrary error body is logged.
  assert.equal(run(inspect,{...healthy,secret:"PRIVATE_ERROR_MARKER"}).status,0);
  assert(!fs.readFileSync(path.join(tmp,"publication-health.json"),"utf8").includes("PRIVATE_ERROR_MARKER"));
  const malformed=run(inspect,{...healthy,checked_at:"PRIVATE_ERROR_MARKER"});
  assert.notEqual(malformed.status,0);
  for(const status of ["401","409","405","500"]) {
    const r=run(inspect,{error:"PRIVATE_ERROR_MARKER"},status);
    assert.notEqual(r.status,0);assert(!`${r.stdout}${r.stderr}`.includes("PRIVATE_ERROR_MARKER"));
  }
  const counts={processed:0,ignored:0,failed:0,workerReview:0,suspended:0,recoveryQueued:0,graceReview:0,
    reconciliationScanned:0,reconciliationQueued:0,reconciliationReview:0,monitoringRecorded:true};
  assert.equal(run(workerSteps[0].script,counts,"200","POST").status,0,"valid worker summary refused");
  assert.notEqual(run(workerSteps[0].script,{...counts,monitoringRecorded:false},"200","POST").status,0);
  assert.notEqual(run(workerSteps[0].script,{...counts,failed:1},"200","POST").status,0);
  const error=run(workerSteps[0].script,{error:"PRIVATE_ERROR_MARKER"},"503","POST");
  assert.notEqual(error.status,0);assert(!`${error.stdout}${error.stderr}`.includes("PRIVATE_ERROR_MARKER"));
  const production={BILLING_ENVIRONMENT:"production",BILLING_PRODUCTION_ENABLED:"true",
    BILLING_PRODUCTION_WORKER_TOKEN:"fake-production-token-01234567890123456789"};
  assert.equal(run(inspect,{...healthy,environment:"production"},"200","GET",production).status,0);
  assert.equal(run(workerSteps[0].script,counts,"200","POST",production).status,0);
  assert.notEqual(run(inspect,healthy,"200","GET",production).status,0,"cross-environment probe accepted");
  for(const overrides of [{BILLING_ENVIRONMENT:"invalid"},
    {...production,BILLING_PRODUCTION_ENABLED:"false"},
    {...production,BILLING_PRODUCTION_WORKER_TOKEN:""},
    {...production,BILLING_PRODUCTION_WORKER_TOKEN:env.BILLING_WORKER_TOKEN},
    {BILLING_WORKER_TOKEN:""}]) {
    for(const [script,body,method] of [[inspect,healthy,"GET"],[workerSteps[0].script,counts,"POST"]]) {
      const r=run(script,body,"200",method,overrides);
      assert.notEqual(r.status,0,"invalid scheduler configuration accepted");
      assert(!`${r.stdout}${r.stderr}`.includes("fake-production-token"),"credential leaked");
    }
  }
  console.log("SaaS workflow contracts: GET-only probe, heartbeat assessment, redaction and worker guards passed (fake HTTP).");
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }

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
assert(worker.includes("X-Billing-Environment: %s\\n") && worker.includes("monitoringRecorded == true"));
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
const url=a.at(-1), headers=a.includes('@-')?fs.readFileSync(0,'utf8').trim().split('\\n'):a;
const scheduler=url.endsWith('?check=database-scheduler'), health=url.endsWith('?check=health');
if(scheduler||health){
  if(method!=='GET'||!a.includes('@-'))process.exit(45);
  const token=scheduler?process.env.BILLING_PRODUCTION_WORKER_TOKEN:(process.env.BILLING_ENVIRONMENT==='production'?process.env.BILLING_PRODUCTION_WORKER_TOKEN:process.env.BILLING_WORKER_TOKEN);
  if(!headers.includes('Authorization: Bearer '+token)||a.some(x=>x.includes(token)))process.exit(46);
  if(health&&!headers.includes('X-Billing-Environment: '+process.env.BILLING_ENVIRONMENT))process.exit(47);
  fs.appendFileSync('calls.log',scheduler?'GET scheduler\\n':'GET health\\n');
  fs.writeFileSync(a[a.indexOf('--output')+1],process.env[scheduler?'SCHEDULER_BODY':'HEALTH_BODY']||'{}');
  process.stdout.write(process.env[scheduler?'SCHEDULER_STATUS':'HEALTH_STATUS']||'404');process.exit(0);
}
if(method!==process.env.FIXTURE_METHOD)process.exit(42);
if(!headers.includes('X-Billing-Environment: '+process.env.BILLING_ENVIRONMENT))process.exit(43);
const token=process.env.BILLING_ENVIRONMENT==='production'?process.env.BILLING_PRODUCTION_WORKER_TOKEN:process.env.BILLING_WORKER_TOKEN;
if(!headers.includes('Authorization: Bearer '+token))process.exit(44);
if(a.includes('@-')&&a.some(x=>x.includes(token)))process.exit(48);
fs.appendFileSync('calls.log',method==='POST'?'POST worker\\n':'GET probe\\n');
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
  const run=(script,body,status="200",method="GET", overrides={})=>{
    fs.writeFileSync(path.join(tmp,"calls.log"),"");
    const result=spawnSync("bash",["-c",script],{cwd:tmp,encoding:"utf8",
      env:{...env,FIXTURE_STATUS:status,FIXTURE_BODY:JSON.stringify(body),FIXTURE_METHOD:method,...overrides},timeout:15_000});
    return {...result,calls:fs.readFileSync(path.join(tmp,"calls.log"),"utf8").trim().split("\n").filter(Boolean)};
  };
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
  const now=new Date().toISOString(), recent=new Date(Date.now()-30_000).toISOString();
  const primary={available:true,contract:"dentalflow-database-scheduler-v1",environment:"sandbox",checked_at:now,
    immediate_worker_invoked:false,scheduler:{provider_environment:"sandbox",enabled:true,cron_active:true,
      cron_job_id:1,schedule:"1-59/5 * * * *",last_dispatched_at:recent,
      last_response_http_status:200,last_response_timed_out:false}};
  const recentHealth={...healthy,checked_at:now,worker:{...healthy.worker,started_at:recent,
    finished_at:recent,last_healthy_at:recent,started_age_seconds:30,healthy_age_seconds:30}};
  const fallback=(scheduler=primary,health=recentHealth,overrides={})=>run(workerSteps[0].script,counts,"200","POST",{
    BILLING_PRODUCTION_WORKER_TOKEN:production.BILLING_PRODUCTION_WORKER_TOKEN,
    SCHEDULER_BODY:JSON.stringify(scheduler),SCHEDULER_STATUS:"200",HEALTH_BODY:JSON.stringify(health),HEALTH_STATUS:"200",...overrides});
  const skipped=fallback();assert.equal(skipped.status,0);assert.deepEqual(skipped.calls,["GET scheduler","GET health"],"Healthy backend did not suppress fallback POST.");
  const running=fallback(primary,{...recentHealth,worker:{...recentHealth.worker,status:"running",finished_at:null}});
  assert.equal(running.status,0);assert(!running.calls.includes("POST worker"));
  const prodSkipped=fallback({...primary,environment:"production",scheduler:{...primary.scheduler,provider_environment:"production"}},
    {...recentHealth,environment:"production"},production);
  assert.equal(prodSkipped.status,0);assert(!prodSkipped.calls.includes("POST worker"));
  for(const scheduler of [{...primary,environment:"production"},{...primary,contract:"unknown"},
    {...primary,checked_at:"PRIVATE_ERROR_MARKER"},{...primary,scheduler:null},
    {...primary,scheduler:{...primary.scheduler,cron_active:false}},
    {...primary,scheduler:{...primary.scheduler,last_response_http_status:401}},
    {...primary,scheduler:{...primary.scheduler,last_dispatched_at:new Date(Date.now()-600_000).toISOString()}}]) {
    const r=fallback(scheduler);assert.equal(r.status,0);assert(r.calls.includes("POST worker"),"Unverified database schedule suppressed fallback.");
    assert(!`${r.stdout}${r.stderr}`.includes("PRIVATE_ERROR_MARKER"));
  }
  for(const worker of [{...recentHealth.worker,status:"failed"},{...recentHealth.worker,status:"review"},
    {...recentHealth.worker,healthy_age_seconds:300},{...recentHealth.worker,healthy_age_seconds:"30"},
    {...recentHealth.worker,status:"running",finished_at:null,started_age_seconds:180}]) {
    const r=fallback(primary,{...recentHealth,worker});assert.equal(r.status,0);assert(r.calls.includes("POST worker"),"Unhealthy backend suppressed fallback.");
  }
  for(const overrides of [{SCHEDULER_STATUS:"503"},{HEALTH_STATUS:"401"},{BILLING_PRODUCTION_WORKER_TOKEN:""}]) {
    const r=fallback(primary,recentHealth,overrides);assert.equal(r.status,0);assert(r.calls.includes("POST worker"));
  }
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
  console.log("SaaS workflow contracts: private probes, fresh backend dispatch/health fallback, redaction and environment guards passed (fake HTTP).");
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }

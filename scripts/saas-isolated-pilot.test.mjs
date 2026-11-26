import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {runIsolatedPilot} from "./saas-isolated-pilot.mjs";

test("isolated capacity preflight tests bounded GET, no auth, and reports errors honestly",async()=>{
  let inFlight=0,maxSeen=0,calls=0,unsafeMethod=false;
  const server=createServer((req,res)=>{
    calls++;inFlight++;maxSeen=Math.max(maxSeen,inFlight);
    if(req.method!=="GET"||req.url!=="/health"||req.headers.authorization)unsafeMethod=true;
    setTimeout(()=>{res.writeHead(calls===3?503:200,{"Content-Type":"application/json"});
      res.end("{}");inFlight--;},15);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const port=server.address().port;
    const report=await runIsolatedPilot({url:"http://127.0.0.1:"+port+"/health",count:16,concurrency:3});
    assert.equal(report.total,16);
    assert.equal(report.success+report.failed,16);
    assert.ok(report.max_observed_concurrency<=3);
    assert.ok(maxSeen<=3);
    assert.equal(calls,16);
    assert.equal(unsafeMethod,false);
    assert.ok(report.failed>=1);
    assert.match(report.warning,/NOT proof.*10k/);
    assert.ok(report.p95_ms>=report.p50_ms);
    assert.equal(JSON.stringify(report).includes(port.toString()),false);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test("refuses any remote host or TLS/userinfo path before network access",async()=>{
  let called=0;
  const fake=async()=>{called++;return {status:200};};
  for(const url of ["https://127.0.0.1:3011/health","http://localhost:3011/health",
    "http://127.0.0.1:3011/other","http://127.0.0.1:3011/health?patient_id=1",
    "http://admin:pass@127.0.0.1:3011/health","http://10.0.0.1:3011/health",
    "https://project.supabase.co/rest/v1/patients"]){
    await assert.rejects(runIsolatedPilot({url,fetchImpl:fake}),/PILOT_TARGET_NOT_LOOPBACK/);
  }
  assert.equal(called,0);
});
test("enforces small request and parallelism budgets",async()=>{
  const url="http://127.0.0.1:43210/health",fetchImpl=async()=>({status:200});
  for(const options of [{count:41},{count:0},{concurrency:5},{concurrency:0},{concurrency:3,count:2},{timeoutMs:8000}]){
    await assert.rejects(runIsolatedPilot({url,fetchImpl,...options}),/PILOT_BUDGET_OUT_OF_RANGE/);
  }
});
test("never describes failed HTTP or network attempts as capacity success",async()=>{
  const url="http://127.0.0.1:43210/health";
  const report=await runIsolatedPilot({url,count:4,fetchImpl:async()=>{throw Error("network offline");}});
  assert.equal(report.success,0);
  assert.equal(report.failed,4);
  assert.ok(report.warning.includes("Synthetic"));
});

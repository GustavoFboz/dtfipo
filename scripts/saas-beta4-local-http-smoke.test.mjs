import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyLoopback,parseLocalStatus,run} from "./saas-beta4-local-http-smoke.mjs";

test("only exact loopback 127.0.0.1:54321 origin with explicit permission",()=>{
  assert.equal(verifyLoopback("http://127.0.0.1:54321",true),"http://127.0.0.1:54321");
  const forbidden=[
    "https://127.0.0.1:54321","http://localhost:54321","http://127.0.0.1:8000",
    "http://127.0.0.1:54321.evil.test","http://127.0.0.1:54321@evil.test:54321",
    "http://127.0.0.1:54321/anything","http://127.0.0.1:54321/?redirect=1",
    "https://bbyhpwocwamgwcuqqnck.supabase.co",
    "https://qa-tenant.supabase.co","http://[::1]:54321",
  ];
  for(const origin of forbidden)assert.throws(()=>verifyLoopback(origin,true),/QA_LOCAL_ORIGIN_REJECTED/);
  assert.throws(()=>verifyLoopback("http://127.0.0.1:54321",false),
    /QA_LOCAL_EXPLICIT_OPT_IN_REQUIRED/);
});

test("parsing status env keeps credentials unprinted",()=>{
  const mock="API_URL=http://127.0.0.1:54321\nANON_KEY=synthetic-a\nSERVICE_ROLE_KEY=synthetic-secret\n";
  const config=parseLocalStatus(mock);
  assert.equal(config.url,"http://127.0.0.1:54321");
  assert.equal(config.anonKey,"synthetic-a");
  assert.equal(config.adminKey,"synthetic-secret");
});

test("real local integration cannot be accidentally run in developer workstation or any remote host",async()=>{
  const before=process.env.DENTALFLOW_BETA4_LOCAL_TEST;
  const ci=process.env.CI;
  try {
    delete process.env.DENTALFLOW_BETA4_LOCAL_TEST;
    delete process.env.CI;
    await assert.rejects(run(),/QA_LOCAL_CI_ONLY/);
  } finally {
    if(before===undefined)delete process.env.DENTALFLOW_BETA4_LOCAL_TEST;
    else process.env.DENTALFLOW_BETA4_LOCAL_TEST=before;
    if(ci===undefined)delete process.env.CI;else process.env.CI=ci;
  }
});

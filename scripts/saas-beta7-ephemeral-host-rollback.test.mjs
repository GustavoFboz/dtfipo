import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {inspectBuild,validateGitSHA,stageSwitch,createLocalHost,rehearse,run} from "./saas-beta7-ephemeral-host-rollback.mjs";

function fixture(){
  const workspace=mkdtempSync(join(tmpdir(),"dentalflow-beta7-"));
  const make=(dir,revision)=> {
    const root=join(workspace,dir);
    mkdirSync(join(root,".output","public","assets"),{recursive:true});
    writeFileSync(join(root,".output","public","assets","app.js"),
      "console.log('synthetic "+revision+"');\n");
    writeFileSync(join(root,".output","public","index.html"),
      "<!doctype html><title>local-only "+revision+"</title>");
    return root;
  };
  const a=make("baseline","a"),b=make("candidate","b");
  return {workspace,a,b,dispose:()=>rmSync(workspace,{force:true,recursive:true})};
}

test("fail closed on invalid revisions and missing outputs",()=>{
  for(const bad of [null,"abc","0".repeat(39),"g".repeat(40)]){
    assert.throws(()=>validateGitSHA(bad),/BETA7_SHA_INVALID/);
  }
  const x=fixture();
  try{
    assert.throws(()=>inspectBuild(x.a,"abc"),/BETA7_SHA_INVALID/);
    const a=inspectBuild(x.a,"a".repeat(40));
    assert(a.files_count>=2);
    assert.match(a.asset.sha256,/^[a-f0-9]{64}$/);
    assert.throws(()=>stageSwitch(x.workspace,"production",a),/BETA7_TAG_INVALID/);
  }finally{x.dispose();}
});

test("two immutable distinct Web builds are served via loopback as A -> B -> A",async()=>{
  const x=fixture();
  try{
    const a=inspectBuild(x.a,"a".repeat(40));
    const b=inspectBuild(x.b,"b".repeat(40));
    assert.notEqual(a.content_sha256,b.content_sha256);
    const r=await rehearse(x.workspace,a,b,{port:0});
    assert.equal(r.passed,true);
    assert.equal(r.production_host_rolled_back,false);
    assert.equal(r.release_authorized,false);
    assert.equal(r.asaas_invoked,false);
    assert.deepEqual(r.phases.map(p=>p.phase),
      ["prior","deploy_candidate","rollback_prior"]);
    assert.deepEqual(r.phases.map(p=>p.source_sha),
      ["a".repeat(40),"b".repeat(40),"a".repeat(40)]);
    assert.equal(r.phases[0].content_sha256,r.phases[2].content_sha256);
  }finally{x.dispose();}
});

test("tampering with a build after recording its manifest stops the rollback",async()=>{
  const x=fixture();
  try{
    const a=inspectBuild(x.a,"a".repeat(40));
    const b=inspectBuild(x.b,"b".repeat(40));
    writeFileSync(join(x.b,".output","public","assets","app.js"),
      "console.log('tampered');\n");
    await assert.rejects(rehearse(x.workspace,a,b,{port:0}),
      /BETA7_HOST_SOURCE_NOT_SERVED|BETA7_ASSET_DIGEST_MISMATCH/);
  }finally{x.dispose();}
});

test("the local-only harness cannot be accidentally run on a developer workstation",async()=>{
  const ci=process.env.CI;
  const enabled=process.env.DENTALFLOW_BETA7_LOCAL_TEST;
  try{
    delete process.env.CI;
    delete process.env.DENTALFLOW_BETA7_LOCAL_TEST;
    await assert.rejects(run(),/BETA7_CI_ONLY/);
  }finally{
    if(ci===undefined)delete process.env.CI;else process.env.CI=ci;
    if(enabled===undefined)delete process.env.DENTALFLOW_BETA7_LOCAL_TEST;
    else process.env.DENTALFLOW_BETA7_LOCAL_TEST=enabled;
  }
});

test("HTTP never exposes Asaas billing or internal APIs even when browsing app assets",async()=>{
  const x=fixture();
  try{
    const a=inspectBuild(x.a,"a".repeat(40));
    stageSwitch(x.workspace,"a",a);
    const server=createLocalHost(x.workspace,[a]);
    await new Promise(r=>server.listen(0,"127.0.0.1",r));
    try{
      const addr=server.address();
      const origin="http://127.0.0.1:"+addr.port;
      assert.equal((await fetch(origin+"/api/billing/asaas-worker")).status,404);
      assert.equal((await fetch(origin+"/api/billing/asaas-checkout",{method:"POST"})).status,405);
      assert.equal((await fetch(origin+"/../.env")).status,404);
      assert.equal((await fetch(origin+"/assets/app.js")).status,200);
    }finally{await new Promise(r=>server.close(r));}
  }finally{x.dispose();}
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runReadonlyTenantProbe } from "./saas-tenant-readonly-probe.mjs";

const A = { userId: "ee083f63-1621-4b82-b7a4-fd13427c0b14", clinicId: "081d3db4-1606-40f7-a878-19b51556317d", jwt: "jwt-fixture-a" };
const B = { userId: "24e7cdf9-457e-4af2-b1cb-cf366abbddb0", clinicId: "3fc86c40-697e-4725-a9e9-633fc882aadc", jwt: "jwt-fixture-b" };
const patientA = "d4e1c89d-6d71-496d-a3ab-ac0b8735721c";
const patientB = "889e9812-5dcf-4d45-b60c-75b7edb3495b";
const config = (fetchImpl) => ({
  url: "https://qa-fixture.supabase.co",
  anonKey: "sb_publishable_nonprivileged",
  jwtA: A.jwt, jwtB: B.jwt, patientA, patientB, fetchImpl,
});
function mockApi(options={}) {
  const calls=[];
  const fetchImpl = async (raw, init) => {
    const u = new URL(raw);calls.push({u,init});
    const actor=init.headers.Authorization === "Bearer " + A.jwt ? A : B;
    const other=actor===A?B:A;
    if (u.pathname==="/auth/v1/user") return Response.json({id:options.forgedAuth && actor===A?other.userId:actor.userId});
    if (u.pathname==="/rest/v1/profiles") return Response.json(options.profileMismatch && actor===A
      ?[{id:actor.userId,clinic_id:other.clinicId}]
      :[{id:actor.userId,clinic_id:actor.clinicId}]);
    if(u.pathname==="/rest/v1/patients"){
      const id=u.searchParams.get("id")?.slice(3);
      const owned=actor===A?patientA:patientB;
      if(id===owned) return Response.json(options.missingOwn && actor===A?[]:[{id,clinic_id:actor.clinicId}]);
      if(options.foreignLeak && actor===A) return Response.json([{id,clinic_id:other.clinicId}]);
      return Response.json([]);
    }
    throw new Error("unexpected path");
  };
  return {fetchImpl,calls};
}
async function code(promise, expected) {
  await assert.rejects(promise, e=>e?.message===expected);
}
describe("read-only tenant access with positive controls", () => {
  it("requires actual own patient proof before accepting empty foreign results", async()=>{
    const env=mockApi({missingOwn:true});
    await code(runReadonlyTenantProbe(config(env.fetchImpl)),"QA_OWN_PATIENT_NOT_VISIBLE");
    assert.equal(env.calls.filter(c=>c.u.pathname.endsWith("patients")).length,1);
  });
  it("rejects a foreign patient visible under the wrong actor", async()=>{
    const env=mockApi({foreignLeak:true});
    await code(runReadonlyTenantProbe(config(env.fetchImpl)),"QA_CROSS_TENANT_PATIENT_VISIBLE");
  });
  it("verifies both authenticated users and both positive/negative cases, read-only", async()=>{
    const env=mockApi();
    const result=await runReadonlyTenantProbe(config(env.fetchImpl));
    assert.equal(result.passed,true);
    assert.equal(result.checks.length,8);
    assert.deepEqual(result.checks.filter(c=>c.endsWith("_foreign_patient_denied")).length,2);
    assert.equal(env.calls.length,8);
    assert.ok(env.calls.every(({u,init})=>u.hostname==="qa-fixture.supabase.co"
      &&init.method==="GET"&&!init.body&&init.cache==="no-store"));
    assert.ok(env.calls.every(({init})=>init.headers.apikey==="sb_publishable_nonprivileged"));
    const output=JSON.stringify(result);
    for(const privateValue of [A.jwt,B.jwt,patientA,patientB,A.userId,B.userId])
      assert.equal(output.includes(privateValue),false);
  });
  it("rejects forged or expired identities even if fake rows would pass", async()=>{
    const env=mockApi({forgedAuth:true});
    await code(runReadonlyTenantProbe(config(env.fetchImpl)),"QA_ACTOR_IDENTITY_MISMATCH");
  });
  it("requires a matching company from each authenticated profile", async()=>{
    const env=mockApi({profileMismatch:true});
    await code(runReadonlyTenantProbe(config(env.fetchImpl)),"QA_PROFILE_OWNER_UNVERIFIED");
  });
  it("refuses empty patient selectors and never queries a vacuous fixture", async()=>{
    const env=mockApi();
    await code(runReadonlyTenantProbe({...config(env.fetchImpl),patientA:""}),"QA_SEEDED_POSITIVE_CONTROLS_REQUIRED");
    await code(runReadonlyTenantProbe({...config(env.fetchImpl),patientB:patientA}),"QA_SEEDED_POSITIVE_CONTROLS_REQUIRED");
    assert.equal(env.calls.length,0);
  });
  it("blocks arbitrary destinations before sending any credentials", async()=>{
    const env=mockApi();
    for(const url of ["https://qa-fixture.supabase.co.evil.test","http://qa-fixture.supabase.co",
      "https://qa-fixture.supabase.co:444","https://user:pass@qa-fixture.supabase.co"])
      await code(runReadonlyTenantProbe({...config(env.fetchImpl),url}),"QA_ORIGIN_INVALID");
    assert.equal(env.calls.length,0);
  });
  it("never accepts secret-typed API keys", async()=>{
    const env=mockApi();
    await code(runReadonlyTenantProbe({...config(env.fetchImpl),anonKey:"sb_secret_should_not_be_used"}),"QA_ADMIN_CREDENTIAL_FORBIDDEN");
    assert.equal(env.calls.length,0);
  });
});

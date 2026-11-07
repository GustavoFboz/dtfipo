import assert from "node:assert/strict";
import { test } from "node:test";
import { runReadonlyCaseTenantProbe } from "./saas-case-tenant-readonly-probe.mjs";

const A = { userId: "ee083f63-1621-4b82-b7a4-fd13427c0b14", clinicId: "081d3db4-1606-40f7-a878-19b51556317d", jwt: "jwt-fixture-a" };
const B = { userId: "24e7cdf9-457e-4af2-b1cb-cf366abbddb0", clinicId: "3fc86c40-697e-4725-a9e9-633fc882aadc", jwt: "jwt-fixture-b" };
const patientA = "d4e1c89d-6d71-496d-a3ab-ac0b8735721c";
const patientB = "889e9812-5dcf-4d45-b60c-75b7edb3495b";
const caseA = "b4be9821-e379-471c-9ef9-fc71fae845f1";
const caseB = "6b5148c3-0fbf-44f0-b91f-44267a121481";
const baseConfig = (fetchImpl) => ({
  url: "https://qa-fixture.supabase.co",
  anonKey: "sb_publishable_nonprivileged",
  jwtA: A.jwt, jwtB: B.jwt, patientA, patientB, caseA, caseB, fetchImpl,
});

function mockApi(options={}) {
  const calls = [];
  const fetchImpl = async (raw, init) => {
    const u = new URL(raw);
    calls.push({url:u,init});
    const actor = init.headers.Authorization === "Bearer " + A.jwt ? A : B;
    const other = actor===A?B:A;
    const ownPatient = actor===A?patientA:patientB;
    const otherPatient = actor===A?patientB:patientA;
    const ownCase = actor===A?caseA:caseB;
    if (u.pathname==="/auth/v1/user")
      return Response.json({id:options.forgedAuth && actor===A ? other.userId : actor.userId});
    if (u.pathname==="/rest/v1/profiles")
      return Response.json([{id:actor.userId,clinic_id:actor.clinicId}]);
    if (u.pathname==="/rest/v1/patients") {
      const id = u.searchParams.get("id")?.slice(3);
      if (id===ownPatient) return Response.json([{id,clinic_id:actor.clinicId}]);
      if (id===otherPatient) return Response.json([]);
    }
    if (u.pathname==="/rest/v1/cases") {
      const id = u.searchParams.get("id")?.slice(3);
      if (options.caseNetworkError) throw Error("private transport detail");
      if (options.unauthorized && actor===A) return new Response("",{status:401});
      if (id===ownCase)
        return Response.json(options.missingOwn && actor===A ? [] : [{id,patient_id:options.wrongPatient && actor===A ? otherPatient : ownPatient}]);
      if (options.foreignLeak && actor===A) return Response.json([{id,patient_id:otherPatient}]);
      return Response.json([]);
    }
    throw Error("unexpected mock route");
  };
  return {fetchImpl,calls};
}
async function denied(promise, code) {
  await assert.rejects(promise,error=>error?.message===code);
}

test("valid authenticated sessions, two real own cases and foreign cases denied", async()=>{
  const api=mockApi();
  const result=await runReadonlyCaseTenantProbe(baseConfig(api.fetchImpl));
  assert.equal(result.passed,true);
  assert.equal(result.checks.length,12);
  assert.equal(result.checks.filter(x=>x.endsWith("_foreign_case_denied")).length,2);
  assert.equal(api.calls.length,12);
  assert.ok(api.calls.every(({url,init}) => url.hostname==="qa-fixture.supabase.co"
    &&init.method==="GET"&&!init.body&&init.credentials==="omit"&&init.redirect==="error"&&init.cache==="no-store"));
  assert.ok(api.calls.filter(x=>x.url.pathname.endsWith("/cases")).every(x=>
    x.url.searchParams.get("select")==="id,patient_id" && x.url.searchParams.get("limit")==="2"));
  const text=JSON.stringify(result);
  for(const secret of [A.jwt,B.jwt,A.userId,B.userId,A.clinicId,B.clinicId,patientA,patientB,caseA,caseB])
    assert.equal(text.includes(secret),false);
});

test("missing case IDs fail before network and never earn a vacuous pass",async()=>{
  const api=mockApi();
  await denied(runReadonlyCaseTenantProbe({...baseConfig(api.fetchImpl),caseA:""}),"QA_SEEDED_CASE_CONTROLS_REQUIRED");
  await denied(runReadonlyCaseTenantProbe({...baseConfig(api.fetchImpl),caseB:caseA}),"QA_SEEDED_CASE_CONTROLS_REQUIRED");
  assert.equal(api.calls.length,0);
});

test("own case must exist and link to already verified patient",async()=>{
  const api=mockApi({missingOwn:true});
  await denied(runReadonlyCaseTenantProbe(baseConfig(api.fetchImpl)),"QA_OWN_CASE_OR_PATIENT_LINK_UNVERIFIED");
  const api2=mockApi({wrongPatient:true});
  await denied(runReadonlyCaseTenantProbe(baseConfig(api2.fetchImpl)),"QA_OWN_CASE_OR_PATIENT_LINK_UNVERIFIED");
});

test("foreign case leakage is detected under the owner's real actor token",async()=>{
  const api=mockApi({foreignLeak:true});
  await denied(runReadonlyCaseTenantProbe(baseConfig(api.fetchImpl)),"QA_CROSS_TENANT_CASE_VISIBLE");
});

test("authentication identity check precedes case reads",async()=>{
  const api=mockApi({forgedAuth:true});
  await denied(runReadonlyCaseTenantProbe(baseConfig(api.fetchImpl)),"QA_ACTOR_IDENTITY_MISMATCH");
  assert.equal(api.calls.some(x=>x.url.pathname.endsWith("/cases")),false);
});

test("no privileged keys and no untrusted origins",async()=>{
  const api=mockApi();
  await denied(runReadonlyCaseTenantProbe({...baseConfig(api.fetchImpl),anonKey:"sb_secret_unsafe"}),"QA_ADMIN_CREDENTIAL_FORBIDDEN");
  await denied(runReadonlyCaseTenantProbe({...baseConfig(api.fetchImpl),url:"https://qa-fixture.supabase.co.evil.test"}),"QA_ORIGIN_INVALID");
  assert.equal(api.calls.length,0);
});

test("auth or network errors fail closed with sanitized error codes",async()=>{
  const api=mockApi({unauthorized:true});
  await denied(runReadonlyCaseTenantProbe(baseConfig(api.fetchImpl)),"QA_CASE_AUTH_OR_RLS_DENIED");
  const api2=mockApi({caseNetworkError:true});
  await denied(runReadonlyCaseTenantProbe(baseConfig(api2.fetchImpl)),"QA_CASE_NETWORK_ERROR");
});

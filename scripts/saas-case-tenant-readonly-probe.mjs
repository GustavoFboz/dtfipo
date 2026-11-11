/**
 * Beta 4/8: authenticated case-isolation readback with positive controls.
 * Read-only, synthetic QA fixture only. No production or billing operations.
 */
import { pathToFileURL } from "node:url";
import { runReadonlyTenantProbe, TenantProbeError } from "./saas-tenant-readonly-probe.mjs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const reject = (code) => { throw new TenantProbeError(code); };

async function readCases(origin, config, jwt, id) {
  const url = new URL("/rest/v1/cases", origin);
  url.searchParams.set("select", "id,patient_id");
  url.searchParams.set("id", "eq." + id);
  url.searchParams.set("limit", "2");
  let response;
  try {
    response = await config.fetchImpl(url.href, {
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
      headers: {
        Authorization: "Bearer " + jwt,
        apikey: config.anonKey,
        Accept: "application/json",
        "Cache-Control": "no-store",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    reject("QA_CASE_NETWORK_ERROR");
  }
  if (!response?.ok) reject(response?.status === 401 || response?.status === 403
    ? "QA_CASE_AUTH_OR_RLS_DENIED" : "QA_CASE_HTTP_ERROR");
  let rows;
  try { rows = await response.json(); } catch { reject("QA_CASE_RESPONSE_INVALID"); }
  if (!Array.isArray(rows)) reject("QA_CASE_RESPONSE_INVALID");
  return rows;
}

export async function runReadonlyCaseTenantProbe(config) {
  // Refuse missing controls before making even an authentication request.
  const { caseA, caseB } = config ?? {};
  if (!UUID.test(caseA ?? "") || !UUID.test(caseB ?? "") || caseA === caseB)
    reject("QA_SEEDED_CASE_CONTROLS_REQUIRED");
  // Existing probe checks origin, key type, Auth identities, profile company,
  // and both real, own patient records before we attempt case checks.
  const prior = await runReadonlyTenantProbe(config);
  const origin = new URL(config.url).origin;
  const cases = [caseA, caseB];
  const patients = [config.patientA, config.patientB];
  const jwts = [config.jwtA, config.jwtB];
  const checks = [...prior.checks];
  for (let i = 0; i < 2; i++) {
    const name = i === 0 ? "fixture_a" : "fixture_b";
    const own = await readCases(origin, config, jwts[i], cases[i]);
    if (own.length !== 1 || own[0]?.id !== cases[i]
      || own[0]?.patient_id !== patients[i])
      reject("QA_OWN_CASE_OR_PATIENT_LINK_UNVERIFIED");
    checks.push(name + "_own_case_and_patient_link_visible");
    const foreign = await readCases(origin, config, jwts[i], cases[1-i]);
    if (foreign.length !== 0) reject("QA_CROSS_TENANT_CASE_VISIBLE");
    checks.push(name + "_foreign_case_denied");
  }
  return {
    contract: "dentalflow-saas-case-tenant-readonly-v1",
    passed: true,
    mode: "authenticated-get-only",
    checks,
    limitations: "Only authenticated SELECT on patients/cases. No write, UI, attachment, Storage, billing or production acceptance.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  runReadonlyCaseTenantProbe({
    url: env.DENTALFLOW_QA_SUPABASE_URL,
    anonKey: env.DENTALFLOW_QA_ANON_KEY,
    jwtA: env.DENTALFLOW_QA_ACTOR_A_JWT,
    jwtB: env.DENTALFLOW_QA_ACTOR_B_JWT,
    patientA: env.DENTALFLOW_QA_PATIENT_A_ID,
    patientB: env.DENTALFLOW_QA_PATIENT_B_ID,
    caseA: env.DENTALFLOW_QA_CASE_A_ID,
    caseB: env.DENTALFLOW_QA_CASE_B_ID,
    fetchImpl: fetch,
  }).then(result => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch(error => {
      const code = error instanceof TenantProbeError ? error.message : "QA_CASE_UNEXPECTED_FAILURE";
      process.stderr.write(JSON.stringify({
        contract: "dentalflow-saas-case-tenant-readonly-v1", passed: false, code,
      }) + "\n");
      process.exitCode = 1;
    });
}

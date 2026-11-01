/**
 * DentalFlow SaaS 4.2: read-only, positive-control tenant-isolation probe.
 *
 * SAFETY: only GET against the approved Supabase origin. No service_role token,
 * no writes, no user passwords, no production patient identifiers in output.
 * Credentials and patient IDs must be provisioned out-of-band for approved QA
 * fixtures. If no seeded own patient exists, this tool cannot claim success.
 */
import { pathToFileURL } from "node:url";

const ACTORS = Object.freeze([
  { label: "fixture_a", userId: "ee083f63-1621-4b82-b7a4-fd13427c0b14", clinicId: "081d3db4-1606-40f7-a878-19b51556317d" },
  { label: "fixture_b", userId: "24e7cdf9-457e-4af2-b1cb-cf366abbddb0", clinicId: "3fc86c40-697e-4725-a9e9-633fc882aadc" },
]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export class TenantProbeError extends Error {
  constructor(code) { super(code); this.name = "TenantProbeError"; }
}
const deny = (code) => { throw new TenantProbeError(code); };

function validate(config) {
  const { url, anonKey, jwtA, jwtB, patientA, patientB } = config ?? {};
  let parsed;
  try { parsed = new URL(url); } catch { deny("QA_ORIGIN_INVALID"); }
  // Avoid ever sending QA JWTs to arbitrary hosts (including URL userinfo,
  // unexpected ports and IPs). Do not allow service-role credentials.
  if (parsed.protocol !== "https:" || parsed.username || parsed.password
    || parsed.port || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname)
    || parsed.pathname !== "/" || parsed.search || parsed.hash) deny("QA_ORIGIN_INVALID");
  if (typeof anonKey !== "string" || !anonKey || typeof jwtA !== "string"
    || typeof jwtB !== "string" || !jwtA || !jwtB || jwtA === jwtB)
    deny("QA_CREDENTIALS_MISSING");
  if (anonKey === jwtA || anonKey === jwtB || /^sb_secret_|^service_role/i.test(anonKey))
    deny("QA_ADMIN_CREDENTIAL_FORBIDDEN");
  if (!UUID.test(patientA ?? "") || !UUID.test(patientB ?? "") || patientA === patientB)
    deny("QA_SEEDED_POSITIVE_CONTROLS_REQUIRED");
  if (typeof config.fetchImpl !== "function") deny("QA_FETCH_UNAVAILABLE");
  return parsed.origin;
}
async function fetchJson(origin, anonKey, jwt, pathname, params, fetchImpl) {
  const url = new URL(pathname, origin);
  if (params) for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: "GET", mode: "cors", redirect: "error", credentials: "omit",
      headers: { "Authorization": "Bearer " + jwt, "apikey": anonKey,
        "Accept": "application/json", "Cache-Control": "no-store" },
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
  } catch { deny("QA_NETWORK_ERROR"); }
  if (!response?.ok) {
    if (response?.status === 401 || response?.status === 403) deny("QA_AUTHENTICATION_OR_RLS_DENIED");
    deny("QA_HTTP_ERROR");
  }
  try { return await response.json(); } catch { deny("QA_RESPONSE_INVALID"); }
}
function owned(rows, id, clinicId) {
  return Array.isArray(rows) && rows.length === 1
    && rows[0]?.id === id && rows[0]?.clinic_id === clinicId;
}
function absent(rows) { return Array.isArray(rows) && rows.length === 0; }

export async function runReadonlyTenantProbe(config) {
  const origin = validate(config);
  const { anonKey, jwtA, jwtB, patientA, patientB, fetchImpl } = config;
  const jwt = [jwtA, jwtB], patient = [patientA, patientB];
  const checks = [];
  for (let i = 0; i < 2; i++) {
    const me = ACTORS[i], other = ACTORS[1-i];
    const auth = await fetchJson(origin, anonKey, jwt[i], "/auth/v1/user", null, fetchImpl);
    if (auth?.id !== me.userId) deny("QA_ACTOR_IDENTITY_MISMATCH");
    checks.push(me.label + "_real_user_jwt");

    const profile = await fetchJson(origin, anonKey, jwt[i], "/rest/v1/profiles", {
      select: "id,clinic_id", id: "eq." + me.userId, limit: "2",
    }, fetchImpl);
    if (!owned(profile, me.userId, me.clinicId)) deny("QA_PROFILE_OWNER_UNVERIFIED");
    checks.push(me.label + "_own_profile");

    // Positive control comes BEFORE any negative claim. An empty fixture
    // cannot earn an isolation pass just because nobody owns any rows.
    const own = await fetchJson(origin, anonKey, jwt[i], "/rest/v1/patients", {
      select: "id,clinic_id", id: "eq." + patient[i], limit: "2",
    }, fetchImpl);
    if (!owned(own, patient[i], me.clinicId)) deny("QA_OWN_PATIENT_NOT_VISIBLE");
    checks.push(me.label + "_own_patient_visible");

    const foreign = await fetchJson(origin, anonKey, jwt[i], "/rest/v1/patients", {
      select: "id,clinic_id", id: "eq." + patient[1-i], limit: "2",
    }, fetchImpl);
    if (!absent(foreign)) deny("QA_CROSS_TENANT_PATIENT_VISIBLE");
    checks.push(me.label + "_foreign_patient_denied");
  }
  // Output deliberately contains no PII, row IDs, clinic IDs, bearer tokens or URLs.
  return { contract: "dentalflow-saas-tenant-readonly-v1",
    passed: true, checks, mode: "authenticated-get-only",
    limitations: "Patient SELECT only. Does not prove UPDATE/INSERT/DELETE, sessions, MFA, storage or financial replay." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  runReadonlyTenantProbe({
    url: env.DENTALFLOW_QA_SUPABASE_URL,
    anonKey: env.DENTALFLOW_QA_ANON_KEY,
    jwtA: env.DENTALFLOW_QA_ACTOR_A_JWT,
    jwtB: env.DENTALFLOW_QA_ACTOR_B_JWT,
    patientA: env.DENTALFLOW_QA_PATIENT_A_ID,
    patientB: env.DENTALFLOW_QA_PATIENT_B_ID,
    fetchImpl: fetch,
  }).then(result => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch(error => {
      const code = error instanceof TenantProbeError ? error.message : "QA_UNEXPECTED_FAILURE";
      process.stderr.write(JSON.stringify({ contract: "dentalflow-saas-tenant-readonly-v1",
        passed: false, code }) + "\n");
      process.exitCode = 1;
    });
}

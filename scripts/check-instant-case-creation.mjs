import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const api = read("src/lib/api.ts");
const rpcClient = read("src/lib/creation-rpc.ts");
const attempt = read("src/lib/creation-attempt.ts");
const caseDialog = read("src/components/NewCaseDialog.tsx");
const patientDialog = read("src/components/PatientFormDialog.tsx");
const casesLocal = read("src/lib/cases-local-first.ts");
const patientsLocal = read("src/lib/patients-local-first.ts");
const realtime = read("src/hooks/use-cases-realtime.ts");
const identity = read("src/lib/patient-identity.ts");

const rpcName = "20261013160000_creation_idempotency_rpc.sql";
const guardName = "20261013150000_patient_duplicate_guard.sql";
const rpcMigration = read("supabase/migrations/" + rpcName);
const restoreRpcMigration = read("public/restore/migrations/" + rpcName);
const guardMigration = read("supabase/migrations/" + guardName);
const restoreGuardMigration = read("public/restore/migrations/" + guardName);
const manifest = JSON.parse(read("public/restore/migrations.json"));
const restore = read("public/restore.sql");
const backendRestore = read("public/restore/backend-restore.sql");

expect(api.includes("createCaseConfirmed(values, key)"), "Case creation must use the transactional idempotent RPC.");
expect(api.includes("void Promise.all(createdRows.flatMap") && api.includes("case milling tracking deferred"), "Auxiliary milling tracking must not block the confirmed case response.");
expect(api.includes("const isReplay = Boolean(result.replayed)") && api.includes("ignoreDuplicates: true"), "Case notifications must be safe to replay.");
expect(rpcClient.includes("create_patient_idempotent_v1") && rpcClient.includes("create_case_idempotent_v1"), "The RPC client must use both confirmed creation functions.");
expect(rpcClient.includes("CREATION_KEY_CONFLICT") && rpcClient.includes("PATIENT_DUPLICATE_IDENTITY_EXISTS"), "The RPC client must explain key conflicts and duplicate patient identities.");
expect(attempt.includes("crypto.randomUUID()") && attempt.includes("singleFlight"), "Creation attempts must use stable opaque IDs and expose single-flight protection.");
expect(caseDialog.includes("caseCreationPayloadRef.current = createPayload") && caseDialog.includes("caseCreationAttemptedRef.current = true"), "Case retries must reuse the saved payload and stable case ID.");
expect(caseDialog.includes("savePatientLocalFirst(insertValues, null, { key: requestId, patientId: requestId })"), "Inline patient creation must pass a stable idempotency attempt.");
expect(patientDialog.includes("savePatientLocalFirst(payload, null, { key: requestId, patientId: requestId })"), "Patient form creation must pass a stable idempotency attempt.");
expect(casesLocal.includes("idempotency_key") && casesLocal.includes("enqueueOutbox") && casesLocal.includes("cloud.createCase"), "Desktop case creation must keep the same key across offline replay.");
expect(patientsLocal.includes("createPatientConfirmed") && patientsLocal.includes("assertDistinctPatient"), "Patient creation must use the server RPC and preserve offline duplicate checks.");
expect(realtime.includes("upsertCaseIntoCache(queryClient, minimal)") && realtime.includes("void fetchCaseById(id)"), "Realtime must paint the minimal case row before background hydration.");
expect(identity.includes("samePatientIdentity"), "Patient identity comparison must remain available.");

expect(rpcMigration.includes("CREATE TABLE IF NOT EXISTS public.creation_requests"), "The backend must persist idempotency results.");
expect(rpcMigration.includes("CREATE OR REPLACE FUNCTION public.create_patient_idempotent_v1") && rpcMigration.includes("CREATE OR REPLACE FUNCTION public.create_case_idempotent_v1"), "Both idempotent RPC functions must be defined in the live migration.");
expect(rpcMigration.includes("pg_advisory_xact_lock") && rpcMigration.includes("CREATION_KEY_CONFLICT"), "Concurrent retries must be serialized and conflicting payloads rejected.");
expect(rpcMigration.includes("ON CONFLICT (case_id, component_id) DO NOTHING") && rpcMigration.includes("ON CONFLICT (case_id, case_type_id) DO NOTHING"), "Essential case links must be idempotent.");
expect(rpcMigration.trim() === restoreRpcMigration.trim(), "The live RPC migration must match the restore migration exactly.");
expect(guardMigration.trim() === restoreGuardMigration.trim(), "The live patient-identity guard must match the restore migration exactly.");
expect(restore.includes(rpcMigration.trim()) && backendRestore.includes(rpcMigration.trim()), "Both clean-restore bundles must include the RPC migration.");
expect(restore.includes(guardMigration.trim()) && backendRestore.includes(guardMigration.trim()), "Both clean-restore bundles must include the duplicate guard.");
const guardIndex = manifest.indexOf(guardName);
const rpcIndex = manifest.indexOf(rpcName);
expect(guardIndex >= 0 && rpcIndex > guardIndex && manifest.at(-1)?.includes("self_heal"), "Restore order must apply the duplicate guard, then creation RPCs, then final self-heal.");
console.log("Instant case creation, idempotency, duplicate guard and restore migration checks passed.");

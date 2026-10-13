import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const api = read("src/lib/api.ts");
const desktop = read("src/lib/cases-local-first.ts");
const desktopOffline = read("src/lib/api.desktop.case-offline.ts");
const dialog = read("src/components/NewCaseDialog.tsx");
const realtime = read("src/hooks/use-cases-realtime.ts");
const patients = read("src/lib/patients-local-first.ts");
const patientDialog = read("src/components/PatientFormDialog.tsx");
const migrationName = "20261013150000_patient_duplicate_guard.sql";
const migration = read(`public/restore/migrations/${migrationName}`);
const manifest = JSON.parse(read("public/restore/migrations.json"));

expect(api.includes("id?: string;") && api.includes("idempotentReplay"), "Cloud case creation must reuse a stable ID after an ambiguous response.");
expect(api.includes('onConflict: "case_id,component_id"') && api.includes('onConflict: "case_id,case_type_id"') && api.includes('onConflict: "case_id,stage_id"'), "Essential case links must be idempotent.");
expect(api.includes("Notifications and activity logs are secondary work") && api.includes("return returned;"), "Notifications must not block the confirmed case response.");
expect(desktop.includes("const id = input.id ?? crypto.randomUUID()"), "Desktop outbox must preserve the same case ID on retry.");
expect(desktop.includes("void cloud.fetchCaseById(created.id)"), "Desktop joined cache hydration must run in the background.");
expect(desktopOffline.includes("void (async () => {") && desktopOffline.includes("sendInternalNotificationLocalFirst"), "Offline notifications must not block the local case save.");
expect(dialog.includes("caseCreationPayloadRef.current = createPayload") && dialog.includes("caseCreationAttemptedRef.current = true"), "The case dialog must persist its operation ID/payload before the cloud request.");
expect(dialog.includes("createInlinePatient(newPatientName)") && dialog.includes("newPatientIdentifierValue"), "Inline patient creation must support a duplicate-name identifier.");
expect(dialog.includes("recordInitialAttachmentsInBackground") && dialog.includes("uploadPatientPhotoInBackground"), "Attachments and patient photos must not hold the dialog open.");
const successHandler = dialog.slice(dialog.indexOf("onSuccess: async (createdCase) => {"), dialog.indexOf("const isControlled"));
expect(!successHandler.includes("await qc.invalidateQueries()") && !successHandler.includes("await qc.refetchQueries"), "Case success must not wait for a global refetch.");
expect(realtime.includes("upsertCaseIntoCache(queryClient, minimal)") && realtime.includes("void fetchCaseById(id)"), "Realtime must publish the core row before joined hydration.");
expect(patients.includes("requestId?: string") && patients.includes("normalizePatientName(retry.data.name)"), "Patient creation must be idempotent after a lost response.");
expect(patientDialog.includes("samePatientIdentity") && patientDialog.includes("createPatientIdRef"), "The full patient form must guard duplicates and reuse its creation ID.");
expect(migration.includes("pg_advisory_xact_lock") && migration.includes("PATIENT_DUPLICATE_NAME_REQUIRES_IDENTIFIER") && migration.includes("PATIENT_DUPLICATE_IDENTITY_EXISTS"), "Database must serialize and guard same-name patient creation.");
expect(manifest.includes(migrationName) && manifest.at(-1)?.includes("self_heal"), "The patient guard migration must be registered before the final self-heal migration.");

for (const bundlePath of ["public/restore.sql", "public/restore/backend-restore.sql"]) {
  const bundle = read(bundlePath);
  const guardAt = bundle.indexOf(`-- ===== ${migrationName} =====`);
  const healAt = bundle.indexOf("-- ===== 20260718000001_zzz_self_heal_v2.sql =====");
  expect(guardAt >= 0 && healAt > guardAt && bundle.indexOf(migration.trim()) > guardAt, `${bundlePath} must include the patient guard before self-heal.`);
}

console.log("Instant case creation and patient identity safeguards verified.");

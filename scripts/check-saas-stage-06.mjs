import fs from "node:fs";

const name = "20260928180000_saas_plan_storage_quota_stage06.sql";
const source = fs.readFileSync(`supabase/migrations/${name}`, "utf8");
const copy = fs.readFileSync(`public/restore/migrations/${name}`, "utf8");
const manifest = JSON.parse(fs.readFileSync("public/restore/migrations.json", "utf8"));
const selfHeal = fs.readFileSync("public/restore/migrations/20260718000001_zzz_self_heal_v2.sql", "utf8");
const predecessor = manifest.indexOf("20260926230000_saas_asaas_reconciliation_stage05.sql");
const current = manifest.indexOf(name);

if (source !== copy || current <= predecessor || manifest.at(-1)?.includes("self_heal") !== true) {
  throw new Error("Stage 06 quota migration is absent, out of order, or diverged from restore.");
}
if (!selfHeal.includes("REVOKE ALL ON FUNCTION public.recalculate_clinic_storage_limit(uuid)") ||
    !selfHeal.includes("GRANT EXECUTE ON FUNCTION public.recalculate_clinic_storage_limit(uuid)")) {
  throw new Error("Restore self-heal reopened the private quota function.");
}
if (!selfHeal.includes("REVOKE INSERT, UPDATE, DELETE ON TABLE public.storage_files")) {
  throw new Error("Restore self-heal reopened direct storage ledger writes.");
}
for (const filename of ["stage-06-quota-assertions.sql", "stage-06-quota-rehearsal.sql"]) {
  if (!fs.existsSync(`docs/saas/sql/${filename}`)) {
    throw new Error(`Stage 06 quota verification missing: ${filename}`);
  }
}
console.log("Stage 06 plan quota package verified.");

const uploadName = "20260929120000_saas_storage_upload_guards_stage06.sql";
if (manifest.indexOf(uploadName) !== current + 1 ||
    fs.readFileSync(`supabase/migrations/${uploadName}`, "utf8") !==
      fs.readFileSync(`public/restore/migrations/${uploadName}`, "utf8")) {
  throw new Error("Stage 06 upload guards are absent, out of order or diverged from restore.");
}
for (const filename of ["stage-06-upload-assertions.sql", "stage-06-upload-rehearsal.sql", "stage-06-patient-uploads-rehearsal.sql", "stage-06-concurrency-rehearsal.sh"]) {
  if (!fs.existsSync(`docs/saas/sql/${filename}`)) {
    throw new Error(`Stage 06 upload verification missing: ${filename}`);
  }
}
console.log("Stage 06 upload reservation package verified.");

const recoveryName = "20261003221500_saas_storage_reservation_recovery_stage06.sql";
if (manifest.indexOf(recoveryName) <= manifest.indexOf(uploadName) ||
    fs.readFileSync(`supabase/migrations/${recoveryName}`, "utf8") !==
      fs.readFileSync(`public/restore/migrations/${recoveryName}`, "utf8") ||
    !selfHeal.includes("public.release_storage_upload_reservation(uuid,uuid) FROM PUBLIC, anon")) {
  throw new Error("Stage 06 reservation recovery is absent, diverged or reopened by self-heal.");
}
for (const filename of ["stage-06-reservation-recovery-assertions.sql", "stage-06-reservation-recovery-rehearsal.sql", "stage-06-reservation-recovery-concurrency.sh"]) {
  if (!fs.existsSync(`docs/saas/sql/${filename}`)) throw new Error(`Stage 06 recovery verification missing: ${filename}`);
}
console.log("Stage 06 controlled reservation recovery package verified.");

const patientName = "20261004183500_saas_patient_company_boundary_stage06.sql";
if (manifest.indexOf(patientName) <= manifest.indexOf(recoveryName) ||
    fs.readFileSync(`supabase/migrations/${patientName}`, "utf8") !==
      fs.readFileSync(`public/restore/migrations/${patientName}`, "utf8")) {
  throw new Error("Stage 06 patient company boundary is absent, out of order or diverged from restore.");
}
console.log("Stage 06 patient identity and private file company boundary verified.");

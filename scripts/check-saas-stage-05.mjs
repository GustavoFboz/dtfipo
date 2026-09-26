import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migrationName = "20260926210000_saas_asaas_lifecycle_stage05.sql";
const migration = read("supabase/migrations/" + migrationName);
const manifest = JSON.parse(read("public/restore/migrations.json"));
const backend = read("src/lib/billing/asaas-webhook.server.ts");
const types = read("src/integrations/supabase/types.ts");
const hardening = read("public/restore/migrations/20260718000001_zzz_self_heal_v2.sql");
if (read("public/restore/migrations/" + migrationName) !== migration) {
  throw new Error("Stage 05 restore copy diverged.");
}
if (manifest.indexOf(migrationName) <= manifest.indexOf("20260926190000_saas_asaas_webhook_stage04.sql")) {
  throw new Error("Stage 05 must follow the webhook inbox.");
}
if (!manifest.at(-1)?.includes("self_heal")) {
  throw new Error("Restore hardening must remain last.");
}
for (const name of [
  "billing_apply_asaas_payment_lifecycle",
  "billing_apply_asaas_subscription_lifecycle",
  "billing_list_asaas_expired_grace",
  "billing_suspend_asaas_expired_grace",
]) {
  if (![migration, backend, types, hardening].every((source) => source.includes(name))) {
    throw new Error("Incomplete private Stage 05 contract: " + name);
  }
}
if (!backend.includes("getSubscription") || !backend.includes("getPayment")) {
  throw new Error("Lifecycle events must be reconciled with Asaas.");
}
for (const name of ["stage-05-restore-assertions.sql", "stage-05-lifecycle-rehearsal.sql"]) {
  if (!fs.existsSync("docs/saas/sql/" + name)) {
    throw new Error("Missing lifecycle SQL verification: " + name);
  }
}
console.log("Stage 05 lifecycle contract verified.");

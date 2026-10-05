import fs from "node:fs";

const required = [
  "docs/saas/ADR-001-ASAAS-RECURRING-BILLING.md",
  "docs/saas/GO-LIVE-READINESS-2026-09-29.md",
  "docs/saas/STAGE-07-MASTER-ADMIN.md",
  "docs/saas/STAGE-08-BILLING-CENTER.md",
  "docs/saas/RELEASE-PLAN.md",
  "docs/saas/STAGE-10-PRODUCTION-READINESS.md",
  ".github/workflows/saas-asaas-inbox-worker.yml",
  ".github/workflows/saas-restore-rehearsal.yml",
  "docs/saas/STAGE-09-INCIDENT-RUNBOOK.md",
  "docs/saas/sql/stage-09-operational-health-assertions.sql",
  "docs/saas/sql/stage-09-operational-health-rehearsal.sql",
  "src/lib/master-operational-health.ts",
  "src/components/master/MasterOperationalHealth.tsx",
  "src/lib/billing/asaas-worker-health.server.ts",
  ".github/workflows/saas-asaas-publication-probe.yml",
  "scripts/check-saas-worker-workflows.mjs",
  "supabase/migrations/20261004010000_saas_operational_health_stage09.sql",
];

const missing = required.filter((p) => !fs.existsSync(p));
if (missing.length) throw new Error("Stage 09 missing required artifacts: " + missing.join(", "));

const forbiddenTracked = [".env.production", ".env.prod", "asaas-production.key"];
for (const p of forbiddenTracked) {
  if (fs.existsSync(p)) throw new Error("Stage 09 refuses tracked production secret material: " + p);
}

const protocol = fs.readFileSync("docs/saas/PROTOCOL.md", "utf8");
for (const marker of ["credenciais e webhook separados de Produção", "rollout por feature flag", "runbook de incidentes"]) {
  if (!protocol.includes(marker)) throw new Error("Stage 09 protocol marker missing: " + marker);
}

const readiness = fs.readFileSync("docs/saas/GO-LIVE-READINESS-2026-09-29.md", "utf8").replace(/\s+/g, " ");
for (const marker of ["ASAAS_PRODUCTION_ENABLED=true", "compra real controlada de R$ 1", "não autorizam"]) {
  if (!readiness.includes(marker)) throw new Error("Stage 09 readiness gate missing: " + marker);
}

const migration = fs.readFileSync("supabase/migrations/20261004010000_saas_operational_health_stage09.sql", "utf8");
const restoreMigration = fs.readFileSync("public/restore/migrations/20261004010000_saas_operational_health_stage09.sql", "utf8");
if (migration !== restoreMigration) throw new Error("Stage 09 restore migration differs");
if (/\b(?:update|insert\s+into|delete\s+from)\s+public\.(?:account_subscriptions|billing_payments|billing_plans|storage_files)\b/i.test(migration))
  throw new Error("Operational monitoring may not mutate the financial/storage domain");
const panel = fs.readFileSync("src/components/master/MasterOperationalHealth.tsx", "utf8");
if (panel.includes("integrations/supabase") || !panel.includes("@/lib/master-operational-health"))
  throw new Error("Master monitoring must use the public session-aware facade");
const scheduler = fs.readFileSync(".github/workflows/saas-asaas-inbox-worker.yml", "utf8");
if (!scheduler.includes("vars.BILLING_ENVIRONMENT || 'sandbox'")
  || !scheduler.includes('X-Billing-Environment: %s\\n')
  || !scheduler.includes('$BILLING_PRODUCTION_ENABLED\" != \"true')
  || !scheduler.includes('$BILLING_PRODUCTION_WORKER_TOKEN\" == \"$BILLING_WORKER_TOKEN')
  || !scheduler.includes("monitoringRecorded == true"))
  throw new Error("Stage 09 scheduler must default to Sandbox, guard Production and check monitoring");
const probe = fs.readFileSync("src/lib/billing/asaas-worker-health.server.ts", "utf8");
if (probe.includes("AsaasClient") || probe.includes(".rpc(") || !probe.includes('.from("billing_worker_health")')
  || !probe.includes('request.method !== "GET"')) throw new Error("Worker publication probe must remain a private telemetry read");
console.log("Stage 09 static production and operational gates: OK");

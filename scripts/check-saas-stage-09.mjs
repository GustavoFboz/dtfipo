import fs from "node:fs";

const required = [
  "docs/saas/ADR-001-ASAAS-RECURRING-BILLING.md",
  "docs/saas/GO-LIVE-READINESS-2026-09-29.md",
  "docs/saas/STAGE-07-MASTER-ADMIN.md",
  "docs/saas/STAGE-08-BILLING-CENTER.md",
  ".github/workflows/saas-asaas-inbox-worker.yml",
  ".github/workflows/saas-restore-rehearsal.yml",
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

console.log("Stage 09 static production gates: OK");

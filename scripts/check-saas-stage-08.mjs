import fs from "node:fs";
const migration = "20261003233500_saas_billing_change_requests_stage08.sql";
const source = fs.readFileSync(`supabase/migrations/${migration}`, "utf8");
if (source !== fs.readFileSync(`public/restore/migrations/${migration}`, "utf8")) throw new Error("Stage 08 restore copy diverged");
const manifest = JSON.parse(fs.readFileSync("public/restore/migrations.json", "utf8"));
if (manifest.indexOf(migration) <= manifest.indexOf("20260929141000_saas_billing_center_stage08.sql")
  || !manifest.at(-1).includes("self_heal")) throw new Error("Stage 08 restore order invalid");
for (const marker of ["billing_change_requests_one_pending_company", "BILLING_CHANGE_QUOTE_STALE", "for update", "billing_change_request_events", "awaiting_provider"]) {
  if (!source.includes(marker)) throw new Error(`Stage 08 request guard missing: ${marker}`);
}
const selfHeal = fs.readFileSync(`public/restore/migrations/${manifest.at(-1)}`, "utf8");
if (!selfHeal.includes("REVOKE ALL ON TABLE public.billing_change_requests, public.billing_change_request_events")
  || !selfHeal.includes("public.billing_change_request_quote(uuid,text,text)")) throw new Error("Stage 08 private grants reopened by self-heal");
for (const path of ["src/lib/billing-change-requests.ts", "src/lib/billing-change-requests.test.ts",
  "src/components/billing/BillingChangeRequestsPanel.tsx", "src/components/billing/BillingChangeRequestsPanel.test.tsx",
  "src/components/master/MasterBillingRequests.tsx", "docs/saas/sql/stage-08-change-request-assertions.sql",
  "docs/saas/sql/stage-08-change-request-rehearsal.sql", "docs/saas/sql/stage-08-change-request-concurrency.sh",
  "docs/saas/STAGE-08-BILLING-CENTER.md"]) {
  if (!fs.existsSync(path)) throw new Error(`Stage 08 artifact missing: ${path}`);
}
console.log("Stage 08 private requests and pending-provider boundary: OK");

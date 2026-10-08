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
const cancellation = "20261006040000_saas_cancel_executor_stage08.sql";
const cancelSource = fs.readFileSync(`supabase/migrations/${cancellation}`, "utf8");
if (cancelSource !== fs.readFileSync(`public/restore/migrations/${cancellation}`, "utf8")
  || manifest.indexOf(cancellation) <= manifest.indexOf(migration)) throw new Error("Cancellation restore copy/order diverged");
for (const marker of ["billing_cancel_master_identity", "from auth.sessions", "BILLING_CANCEL_MFA_REQUIRED",
  "BILLING_CANCEL_BUSY", "provider_write_started_at is not null", "reconcile_only", "billing_finish_cancel_request"])
  if (!cancelSource.includes(marker)) throw new Error(`Cancellation guard missing: ${marker}`);
for (const marker of ["public.billing_cancel_master_identity()", "public.platform_master_claim_cancel_request(uuid,text,text,boolean)",
  "public.platform_master_begin_cancel_write(uuid,uuid)", "public.billing_finish_cancel_request(uuid,uuid,jsonb,text)"])
  if (!selfHeal.includes(marker)) throw new Error(`Cancellation grant not resealed: ${marker}`);
console.log("Stage 08 cancellation executor and read-only reconciliation boundary: OK");

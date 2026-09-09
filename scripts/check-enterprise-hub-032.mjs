import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const migration = read("supabase/migrations/20260909033000_enterprise_hub_subscriptions_032.sql");
const radiologyMigration = read("supabase/migrations/20260909034500_radiology_storage_and_access_032.sql");
const subscriptions = read("src/lib/subscriptions.ts");
const gate = read("src/components/SubscriptionGate.tsx");
const hub = read("src/routes/_authenticated/hub.tsx");
const auth = read("src/routes/auth.tsx");
const lp = read("src/routes/lp.tsx");
const tauri = read("src-tauri/tauri.conf.json");
const cargo = read("src-tauri/Cargo.toml");

for (const [needle, message] of [
  ["'professional', 'professional', 'Profissional'", "Professional plan must exist."],
  ["8900, 0, 0, 2", "Professional plan must cost R$89 and allow two company links."],
  ["24900, 1, 8", "Initial company plan limits changed unexpectedly."],
  ["44900, 2, 20", "Growth company plan limits changed unexpectedly."],
  ["74900, 3, 50", "Advanced company plan limits changed unexpectedly."],
  ["536870912000", "Advanced plan must include 500 GB."],
  ["pending_checkout','trialing','active','past_due','grace','suspended','canceled", "Subscription lifecycle must remain explicit."],
  ["billing_apply_subscription_state", "Provider-controlled billing entry point is missing."],
  ["revoke all on function public.billing_apply_subscription_state", "Billing state mutation must not be callable by clients."],
  ["company_sessions", "Company session model is missing."],
  ["professional_accounts", "Professional account model is missing."],
  ["switch_company_context", "Multi-company professional context switch is missing."],
  ["enforce_membership_plan_limits", "Seat/link limits must be enforced on the server."],
]) expect(migration.includes(needle), message);

expect(radiologyMigration.includes("dicom-files"), "Private DICOM storage bucket is missing.");
expect(radiologyMigration.includes("company_has_operational_access"), "DICOM writes must depend on subscription state.");
expect(radiologyMigration.includes("user_can_use_company_session"), "Radiology access must depend on an active session.");

expect(subscriptions.includes("fetchMySubscriptionContext"), "Subscription context client is missing.");
expect(subscriptions.includes("max_company_links"), "Professional company-link entitlement is missing from client types.");
expect(gate.includes("billing_only") && gate.includes("needs_company_link"), "Subscription gate must handle billing and professional-link states.");
expect(gate.includes("Continuar para pagamento"), "Checkout preparation UI is missing.");
expect(hub.includes("subscription_context") && hub.includes("paidSessions"), "Hub environments must come from subscription sessions.");
expect(!hub.includes("if (!hasClinic || laboratory)"), "Professionals without a company must not receive a synthetic laboratory workspace.");
expect(auth.includes("create_professional_account"), "Professional signup must create the paid professional account structure.");
expect(auth.includes("p_plan_code") && auth.includes("p_session_types"), "Company signup must persist selected plan and sessions.");
expect(lp.includes("R$ 89") && lp.includes("R$ 249") && lp.includes("R$ 449") && lp.includes("R$ 749"), "Landing pricing must match 0.3.2 plans.");
expect(lp.includes("Radiologia") && lp.includes("DICOM"), "Landing must position Radiology/DICOM as a first-class session.");
expect(tauri.includes('"version": "0.3.2"'), "Tauri version must be 0.3.2.");
expect(cargo.includes('version = "0.3.2"'), "Rust package version must be 0.3.2.");

console.log("DentalFlow 0.3.2 enterprise hub subscription regressions passed.");

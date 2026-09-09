import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const foundation = read("supabase/migrations/20260909033000_enterprise_hub_subscriptions_032.sql");
const radiology = read("supabase/migrations/20260909034500_radiology_storage_and_access_032.sql");
const companyBilling = read("supabase/migrations/20260909043000_company_only_billing_sandbox_032.sql");
const inviteGuards = read("supabase/migrations/20260909044000_company_invites_and_entitlement_guards_032.sql");
const ipo = read("supabase/migrations/20260909144500_ipo_internal_full_access_032.sql");
const ipoHardening = read("supabase/migrations/20260909145500_ipo_entitlement_hardening_032.sql");
const ipoBillingExclusion = read("supabase/migrations/20260909150000_ipo_billing_exclusion_032.sql");
const subscriptions = read("src/lib/subscriptions.ts");
const gate = read("src/components/SubscriptionGate.tsx");
const hub = read("src/routes/_authenticated/hub.tsx");
const auth = read("src/routes/auth.tsx");
const lp = read("src/routes/lp.tsx");
const tauri = read("src-tauri/tauri.conf.json");
const cargo = read("src-tauri/Cargo.toml");
const desktopGate = read("src/components/DesktopPrimarySyncGate.tsx");

for (const [needle, message] of [
  ["24900, 1, 8", "Initial company plan limits changed unexpectedly."],
  ["44900, 2, 20", "Growth company plan limits changed unexpectedly."],
  ["74900, 3, 50", "Advanced company plan limits changed unexpectedly."],
  ["536870912000", "Advanced plan must include 500 GB."],
  ["pending_checkout','trialing','active','past_due','grace','suspended','canceled", "Subscription lifecycle must remain explicit."],
  ["company_sessions", "Company session model is missing."],
]) expect(foundation.includes(needle), message);

expect(companyBilling.includes("where code = 'professional'"), "Legacy professional billing plan must be disabled.");
expect(companyBilling.includes("Company accounts are the only billable accounts"), "Billing must remain company-only.");
expect(companyBilling.includes("billing_apply_checkout_paid"), "Paid checkout provider entry point is missing.");
expect(companyBilling.includes("revoke all on function public.billing_apply_checkout_paid"), "Paid-state mutation must not be callable by clients.");
expect(companyBilling.includes("billing_payments"), "Payment ledger is missing.");
expect(companyBilling.includes("current_period_end"), "Paid period must remain explicit for automatic access expiry.");

expect(inviteGuards.includes("validate_company_invite_code"), "Professional signup must validate a company code before account creation.");
expect(inviteGuards.includes("enforce_professional_single_company"), "Professional accounts must be restricted to one company.");
expect(inviteGuards.includes("finalize_pending_onboarding"), "Email-confirmation-safe onboarding is missing.");
expect(inviteGuards.includes("billing_test_redeem_token"), "Controlled billing QA enrollment is missing.");
expect(inviteGuards.includes("company_has_operational_access"), "Server-side entitlement guards must depend on paid company access.");

expect(radiology.includes("dicom-files"), "Private DICOM storage bucket is missing.");
expect(radiology.includes("user_can_use_company_session"), "Radiology access must depend on an active company session.");

for (const needle of [
  "billing_exempt boolean",
  "is_internal_full_access_company",
  "company_advanced",
  "9999-12-31 23:59:59+00",
  "array['laboratory','clinic','radiology']",
  "536870912000",
  "sync_company_legacy_modules",
  "'COMPANY',uid",
  "protect_internal_subscription",
  "prevent_internal_subscription_delete",
  "não pode ser suspensa pelo sandbox",
]) expect(ipo.includes(needle), `IPO permanent full-access invariant missing: ${needle}`);
expect(!ipo.includes("values(trim(p_name),lower(coalesce(p_kind,'empresa')),'IPO',uid"), "Ordinary company creation must never tag a customer as IPO.");

expect(ipoHardening.includes("protect_internal_company_session"), "IPO sessions must be protected against billing downgrades.");
expect(ipoHardening.includes("prevent_internal_company_session_delete"), "IPO sessions must not be deletable.");
expect(ipoHardening.includes("ipo_internal_invariant_report"), "IPO rollout diagnostic is missing.");
expect(ipoHardening.includes("tg_op='INSERT'"), "IPO subscription trigger must be INSERT-safe and not dereference OLD.");
expect(ipoBillingExclusion.includes("A conta interna IPO possui acesso completo permanente"), "IPO checkout must be rejected server-side.");
expect(ipoBillingExclusion.includes("is_internal_full_access_company(p_clinic_id)"), "IPO billing exclusion must be enforced by authoritative company flag.");

expect(subscriptions.includes("fetchMySubscriptionContext"), "Subscription context client is missing.");
expect(subscriptions.includes("validateCompanyInviteCode"), "Professional invite validation client is missing.");
expect(gate.includes('effective_access === "full"') && gate.includes("return <BillingRequired"), "Subscription gate must allow only full access and route every other paid state to billing.");
expect(gate.includes("Gerar checkout"), "Checkout preparation UI is missing.");
expect(hub.includes("subscription_context") && hub.includes("paidSessions"), "Hub environments must come from paid company sessions.");
expect(!hub.includes("if (!hasClinic || laboratory)"), "Users must not receive a synthetic laboratory workspace.");
expect(auth.includes("validateProfessionalInvite"), "Professional signup must validate the company before sign-up.");
expect(auth.includes("pending_invite_code"), "Professional onboarding must persist the validated company code through e-mail confirmation.");
expect(auth.includes("finalizePendingOnboarding"), "Onboarding finalization must run after login/sign-up.");

expect(!lp.includes("R$ 89"), "Landing page must not sell a standalone professional plan.");
expect(lp.includes("R$ 249") && lp.includes("R$ 449") && lp.includes("R$ 749"), "Landing pricing must expose only the three company plans.");
expect(lp.includes("Profissionais entram pela empresa") || lp.includes("código da empresa"), "Landing must position professionals as company members, not independent subscribers.");
expect(lp.includes("Radiologia") && lp.includes("DICOM"), "Landing must position Radiology/DICOM as a first-class session.");

expect(tauri.includes('"version": "0.3.3"'), "Tauri version must be 0.3.3.");
expect(cargo.includes('version = "0.3.3"'), "Rust package version must be 0.3.3.");
expect(desktopGate.includes("DentalFlow Desktop 0.3.3"), "Desktop sync UI must identify the 0.3.3 release.");

console.log("DentalFlow 0.3.3 company billing, professional membership and IPO invariants passed.");

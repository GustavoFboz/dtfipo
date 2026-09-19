import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const foundationPath = "supabase/migrations/20260909033000_enterprise_hub_subscriptions_032.sql";
const billingPath = "supabase/migrations/20260909043000_company_only_billing_sandbox_032.sql";
const invitePath = "supabase/migrations/20260909044000_company_invites_and_entitlement_guards_032.sql";
const ipoPath = "supabase/migrations/20260909145500_ipo_entitlement_hardening_032.sql";
const foundation = read(foundationPath);
const billing = read(billingPath);
const invites = read(invitePath);
const ipo = read(ipoPath);
const subscriptions = read("src/lib/subscriptions.ts");
const desktopSubscriptions = read("src/lib/subscriptions.desktop.ts");
const gate = read("src/components/SubscriptionGate.tsx");
const restoreManifest = read("public/restore/migrations.json");
const generatedTypes = read("src/integrations/supabase/types.ts");

for (const file of [
  foundationPath,
  billingPath,
  invitePath,
  ipoPath,
  "docs/saas/PROTOCOL.md",
  "docs/saas/STAGE-00-BASELINE-AUDIT.md",
  "docs/saas/sql/stage-00-live-audit.sql",
]) expect(fs.existsSync(file), `Arquivo obrigatório ausente: ${file}`);

for (const [needle, message] of [
  ["'company_initial'", "Plano Inicial ausente."],
  ["24900, 1, 8", "Preço/limites do plano Inicial divergiram."],
  ["44900, 2, 20", "Preço/limites do plano Crescimento divergiram."],
  ["74900, 3, 50", "Preço/limites do plano Avançado divergiram."],
  ["create table if not exists public.billing_events", "Inbox de eventos ausente."],
  ["unique(provider, provider_event_id)", "Idempotência de eventos ausente."],
]) expect(foundation.includes(needle), message);

expect(billing.includes("Company accounts are the only billable accounts"), "Cobrança deixou de ser company-only.");
expect(billing.includes("create table if not exists public.billing_payments"), "Ledger de pagamentos ausente.");
expect(billing.includes("billing_apply_checkout_paid"), "RPC autoritativa de pagamento ausente.");
expect(billing.includes("grant execute on function public.billing_apply_checkout_paid") && billing.includes("to service_role"), "Aplicação de pagamento não está restrita a service_role.");
expect(invites.includes("billing_test_redeem_token"), "Sandbox controlado por token ausente.");
expect(ipo.includes("ipo_internal_invariant_report"), "Diagnóstico das invariantes IPO ausente.");
expect(subscriptions.includes("fetchMySubscriptionContext"), "Contrato cliente de assinatura ausente.");
expect(gate.includes('effective_access === "full"'), "Gate não exige acesso integral.");
expect(desktopSubscriptions.includes("fetchVerifiedCloudContext") && desktopSubscriptions.includes("SUBSCRIPTION_CACHE_NAMESPACE"), "Snapshot offline verificado do Windows ausente.");
expect(generatedTypes.includes("billing_events:") && generatedTypes.includes("billing_payments:"), "Tipos gerados não incluem o domínio SaaS.");

const apiFiles = filesUnder("src/routes/api").map((file) => file.replaceAll("\\", "/"));
const sourceFiles = filesUnder("src").filter((file) => /\.(ts|tsx)$/.test(file));
const sourceText = sourceFiles.map(read).join("\n");
const gaps = [
  ["restore_parity", !restoreManifest.includes("20260909033000_enterprise_hub_subscriptions_032.sql")],
  ["billing_webhook_endpoint", !apiFiles.some((file) => /(billing|asaas).*(webhook)|webhook.*(billing|asaas)/i.test(file))],
  ["provider_adapter", !sourceText.match(/\bAsaas\b/)],
  ["platform_master_role", !sourceText.match(/platform_admin|master_admin/i)],
  ["customer_billing_history_ui", !sourceFiles.filter((file) => !file.endsWith("types.ts")).some((file) => read(file).includes("billing_payments"))],
  ["android_entitlement_adapter", !filesUnder("src/lib").some((file) => /subscriptions\.mobile\.(ts|tsx)$/.test(file))],
  ["company_billing_profile", !/billing_email|legal_name|tax_id|cnpj/i.test(generatedTypes.slice(generatedTypes.indexOf("      clinics:"), generatedTypes.indexOf("      company_sessions:")))],
];

expect(!/VITE_(ASAAS|BILLING).*(KEY|TOKEN|SECRET)/.test(sourceText), "Credencial financeira não pode ser exposta por VITE_*.");

console.log("DentalFlow SaaS Stage 00 baseline invariants: OK");
for (const [name, open] of gaps) console.log(`${open ? "GAP" : "READY"}: ${name}`);

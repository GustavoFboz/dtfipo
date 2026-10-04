import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const migrationName = "20260920203000_saas_asaas_adapter_stage02.sql";
const migration = read(path.join("supabase/migrations", migrationName));
const restoreMigration = read(path.join("public/restore/migrations", migrationName));
const restoreManifest = JSON.parse(read("public/restore/migrations.json"));
const restoreSelfHeal = read("public/restore/migrations/20260718000001_zzz_self_heal_v2.sql");
const client = read("src/lib/billing/asaas.server.ts");
const provisioning = read("src/lib/billing/asaas-provisioning.server.ts");
const clientTests = read("src/lib/billing/asaas.server.test.ts");
const provisioningTests = read("src/lib/billing/asaas-provisioning.server.test.ts");
const stage = read("docs/saas/STAGE-02-ASAAS-SANDBOX.md");
const restoreAssertions = read("docs/saas/sql/stage-02-restore-assertions.sql");
const generatedTypes = read("src/integrations/supabase/types.ts");

expect(restoreMigration === migration, "Cópia da migration Stage 02 divergiu do schema canônico.");
expect(
  restoreManifest.includes(migrationName),
  "Manifesto de restore não contém a migration Stage 02.",
);
expect(
  restoreManifest.at(-1)?.includes("self_heal"),
  "Self-heal deixou de ser a última migration de restore.",
);

for (const [needle, message] of [
  [
    "create table if not exists public.billing_provider_operations",
    "Ledger de idempotência ausente.",
  ],
  ["billing_provider_operations_idempotency_uidx", "Chave idempotente durável ausente."],
  ["billing_claim_provider_operation", "Claim atômico de operação ausente."],
  ["billing_finish_provider_operation", "Finalização de operação ausente."],
  ["billing_get_asaas_provisioning_context", "Contexto fiscal privado ausente."],
  ["billing_bind_asaas_subscription", "Vínculo privado da assinatura ausente."],
  ["manual_review", "Resultado incerto não exige revisão manual."],
  ["BILLING_PROVIDER_CUSTOMER_CONFLICT", "Vínculo de cliente pode ser sobrescrito."],
  ["BILLING_PROVIDER_SUBSCRIPTION_CONFLICT", "Vínculo de assinatura pode ser sobrescrito."],
  ["from public, anon, authenticated", "Revogação explícita das RPCs ausente."],
])
  expect(migration.toLowerCase().includes(needle.toLowerCase()), message);

for (const name of [
  "billing_provider_operations",
  "billing_claim_provider_operation",
  "billing_finish_provider_operation",
  "billing_get_asaas_provisioning_context",
  "billing_bind_asaas_subscription",
]) {
  expect(restoreSelfHeal.includes(name), `Self-heal não protege ${name} após grants legados.`);
  expect(generatedTypes.includes(name), `Tipos Supabase não incluem ${name}.`);
}

for (const [needle, message] of [
  ['sandbox: "https://api-sandbox.asaas.com/v3"', "Host oficial Sandbox ausente."],
  ['production: "https://api.asaas.com/v3"', "Host oficial Produção ausente."],
  ['"User-Agent": this.config.userAgent', "User-Agent obrigatório ausente."],
  ["access_token: this.config.apiKey", "Header access_token ausente."],
  ["AbortController", "Timeout cancelável ausente."],
  ["RateLimit-Reset", "RateLimit-Reset não é respeitado."],
  ['method === "GET" ? this.config.maxGetRetries + 1 : 1', "POST pode estar recebendo retry cego."],
  ["ASAAS_PRODUCTION_ENABLED", "Trava explícita de Produção ausente."],
])
  expect(client.includes(needle), message);

for (const [needle, message] of [
  ["dentalflow:company:", "Referência determinística de empresa ausente."],
  ["dentalflow:subscription:", "Referência determinística de assinatura ausente."],
  ["findCustomersByExternalReference", "Reconciliação de cliente ausente."],
  ["findSubscriptionsByExternalReference", "Reconciliação de assinatura ausente."],
  ["ASAAS_CUSTOMER_OUTCOME_UNCERTAIN", "Resultado incerto de cliente não bloqueia recriação."],
  [
    "ASAAS_SUBSCRIPTION_OUTCOME_UNCERTAIN",
    "Resultado incerto de assinatura não bloqueia recriação.",
  ],
  ["paymentConfirmed: false", "Criação da assinatura pode estar confirmando pagamento."],
  ["PROVIDER_OPERATION_REVIEW_REQUIRED", "Operação incerta pode ser repetida automaticamente."],
  ["cycle: ASAAS_BILLING_CYCLE", "Ciclo mensal canônico ausente."],
])
  expect(provisioning.includes(needle), message);

expect(clientTests.includes("não repete POST"), "Teste de POST inconclusivo sem retry ausente.");
expect(
  provisioningTests.includes("reconcilia por externalReference"),
  "Teste de reconciliação ausente.",
);
expect(provisioningTests.includes("lease está ativa"), "Teste de concorrência por lease ausente.");
expect(
  stage.includes("homologação real no Asaas Sandbox pendente"),
  "Stage 02 foi marcada concluída sem evidência real.",
);
expect(
  restoreAssertions.includes("begin transaction read only;"),
  "Asserções de restore devem ser somente leitura.",
);

const sourceFiles = [];
function collect(root) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) sourceFiles.push(full);
  }
}
collect("src");
const source = sourceFiles.map(read).join("\n");
expect(
  !/VITE_(ASAAS|BILLING).*(KEY|TOKEN|SECRET)/.test(source),
  "Credencial financeira não pode usar VITE_*.",
);
expect(
  !source.includes("api-sandbox.asaas.com") || client.includes("api-sandbox.asaas.com"),
  "Host Asaas apareceu fora do adapter.",
);

console.log("DentalFlow SaaS Stage 02 repository contract: OK");
console.log("READY: backend_adapter_and_idempotency");
console.log("PENDING: real_asaas_sandbox_evidence");

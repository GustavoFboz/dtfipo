import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const migrationName = "20260921210000_saas_asaas_checkout_stage03.sql";
const migration = read(path.join("supabase/migrations", migrationName));
const restoreMigration = read(path.join("public/restore/migrations", migrationName));
const restoreManifest = JSON.parse(read("public/restore/migrations.json"));
const restoreSelfHeal = read("public/restore/migrations/20260718000001_zzz_self_heal_v2.sql");
const server = read("src/lib/billing/asaas-checkout.server.ts");
const route = read("src/routes/api/billing/asaas-checkout.ts");
const client = read("src/lib/subscriptions.ts");
const screen = read("src/components/SubscriptionGate.tsx");
const panel = read("src/components/billing/BillingCheckoutPanel.tsx");
const asaasClient = read("src/lib/billing/asaas.server.ts");
const tests = read("src/lib/billing/asaas-checkout.server.test.ts");
const generatedTypes = read("src/integrations/supabase/types.ts");
const stage = read("docs/saas/STAGE-03-REAL-CHECKOUT.md");
const restoreAssertions = read("docs/saas/sql/stage-03-restore-assertions.sql");
const liveVerification = read("docs/saas/sql/stage-03-live-verification.sql");

expect(restoreMigration === migration, "Cópia da migration Stage 03 divergiu do schema canônico.");
expect(
  restoreManifest.includes(migrationName),
  "Manifesto de restore não contém a migration Stage 03.",
);
expect(
  restoreManifest.indexOf(migrationName) < restoreManifest.length - 1,
  "Migration Stage 03 precisa executar antes do self-heal.",
);
expect(
  restoreManifest.at(-1)?.includes("self_heal"),
  "Self-heal deixou de ser a última migration de restore.",
);

for (const [needle, message] of [
  ["billing_get_checkout_provisioning_context", "Contexto privado do checkout ausente."],
  ["billing_mark_asaas_checkout_ready", "Persistência privada do checkout ausente."],
  ["provider_created", "Estado de handoff do provedor ausente."],
  ["BILLING_PROVIDER_CHECKOUT_LOCKED", "Plano/sessões não ficam bloqueados após o handoff."],
  ["provider_payment_url", "URL validada da cobrança não é persistida."],
  ["payment_confirmed', false", "Migration pode estar tratando criação como pagamento."],
  ["from public, anon, authenticated", "Revogação explícita das RPCs privadas ausente."],
]) {
  expect(migration.toLowerCase().includes(needle.toLowerCase()), message);
}

for (const name of [
  "billing_get_checkout_provisioning_context",
  "billing_mark_asaas_checkout_ready",
]) {
  expect(restoreSelfHeal.includes(name), `Self-heal não protege ${name} após grants legados.`);
  expect(generatedTypes.includes(name), `Tipos Supabase não incluem ${name}.`);
}

for (const [needle, message] of [
  ["loadAuthenticatedUserId", "Endpoint não valida o usuário autenticado."],
  ["supabaseAdmin.auth.getUser(token)", "Token não é validado no servidor."],
  ["MAX_REQUEST_BYTES", "Endpoint não limita o corpo da requisição."],
  ["isAllowedRequestOrigin", "Endpoint não valida a origem da requisição."],
  ["createSupabaseAsaasProvisioningStore", "Endpoint ignora o ledger idempotente."],
  ["waitForInitialPayment", "Endpoint não reconcilia a primeira cobrança."],
  ["paymentConfirmed: false", "Resposta do endpoint pode confirmar pagamento."],
]) {
  expect(server.includes(needle), message);
}

expect(
  route.includes('createFileRoute("/api/billing/asaas-checkout")'),
  "Rota do checkout ausente.",
);
expect(
  route.includes("asaas-checkout.server") && route.includes("await import("),
  "Código financeiro do servidor pode entrar no bundle do navegador.",
);
expect(route.includes("OPTIONS") && route.includes("POST"), "Rota não possui preflight e POST.");

for (const [needle, message] of [
  ["fetchCompanyBillingProfile", "Cliente do perfil fiscal ausente."],
  ["upsertCompanyBillingProfile", "Gravação protegida do perfil fiscal ausente."],
  ["createAsaasCheckout", "Cliente do endpoint Asaas ausente."],
  ["openAsaasCheckoutPayment", "Abertura multiplataforma do pagamento ausente."],
  ["Capacitor.isNativePlatform()", "Android não usa o navegador externo."],
  ["openDesktopExternalUrl", "Windows não usa o navegador externo seguro."],
]) {
  expect(client.includes(needle), message);
}

expect(panel.includes("Assinatura mensal pelo Asaas"), "Tela real do checkout não está conectada.");
expect(
  panel.includes("pagamento ainda está pendente"),
  "Tela pode induzir confirmação antecipada.",
);
expect(
  panel.includes("CPF/CNPJ completo") && panel.includes("não volta para a tela"),
  "Aviso de proteção fiscal ausente.",
);
expect(
  !screen.includes("Simular pagamento aprovado"),
  "Ativação financeira simulada continua visível.",
);
expect(
  !screen.includes("billing_test_redeem_token"),
  "Token QA continua conectado à tela comercial.",
);

expect(
  asaasClient.includes("listSubscriptionPayments") && asaasClient.includes("validatePaymentUrl"),
  "Adapter não valida a cobrança e sua URL pública.",
);
expect(tests.includes("assinatura, cliente e valor"), "Teste de vínculo da cobrança ausente.");
expect(tests.includes("validação do ambiente"), "Teste da allowlist da URL ausente.");

expect(
  stage.includes("homologação real no Asaas Sandbox pendente"),
  "Stage 03 foi marcada concluída sem evidência real.",
);
expect(
  restoreAssertions.includes("begin transaction read only;"),
  "Asserções de restore devem ser somente leitura.",
);
expect(
  liveVerification.includes("begin transaction read only;"),
  "Verificação live deve ser somente leitura.",
);
expect(
  liveVerification.includes("with function_oids as") &&
    liveVerification.includes("has_function_privilege('anon', checkout_context, 'execute')"),
  "Verificação live deve tolerar funções ausentes e retornar checks falsos sem abortar.",
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

console.log("DentalFlow SaaS Stage 03 repository contract: OK");
console.log("READY: authenticated_asaas_checkout_handoff");
console.log("PENDING: real_asaas_sandbox_checkout_evidence");

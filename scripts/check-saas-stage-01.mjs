import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const migrationName = "20260919213000_saas_contract_recovery_stage01.sql";
const prerequisitesName = "20260919212500_saas_restore_prerequisites_stage01.sql";
const migrationPath = path.join("supabase/migrations", migrationName);
const migration = read(migrationPath);
const prerequisites = read(path.join("supabase/migrations", prerequisitesName));
const restoreManifest = JSON.parse(read("public/restore/migrations.json"));
const restoreMigration = read(path.join("public/restore/migrations", migrationName));
const restorePrerequisites = read(path.join("public/restore/migrations", prerequisitesName));
const restoreSelfHeal = read("public/restore/migrations/20260718000001_zzz_self_heal_v2.sql");
const contract = read("src/lib/billing/asaas-contract.ts");
const mapping = read("docs/saas/ASAAS-STATE-MAPPING.md");
const stage = read("docs/saas/STAGE-01-CONTRACT-RECOVERY.md");
const audit = read("docs/saas/sql/stage-01-live-audit.sql");
const liveEvidencePath = "docs/saas/evidence/STAGE-01-LIVE-AUDIT-2026-09-19.md";
const liveEvidence = read(liveEvidencePath);
const restoreEvidencePath = "docs/saas/evidence/STAGE-01-CLEAN-RESTORE-2026-09-20.md";
const restoreEvidence = read(restoreEvidencePath);
const generatedTypes = read("src/integrations/supabase/types.ts");

for (const [needle, message] of [
  ["create table if not exists public.company_billing_profiles", "Perfil fiscal canônico ausente."],
  ["create table if not exists public.billing_provider_customers", "Identidade canônica do cliente Asaas ausente."],
  ["provider_environment", "Namespace Sandbox/Produção ausente."],
  ["billing_cycle text not null default 'MONTHLY'", "Ciclo mensal canônico ausente."],
  ["billing_provider_customers_provider_customer_uidx", "Cliente Asaas canônico não é único por ambiente."],
  ["account_subscriptions_provider_subscription_uidx", "Assinatura externa não é única por ambiente."],
  ["billing_events_provider_event_uidx", "Evento externo não é idempotente por ambiente."],
  ["billing_get_company_profile", "RPC mascarada de perfil fiscal ausente."],
  ["billing_upsert_company_profile", "RPC autorizada de perfil fiscal ausente."],
  ["billing_bind_asaas_customer", "Vínculo service-role do cliente Asaas ausente."],
  ["billing_valid_br_tax_id", "Validação dos dígitos de CPF/CNPJ ausente."],
  ["tax_id_masked", "CPF/CNPJ não está mascarado na saída ao cliente."],
  ["revoke all on table public.company_billing_profiles from public, anon, authenticated", "Tabela fiscal possui acesso direto de cliente."],
]) expect(migration.toLowerCase().includes(needle.toLowerCase()), message);

expect(prerequisites.includes("create table if not exists public.proteticos"), "Pré-requisito neutro de especialistas ausente.");
expect(prerequisites.includes("public.is_clinic_member"), "Helper de associação empresarial ausente no restore.");
expect(prerequisites.includes("requested_by"), "Pré-requisito de solicitante ausente antes da gestão de storage.");
expect(prerequisites.includes("alter type public.app_role add value if not exists 'SOLICITANTE'"), "Papel solicitante ausente dos pré-requisitos do restore.");
expect(restoreMigration === migration, "Cópia da migration Stage 01 divergiu do schema canônico.");
expect(restorePrerequisites === prerequisites, "Cópia dos pré-requisitos Stage 01 divergiu do schema canônico.");

for (const name of [
  prerequisitesName,
  "20260905014000_storage_entitlements_and_ipo_courtesy.sql",
  "20260909033000_enterprise_hub_subscriptions_032.sql",
  "20260909043000_company_only_billing_sandbox_032.sql",
  "20260909044000_company_invites_and_entitlement_guards_032.sql",
  "20260909145500_ipo_entitlement_hardening_032.sql",
  migrationName,
]) expect(restoreManifest.includes(name), `Manifesto de restore não contém ${name}.`);

expect(restoreManifest.at(-1)?.includes("self_heal"), "Self-heal deixou de ser a última migration de restore.");
expect(
  restoreSelfHeal.lastIndexOf("REVOKE ALL ON FUNCTION public.billing_bind_asaas_customer")
    > restoreSelfHeal.lastIndexOf("GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role"),
  "Self-heal reabre RPC financeira depois do hardening final.",
);
expect(
  restoreSelfHeal.includes("REVOKE ALL ON FUNCTION public.billing_apply_checkout_paid")
    && restoreSelfHeal.includes("REVOKE ALL ON FUNCTION public.billing_apply_subscription_state"),
  "Self-heal não restaura a fronteira service_role das mutações financeiras.",
);
expect(
  restoreSelfHeal.includes("DROP FUNCTION IF EXISTS _restore.exec_sql(text)")
    && restoreSelfHeal.includes("DROP SCHEMA IF EXISTS _restore"),
  "Self-heal preserva um executor SQL privilegiado de uso exclusivo do restore.",
);
expect(contract.includes('PAYMENT_CONFIRMED: "paid"'), "PAYMENT_CONFIRMED deixou de ativar período pago.");
expect(contract.includes('PAYMENT_RECEIVED: "paid"'), "PAYMENT_RECEIVED deixou de ativar período pago.");
expect(contract.includes('PAYMENT_OVERDUE: "past_due"'), "Atraso Asaas perdeu o mapeamento canônico.");
expect(contract.includes('PAYMENT_CHARGEBACK_REQUESTED: "reversed"'), "Chargeback perdeu o mapeamento de reversão.");
expect(mapping.includes("Evento desconhecido") && mapping.includes("nunca concede acesso"), "Fail-closed para evento desconhecido não está documentado.");
expect(stage.includes("concluída — schema vivo, tipos e restauração limpa validados; auditorias aprovadas"), "Status da Etapa 01 não registra sua conclusão.");
expect(audit.includes("begin transaction read only;") && audit.includes("rollback;"), "Auditoria Stage 01 deve permanecer somente leitura.");
expect(audit.includes("stage_01_audit_report"), "Auditoria Stage 01 não gera relatório único sanitizado.");
expect(
  liveEvidence.includes("12292cc25e6f87464967de22b74456d9999bb753b92b8df156424fe7df11225f"),
  "Checksum da evidência viva Stage 01 divergiu.",
);
expect(liveEvidence.includes("A aplicação viva e a auditoria da Etapa 01 estão aprovadas"), "Evidência viva não aprova formalmente a Etapa 01.");
expect(liveEvidence.includes("não foi versionado"), "Evidência deve registrar que o CSV bruto não foi versionado.");
expect(
  restoreEvidence.includes("https://github.com/GustavoFboz/dtfipo/actions/runs/35493807420"),
  "Evidência da restauração limpa não referencia a execução aprovada.",
);
expect(
  restoreEvidence.includes("7e62fa397c87902277bbb405c04f015ba855299b"),
  "Evidência da restauração limpa divergiu do commit ensaiado.",
);
expect(
  restoreEvidence.includes("0efd2898131b18fec309b1aad6d71c46a449d037b2bd5c68b224781ed2d93df0"),
  "Digest do artefato da restauração limpa divergiu.",
);
expect(restoreEvidence.includes('"result": "passed"'), "Asserções da restauração limpa não estão aprovadas.");
expect(restoreEvidence.includes("12/12 colunas") && restoreEvidence.includes("6/6 índices"), "Resumo da auditoria restaurada está incompleto.");

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
expect(!/VITE_(ASAAS|BILLING).*(KEY|TOKEN|SECRET)/.test(source), "Credencial financeira não pode usar VITE_*.");

const typesReady = generatedTypes.includes("company_billing_profiles:")
  && generatedTypes.includes("provider_environment:")
  && generatedTypes.includes("billing_cycle:");

console.log("DentalFlow SaaS Stage 01 repository contract: OK");
console.log(`${typesReady ? "READY" : "PENDING_LIVE_SCHEMA"}: generated_supabase_types`);
console.log("READY: lovable_cloud_stage_01");
console.log("READY: clean_database_restore");

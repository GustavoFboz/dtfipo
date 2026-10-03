import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Prepare a reviewed migration; this command never connects to Asaas or the DB.
const root = process.cwd();
const allowedPlans = new Set(["company_initial", "company_growth", "company_advanced"]);
const options = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (key === "--dry-run") {
    options.set(key, true);
    continue;
  }
  if (!["--plan", "--from", "--to", "--timestamp"].includes(key) ||
      !process.argv[i + 1] || options.has(key)) {
    throw new Error("Uso: --plan company_initial --from 249,00 --to 299,00 [--timestamp AAAAMMDDHHMMSS] [--dry-run]");
  }
  options.set(key, process.argv[++i]);
}

const plan = options.get("--plan");
if (!allowedPlans.has(plan)) throw new Error("Plano empresarial inválido.");

function cents(label) {
  const raw = options.get(label);
  if (typeof raw !== "string" || !/^\d{1,6}(?:[,.]\d{1,2})?$/.test(raw)) {
    throw new Error(`${label}: informe reais como 249,00 ou 1,00.`);
  }
  const [whole, fraction = ""] = raw.replace(",", ".").split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}: o valor deve ser positivo.`);
  return value;
}

const previous = cents("--from");
const next = cents("--to");
if (previous === next) throw new Error("O preço anterior e o novo preço são iguais.");
const manifestPath = path.join(root, "public/restore/migrations.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const final = manifest.at(-1);
if (!final?.includes("self_heal")) throw new Error("Manifesto de restauração inesperado.");
const latestMigration = manifest.at(-2)?.slice(0, 14);
const now = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const nextAfterLatest = new Date(Date.UTC(
  Number(latestMigration.slice(0, 4)), Number(latestMigration.slice(4, 6)) - 1,
  Number(latestMigration.slice(6, 8)), Number(latestMigration.slice(8, 10)),
  Number(latestMigration.slice(10, 12)), Number(latestMigration.slice(12, 14)) + 1,
)).toISOString().replace(/[-:T]/g, "").slice(0, 14);
const timestamp = options.get("--timestamp") ?? (now > latestMigration ? now : nextAfterLatest);
if (!/^20\d{12}$/.test(timestamp)) throw new Error("Timestamp inválido; use AAAAMMDDHHMMSS.");
if (timestamp <= latestMigration) throw new Error(`Timestamp deve ser posterior a ${latestMigration}.`);
const filename = `${timestamp}_saas_plan_price_${plan}_${next}c.sql`;
const migrationPath = path.join(root, "supabase/migrations", filename);
const restorePath = path.join(root, "public/restore/migrations", filename);
const sql = `-- Preço do catálogo para NOVOS checkouts. Assinaturas Asaas já criadas\n` +
  `-- mantêm o valor do seu contrato; alterações no provedor exigem ação separada.\n` +
  `update public.billing_plans set monthly_price_cents = ${next}\n` +
  `where code = '${plan}' and account_scope = 'company'\n` +
  `  and monthly_price_cents = ${previous};\n` +
  `do $$ begin\n` +
  `  if (select monthly_price_cents from public.billing_plans where code = '${plan}') <> ${next} then\n` +
  `    raise exception 'BILLING_PLAN_PRICE_EXPECTED_${previous}_CENTS';\n` +
  `  end if;\n` +
  `end $$;\nnotify pgrst, 'reload schema';\n`;

if (options.has("--dry-run")) {
  process.stdout.write(`${filename}\n${sql}`);
  process.exit(0);
}
if (fs.existsSync(migrationPath) || fs.existsSync(restorePath)) {
  throw new Error(`A migration ${filename} já existe; use um timestamp novo.`);
}
if (manifest.includes(filename)) {
  throw new Error("Manifesto de restauração inesperado.");
}
fs.writeFileSync(migrationPath, sql, { flag: "wx" });
fs.writeFileSync(restorePath, sql, { flag: "wx" });
manifest.splice(manifest.length - 1, 0, filename);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const built = spawnSync(process.execPath, ["scripts/build-restore-bundle.mjs"], {
  cwd: root, stdio: "inherit",
});
if (built.status !== 0) throw new Error("Falha ao gerar o pacote de restauração.");
console.log(`Migration preparada: ${filename}. Revisar, ensaiar e aplicar em transação.`);

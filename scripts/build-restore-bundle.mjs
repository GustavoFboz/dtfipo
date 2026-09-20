import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "public/restore/migrations.json");
const migrationsDir = path.join(root, "public/restore/migrations");
const targets = [
  path.join(root, "public/restore.sql"),
  path.join(root, "public/restore/backend-restore.sql"),
];
const checkOnly = process.argv.includes("--check");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest) || manifest.length === 0) {
  throw new Error("Restore manifest must be a non-empty JSON array.");
}

const seen = new Set();
for (const name of manifest) {
  if (typeof name !== "string" || !/^[A-Za-z0-9_.-]+\.sql$/.test(name)) {
    throw new Error(`Unsafe restore migration name: ${String(name)}`);
  }
  if (seen.has(name)) throw new Error(`Duplicate restore migration: ${name}`);
  seen.add(name);
  if (!fs.existsSync(path.join(migrationsDir, name))) {
    throw new Error(`Restore migration is missing: ${name}`);
  }
}

const expected = manifest
  .map((name) => {
    const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8").trim();
    return `\n-- ===== ${name} =====\n\n${sql}\n`;
  })
  .join("");

for (const target of targets) {
  if (checkOnly) {
    const actual = fs.readFileSync(target, "utf8");
    if (actual !== expected) {
      throw new Error(`${path.relative(root, target)} is stale. Run npm run build:restore.`);
    }
  } else {
    fs.writeFileSync(target, expected);
  }
}

const finalMigration = manifest.at(-1);
if (!finalMigration?.includes("self_heal")) {
  throw new Error("The final restore migration must be the idempotent self-heal.");
}

console.log(
  `DentalFlow restore bundle ${checkOnly ? "verified" : "generated"}: ${manifest.length} migrations, final=${finalMigration}`,
);

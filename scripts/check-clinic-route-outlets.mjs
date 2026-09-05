import { readFile } from "node:fs/promises";

const checks = [
  {
    file: "src/routes/_authenticated/clinica.tsx",
    description: "the Clinic parent route must render nested pages",
    required: ["Outlet", 'normalizedPath !== "/clinica"'],
  },
  {
    file: "src/routes/_authenticated/clinica.pacientes.tsx",
    description: "the Patients parent route must render patient detail pages",
    required: ["Outlet", 'normalizedPath !== "/clinica/pacientes"'],
  },
];

let failed = false;

for (const check of checks) {
  const source = await readFile(check.file, "utf8");
  const missing = check.required.filter((token) => !source.includes(token));
  if (missing.length) {
    failed = true;
    console.error(`FAIL: ${check.description}`);
    console.error(`  ${check.file} is missing: ${missing.join(", ")}`);
  } else {
    console.log(`OK: ${check.description}`);
  }
}

if (failed) process.exit(1);

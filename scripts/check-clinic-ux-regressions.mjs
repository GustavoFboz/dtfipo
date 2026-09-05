import { readFileSync } from "node:fs";

function requireContains(file, needle, message) {
  const source = readFileSync(file, "utf8");
  if (!source.includes(needle)) throw new Error(`${message} (${file})`);
  console.log(`OK: ${message}`);
  return source;
}

const agenda = requireContains(
  "src/routes/_authenticated/clinica.agenda.tsx",
  "<Popover open={open} onOpenChange={setOpen}>",
  "clinic appointments open a contextual popover",
);
if (!agenda.includes("line-clamp-2") || !agenda.includes("Editar agendamento") || !agenda.includes("Ver perfil clínico")) {
  throw new Error("Agenda card readability/popover actions regression");
}
console.log("OK: agenda cards preserve readable patient names and contextual actions");

const auth = requireContains(
  "src/routes/auth.tsx",
  "Da agenda ao laboratório, tudo no mesmo fluxo.",
  "authentication uses the DentalFlow split brand experience",
);
if (auth.includes('stage === "welcome"') || auth.includes("auth-hero.jpg")) {
  throw new Error("Legacy auth welcome gate/hero returned");
}
console.log("OK: authentication opens directly into the access experience");

const cases = requireContains(
  "src/components/CasesTable.tsx",
  "getCaseWorkflowStages(workflowStages.data ?? [], caseRow as any",
  "case list derives stage options from the case workflow",
);
const scopedMenus = (cases.match(/stagesForCase\(c\)\.map/g) ?? []).length;
if (scopedMenus !== 2) {
  throw new Error(`Expected two scoped stage pickers, found ${scopedMenus}`);
}
console.log("OK: both case-list stage pickers are workflow-scoped");

requireContains(
  "src/lib/workflow-v2.ts",
  "export function getCaseWorkflowStages",
  "workflow stage scoping is centralized in a reusable helper",
);

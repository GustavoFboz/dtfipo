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
if (!agenda.includes("<AppointmentDialog") || !agenda.includes("<Dialog open={open} onOpenChange={onOpenChange}>") || agenda.includes("<AppointmentSheet")) {
  throw new Error("Clinic appointment editor must remain a centered dialog");
}
if (!agenda.includes("handleAppointmentSaved") || !agenda.includes("setAnchor(localDateKey(new Date(saved.starts_at)))")) {
  throw new Error("Saved appointments must move the agenda to the saved date");
}
console.log("OK: agenda cards preserve readable patient names and appointment editing stays centered");

const clinicApi = requireContains(
  "src/lib/clinic.ts",
  '.select("*, patient:patients(id,name,photo_url), doctor:doctors(id,name)")',
  "appointment reads use columns that exist in the patient schema",
);
if (/patient:patients\([^)]*(birth_date|phone|email|cpf|gender)/.test(clinicApi)) {
  throw new Error("Appointment query references patient columns that are not present in the production schema");
}
console.log("OK: appointment fetch cannot regress to invalid nested patient columns");

const transition = requireContains(
  "src/components/EnvironmentTransition.tsx",
  "Trocando de ambiente",
  "environment switches use a full-screen transition overlay",
);
if (!transition.includes("backdrop-blur-[18px]") || !transition.includes("animate-spin")) {
  throw new Error("Environment transition blur/spinner regression");
}
const authenticatedRoute = requireContains(
  "src/routes/_authenticated/route.tsx",
  "<EnvironmentTransition />",
  "environment overlay persists across authenticated shell changes",
);
const bridge = requireContains(
  "src/components/ModuleEntryBridge.tsx",
  'startEnvironmentTransition("Clínica"',
  "laboratory-to-clinic switch triggers the environment transition",
);
if (!authenticatedRoute || !bridge) throw new Error("Environment transition wiring regression");

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

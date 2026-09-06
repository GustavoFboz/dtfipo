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
if (!clinicApi.includes("fetchClinicLowStockItems") || !clinicApi.includes("fetchClinicActiveTreatments")) {
  throw new Error("Clinic dashboard operational signals are missing from the clinic API");
}
console.log("OK: appointment fetch and clinic dashboard signals remain production-schema safe");

const clinicShell = requireContains(
  "src/components/ClinicShell.tsx",
  "<NotificationPanel profile={profile ?? undefined} />",
  "clinic header exposes the shared notification center",
);
if (!clinicShell.includes("dentalflow:clinic-sidebar-collapsed") || !clinicShell.includes("setIsCollapsed")) {
  throw new Error("Clinic sidebar collapse state regression");
}
if (clinicShell.includes("PAGE_TITLES") || clinicShell.includes("pageTitle(pathname)")) {
  throw new Error("Clinic header must not repeat the current page title");
}
console.log("OK: clinic header stays clean, notified and collapsible");

const clinicSidebar = requireContains(
  "src/components/ClinicSidebar.tsx",
  "data-clinic-institute-card",
  "clinic sidebar keeps a dedicated institute card",
);
if (!clinicSidebar.includes("Bem-vindo") || !clinicSidebar.includes("Conta ativa")) {
  throw new Error("Clinic sidebar must keep the account/welcome area above the institute");
}
if (!clinicSidebar.includes("--mouse-x") || !clinicSidebar.includes("--mouse-y") || !clinicSidebar.includes("LABORATÓRIO") || !clinicSidebar.includes("RADIOLOGIA")) {
  throw new Error("Clinic environment controls must preserve the laboratory cursor-following design");
}
if (clinicSidebar.includes("Ambiente clínico") || clinicSidebar.includes("Agenda, pacientes e gestão do consultório em um ambiente independente do laboratório.")) {
  throw new Error("Clinic institute card must contain only the institute identity, not explanatory copy");
}
console.log("OK: clinic sidebar identity and environment controls follow the requested compact design");

const clinicDashboard = requireContains(
  "src/routes/_authenticated/clinica.tsx",
  "Estoque baixo",
  "clinic dashboard exposes low-stock attention signals",
);
for (const needle of ["Tratamentos em andamento", "Cirurgias / implantes", "Próteses", "Próximos pacientes", "Receitas do mês", "Saldo do mês"]) {
  if (!clinicDashboard.includes(needle)) throw new Error(`Clinic dashboard lost required dynamic information: ${needle}`);
}
if (clinicDashboard.includes("Rotina da Clínica")) {
  throw new Error("Legacy clinic quick-links card returned to the dashboard");
}
console.log("OK: clinic home remains operational, visual and information-dense");

const newCase = requireContains(
  "src/components/NewCaseDialog.tsx",
  "const staleTemporary = teeth.filter((item) => item !== tooth && !toothHasConfig(item));",
  "plain tooth clicks discard every temporary shortcut selection",
);
if (newCase.includes("const staleTemporary = justAddedTeeth.filter((item) => item !== tooth")) {
  throw new Error("NewCaseDialog regressed to tracking only the most recently added shortcut teeth");
}
console.log("OK: plain odontogram clicks leave only one temporary tooth active");

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

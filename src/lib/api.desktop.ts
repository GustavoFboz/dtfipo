// Desktop-only compatibility facade.
//
// Installed clients are cache-first: a visible screen should never wait forever
// on a WebView/cloud request when a verified SQLite snapshot exists. Cloud refresh
// still runs in the background and the global desktop bootstrap invalidates visible
// queries after synchronization.
import * as cloudApi from "./api";
import { supabase } from "@/integrations/supabase/client";
import type {
  Cadista,
  CaseRow,
  CaseType,
  Component,
  Doctor,
  Notification,
  Patient,
  Phase,
  Profile,
  Stage,
  ToothColor,
} from "./types";
import {
  createCaseLocalFirst,
  deleteCaseLocalFirst,
  fetchCaseByIdLocalFirst,
  fetchCasesLocalFirst,
  fetchPatientCasesLocalFirst,
  finishCaseLocalFirst,
  reopenCaseLocalFirst,
  updateCaseLocalFirst,
  updateCaseTiBasesLocalFirst,
} from "./cases-local-first";
import {
  fetchPatientLocalFirst,
  fetchPatientsLocalFirst,
} from "./patients-local-first";
import {
  deleteNotificationLocalFirst,
  fetchNotificationsLocalFirst,
  markAllNotificationsAsReadLocalFirst,
  markCaseNotificationsReadLocalFirst,
  markNotificationAsReadLocalFirst,
  sendInternalNotificationLocalFirst,
} from "./notifications-local-first";
import {
  fetchCadistasLocalFirst,
  fetchCaseTypesLocalFirst,
  fetchComponentsLocalFirst,
  fetchDoctorsLocalFirst,
  fetchImplantSystemsLocalFirst,
  fetchPhasesLocalFirst,
  fetchProfileLocalFirst,
  fetchScanJigsLocalFirst,
  fetchStagesLocalFirst,
  fetchToothColorsLocalFirst,
} from "./reference-local-first";
import { isDentalFlowDesktop, localCacheGet, localCacheList, localCachePut } from "./desktop-local";
import { resolveDesktopOwnerId } from "./desktop-identity";
import { DESKTOP_READ_TIMEOUT_MS, withDesktopCloudTimeout } from "./desktop-cloud";

export * from "./api";
export {
  createCaseLocalFirst as createCase,
  deleteCaseLocalFirst as deleteCase,
  fetchCaseByIdLocalFirst as fetchCaseById,
  fetchPatientCasesLocalFirst as fetchPatientCases,
  finishCaseLocalFirst as finishCase,
  reopenCaseLocalFirst as reopenCase,
  updateCaseLocalFirst as updateCase,
  updateCaseTiBasesLocalFirst as updateCaseTiBases,
  markNotificationAsReadLocalFirst as markNotificationAsRead,
  markCaseNotificationsReadLocalFirst as markCaseNotificationsRead,
  markAllNotificationsAsReadLocalFirst as markAllNotificationsAsRead,
  sendInternalNotificationLocalFirst as sendInternalNotification,
};

type CaseScope = "active" | "finished" | "deleted" | "all" | "archived" | "solicitacoes";
type ImplantSystem = Awaited<ReturnType<typeof fetchImplantSystemsLocalFirst>>[number];
type ScanJig = Awaited<ReturnType<typeof fetchScanJigsLocalFirst>>[number];

function applyCaseScope(rows: CaseRow[], scope: CaseScope, filters?: { startDate?: string; endDate?: string }) {
  let result = rows;
  if (scope === "solicitacoes") result = result.filter((row) => row.status === "pendente");
  if (scope === "active") result = result.filter((row) => row.status === "em_andamento" || row.status === "active");
  if (scope === "finished") result = result.filter((row) => ["finalizado", "finished"].includes(row.status));
  if (scope === "archived") result = result.filter((row) => row.status === "arquivado");
  if (scope === "deleted") result = result.filter((row) => row.status === "cancelado");
  if (filters?.startDate) result = result.filter((row) => String(row.entry_date ?? "") >= filters.startDate!);
  if (filters?.endDate) result = result.filter((row) => String(row.entry_date ?? "") <= filters.endDate!);
  return [...result].sort((a, b) => String(b.updated_at ?? b.entry_date ?? "").localeCompare(String(a.updated_at ?? a.entry_date ?? "")));
}

function background(label: string, task: () => Promise<unknown>) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  void withDesktopCloudTimeout(label, task, DESKTOP_READ_TIMEOUT_MS).catch((error) => {
    console.warn(`[DentalFlow Desktop] Atualização em segundo plano adiada: ${label}`, error);
  });
}

async function owner() {
  return isDentalFlowDesktop() ? resolveDesktopOwnerId() : null;
}

async function writeCaseSnapshot(ownerId: string, rows: CaseRow[]) {
  const results = await Promise.allSettled([
    localCachePut(ownerId, "cases:v1", "all", rows),
    ...rows.map((row) => localCachePut(ownerId, "cases:v1", row.id, row)),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    console.warn("[DentalFlow Desktop] Casos recebidos do Cloud, mas o espelho SQLite não pôde ser atualizado por completo.");
  }
}

async function recoverCaseMirror(): Promise<CaseRow[]> {
  if (!isDentalFlowDesktop()) return [];
  const ownerId = await owner();
  if (!ownerId) return [];

  const aggregate = await localCacheGet<CaseRow[]>(ownerId, "cases:v1", "all").catch(() => null);
  if (Array.isArray(aggregate?.payload) && aggregate.payload.length > 0) return aggregate.payload;

  const entries = await localCacheList<CaseRow>(ownerId, "cases:v1", 5000).catch(() => []);
  const recovered = entries
    .filter((entry) => entry.key !== "all" && entry.payload?.id)
    .map((entry) => entry.payload);
  if (recovered.length > 0) {
    await writeCaseSnapshot(ownerId, recovered);
    console.warn(`[DentalFlow Desktop] Lista de casos recuperada de ${recovered.length} espelhos locais íntegros.`);
  }
  return recovered;
}

/**
 * Recovery path for a valid Cloud Login where the API's client-side role/profile
 * hydration briefly returns an empty list. RLS remains the security authority:
 * this query asks only for rows the authenticated account is already allowed to
 * read, then joins display labels from the local read models. It never bypasses
 * database policies and never writes to the cloud.
 */
async function recoverAuthorizedCasesDirectly(): Promise<CaseRow[]> {
  if (!isDentalFlowDesktop() || (typeof navigator !== "undefined" && navigator.onLine === false)) return [];
  const ownerId = await owner();
  if (!ownerId) return [];

  const auth = await withDesktopCloudTimeout(
    "validação para recuperação de casos",
    () => supabase.auth.getUser(),
    DESKTOP_READ_TIMEOUT_MS,
  );
  if (!auth.data.user || auth.data.user.user_metadata?.dentalflow_offline_device) return [];

  const rows = await withDesktopCloudTimeout(
    "casos autorizados por RLS",
    async () => {
      const result = await supabase.from("cases").select("*").order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      return (result.data ?? []) as unknown as CaseRow[];
    },
    DESKTOP_READ_TIMEOUT_MS,
  );
  if (!rows.length) return [];

  const [patients, doctors, cadistas, stages] = await Promise.all([
    fetchPatients().catch(() => [] as Patient[]),
    fetchDoctors().catch(() => [] as Doctor[]),
    fetchCadistas().catch(() => [] as Cadista[]),
    fetchStages().catch(() => [] as Stage[]),
  ]);
  const patientMap = new Map(patients.map((item) => [item.id, item]));
  const doctorMap = new Map(doctors.map((item) => [item.id, item]));
  const cadistaMap = new Map(cadistas.map((item) => [item.id, item]));
  const stageMap = new Map(stages.map((item) => [item.id, item]));

  const hydrated = rows.map((row) => ({
    ...row,
    patient: (row as any).patient ?? patientMap.get(row.patient_id ?? "") ?? null,
    doctor: (row as any).doctor ?? doctorMap.get(row.doctor_id ?? "") ?? null,
    cadista: (row as any).cadista ?? cadistaMap.get(row.cadista_id ?? "") ?? null,
    current_stage: (row as any).current_stage ?? stageMap.get(row.current_stage_id ?? "") ?? null,
    case_stages: (row as any).case_stages ?? [],
    case_components: (row as any).case_components ?? [],
  })) as CaseRow[];

  // Showing authorized Cloud data is more important than persisting a local
  // mirror. A SQLite failure must never turn a valid online result into an empty UI.
  await writeCaseSnapshot(ownerId, hydrated);
  console.warn(`[DentalFlow Desktop] ${hydrated.length} casos recuperados diretamente pelo escopo RLS autenticado.`);
  return hydrated;
}

type CaseRecoveryResult = {
  source: "primary" | "direct";
  rows: CaseRow[];
  error?: unknown;
};

/** Cache-first cases. Existing clinical data appears immediately, then refreshes. */
export async function fetchCases(
  scope: CaseScope = "active",
  filters?: { startDate?: string; endDate?: string },
): Promise<CaseRow[]> {
  if (!isDentalFlowDesktop()) return cloudApi.fetchCases(scope, filters);

  const cached = await recoverCaseMirror();
  if (cached.length > 0) {
    background("casos", () => fetchCasesLocalFirst("all"));
    return applyCaseScope(cached, scope, filters);
  }

  // With no local snapshot yet, start the normal rich query and the simpler
  // RLS-authorized recovery query together. Whichever produces real rows first
  // wins. This avoids leaving the Cases screen on skeletons while a nested join,
  // profile hydration or Cloud Login retry is still waiting on its own deadline.
  const primaryPromise: Promise<CaseRecoveryResult> = withDesktopCloudTimeout(
    "casos",
    () => fetchCasesLocalFirst(scope, filters),
    DESKTOP_READ_TIMEOUT_MS,
  )
    .then((rows) => ({ source: "primary" as const, rows }))
    .catch((error) => ({ source: "primary" as const, rows: [] as CaseRow[], error }));

  const directPromise: Promise<CaseRecoveryResult> = recoverAuthorizedCasesDirectly()
    .then((rows) => ({ source: "direct" as const, rows: applyCaseScope(rows, scope, filters) }))
    .catch((error) => ({ source: "direct" as const, rows: [] as CaseRow[], error }));

  const first = await Promise.race([primaryPromise, directPromise]);
  if (first.rows.length > 0) return first.rows;

  const [primary, direct] = await Promise.all([primaryPromise, directPromise]);
  if (primary.rows.length > 0) return primary.rows;
  if (direct.rows.length > 0) return direct.rows;

  const recovered = await recoverCaseMirror();
  if (recovered.length > 0) return applyCaseScope(recovered, scope, filters);

  background("casos (segunda passagem)", () => fetchCasesLocalFirst("all"));
  if (primary.error) throw primary.error;
  if (direct.error) throw direct.error;
  return [];
}

export async function fetchPatients(): Promise<Patient[]> {
  if (!isDentalFlowDesktop()) return cloudApi.fetchPatients();
  const ownerId = await owner();
  const cached = ownerId
    ? await localCacheGet<Patient[]>(ownerId, "patients:v1", "all").catch(() => null)
    : null;
  if (Array.isArray(cached?.payload) && cached.payload.length > 0) {
    background("pacientes", fetchPatientsLocalFirst);
    return cached.payload;
  }
  return withDesktopCloudTimeout("pacientes", fetchPatientsLocalFirst, DESKTOP_READ_TIMEOUT_MS);
}

export async function fetchPatient(id: string): Promise<Patient | null> {
  if (!isDentalFlowDesktop()) return cloudApi.fetchPatient(id);
  const ownerId = await owner();
  if (ownerId) {
    const direct = await localCacheGet<Patient>(ownerId, "patients:v1", id).catch(() => null);
    if (direct?.payload) {
      background(`paciente ${id}`, () => fetchPatientLocalFirst(id));
      return direct.payload;
    }
  }
  return withDesktopCloudTimeout(`paciente ${id}`, () => fetchPatientLocalFirst(id), DESKTOP_READ_TIMEOUT_MS);
}

async function reference<T>(key: string, loader: () => Promise<T>, fallback: T): Promise<T> {
  if (!isDentalFlowDesktop()) return loader();
  const ownerId = await owner();
  if (ownerId) {
    const cached = await localCacheGet<T>(ownerId, "reference-data:v1", key).catch(() => null);
    if (cached && cached.payload !== undefined && cached.payload !== null) {
      background(`cadastro ${key}`, loader);
      return cached.payload;
    }
  }
  try {
    return await withDesktopCloudTimeout(`cadastro ${key}`, loader, DESKTOP_READ_TIMEOUT_MS);
  } catch (error) {
    if (ownerId) {
      const retry = await localCacheGet<T>(ownerId, "reference-data:v1", key).catch(() => null);
      if (retry?.payload !== undefined) return retry.payload;
    }
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

export function fetchProfile(): Promise<Profile | null> {
  return reference("profile", fetchProfileLocalFirst, null);
}
export function fetchDoctors(): Promise<Doctor[]> {
  return reference("doctors", fetchDoctorsLocalFirst, []);
}
export function fetchCadistas(): Promise<Cadista[]> {
  return reference("cadistas", fetchCadistasLocalFirst, []);
}
export function fetchCaseTypes(): Promise<CaseType[]> {
  return reference("case-types", fetchCaseTypesLocalFirst, []);
}
export function fetchToothColors(): Promise<ToothColor[]> {
  return reference("tooth-colors", fetchToothColorsLocalFirst, []);
}
export function fetchStages(): Promise<Stage[]> {
  return reference("stages", fetchStagesLocalFirst, []);
}
export function fetchPhases(): Promise<Phase[]> {
  return reference("phases", fetchPhasesLocalFirst, []);
}
export function fetchComponents(): Promise<Component[]> {
  return reference("components", fetchComponentsLocalFirst, []);
}
export function fetchImplantSystems(): Promise<ImplantSystem[]> {
  return reference("implant-systems", fetchImplantSystemsLocalFirst, []);
}
export async function fetchScanJigs(implantSystemId?: string | null): Promise<ScanJig[]> {
  const all = await reference("scan-jigs", () => fetchScanJigsLocalFirst(), [] as ScanJig[]);
  return implantSystemId ? all.filter((row) => row.implant_system_id === implantSystemId) : all;
}

export async function fetchNotifications(): Promise<Notification[]> {
  if (!isDentalFlowDesktop()) return cloudApi.fetchNotifications();
  const ownerId = await owner();
  if (ownerId) {
    const cached = await localCacheGet<Notification[]>(ownerId, "notifications:v1", "all").catch(() => null);
    if (Array.isArray(cached?.payload)) {
      background("notificações", fetchNotificationsLocalFirst);
      return cached.payload;
    }
  }
  return withDesktopCloudTimeout("notificações", fetchNotificationsLocalFirst, DESKTOP_READ_TIMEOUT_MS);
}

// NotificationPanel uses the generic adminDelete helper. Keep all other tables
// on the existing cloud implementation, but make notification deletion durable
// while the installed client is offline.
export async function adminDelete(table: Parameters<typeof cloudApi.adminDelete>[0], id: string) {
  if (String(table) === "notifications") return deleteNotificationLocalFirst(id);
  return cloudApi.adminDelete(table, id);
}

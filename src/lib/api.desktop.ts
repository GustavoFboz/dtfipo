// Desktop-only compatibility facade.
//
// Installed clients are cache-first: a visible screen should never wait forever
// on a WebView/cloud request when a verified SQLite snapshot exists. Cloud refresh
// still runs in the background and the global desktop bootstrap invalidates visible
// queries after synchronization.
import * as cloudApi from "./api";
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

async function recoverCaseMirror(): Promise<CaseRow[]> {
  if (!isDentalFlowDesktop()) return [];
  const ownerId = await owner();
  if (!ownerId) return [];

  const aggregate = await localCacheGet<CaseRow[]>(ownerId, "cases:v1", "all");
  if (Array.isArray(aggregate?.payload) && aggregate.payload.length > 0) return aggregate.payload;

  const entries = await localCacheList<CaseRow>(ownerId, "cases:v1", 5000);
  const recovered = entries
    .filter((entry) => entry.key !== "all" && entry.payload?.id)
    .map((entry) => entry.payload);
  if (recovered.length > 0) {
    await localCachePut(ownerId, "cases:v1", "all", recovered);
    console.warn(`[DentalFlow Desktop] Lista de casos recuperada de ${recovered.length} espelhos locais íntegros.`);
  }
  return recovered;
}

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

  try {
    const rows = await withDesktopCloudTimeout(
      "casos",
      () => fetchCasesLocalFirst(scope, filters),
      DESKTOP_READ_TIMEOUT_MS,
    );
    if (rows.length > 0) return rows;
    const recovered = await recoverCaseMirror();
    if (recovered.length > 0) return applyCaseScope(recovered, scope, filters);
    // Empty may be a short Cloud Login/profile hydration gap. The bootstrap will
    // retry and invalidate this query; do not destroy any local mirror.
    background("casos (segunda passagem)", () => fetchCasesLocalFirst("all"));
    return rows;
  } catch (error) {
    const recovered = await recoverCaseMirror();
    if (recovered.length > 0) return applyCaseScope(recovered, scope, filters);
    throw error;
  }
}

export async function fetchPatients(): Promise<Patient[]> {
  if (!isDentalFlowDesktop()) return cloudApi.fetchPatients();
  const ownerId = await owner();
  const cached = ownerId ? await localCacheGet<Patient[]>(ownerId, "patients:v1", "all") : null;
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
    const direct = await localCacheGet<Patient>(ownerId, "patients:v1", id);
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
    const cached = await localCacheGet<T>(ownerId, "reference-data:v1", key);
    if (cached && cached.payload !== undefined && cached.payload !== null) {
      background(`cadastro ${key}`, loader);
      return cached.payload;
    }
  }
  try {
    return await withDesktopCloudTimeout(`cadastro ${key}`, loader, DESKTOP_READ_TIMEOUT_MS);
  } catch (error) {
    if (ownerId) {
      const retry = await localCacheGet<T>(ownerId, "reference-data:v1", key);
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
    const cached = await localCacheGet<Notification[]>(ownerId, "notifications:v1", "all");
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

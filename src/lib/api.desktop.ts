// Desktop-only compatibility facade.
//
// Most DentalFlow screens keep importing from `@/lib/api`. The Tauri build
// aliases that exact module to this facade so progressively migrated domains
// become local-first without forking the UI or changing the Web build.
import * as cloudApi from "./api";
import type { CaseRow } from "./types";
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
import { deleteNotificationLocalFirst } from "./notifications-local-first";
import { isDentalFlowDesktop, localCacheGet, localCacheList, localCachePut } from "./desktop-local";
import { resolveDesktopOwnerId } from "./desktop-identity";

export * from "./api";
export {
  fetchPatientLocalFirst as fetchPatient,
  fetchPatientsLocalFirst as fetchPatients,
} from "./patients-local-first";
export {
  createCaseLocalFirst as createCase,
  deleteCaseLocalFirst as deleteCase,
  fetchCaseByIdLocalFirst as fetchCaseById,
  fetchPatientCasesLocalFirst as fetchPatientCases,
  finishCaseLocalFirst as finishCase,
  reopenCaseLocalFirst as reopenCase,
  updateCaseLocalFirst as updateCase,
  updateCaseTiBasesLocalFirst as updateCaseTiBases,
};
export {
  fetchCadistasLocalFirst as fetchCadistas,
  fetchCaseTypesLocalFirst as fetchCaseTypes,
  fetchComponentsLocalFirst as fetchComponents,
  fetchDoctorsLocalFirst as fetchDoctors,
  fetchImplantSystemsLocalFirst as fetchImplantSystems,
  fetchPhasesLocalFirst as fetchPhases,
  fetchProfileLocalFirst as fetchProfile,
  fetchScanJigsLocalFirst as fetchScanJigs,
  fetchStagesLocalFirst as fetchStages,
  fetchToothColorsLocalFirst as fetchToothColors,
} from "./reference-local-first";
export {
  fetchNotificationsLocalFirst as fetchNotifications,
  markNotificationAsReadLocalFirst as markNotificationAsRead,
  markCaseNotificationsReadLocalFirst as markCaseNotificationsRead,
  markAllNotificationsAsReadLocalFirst as markAllNotificationsAsRead,
  sendInternalNotificationLocalFirst as sendInternalNotification,
} from "./notifications-local-first";

type CaseScope = "active" | "finished" | "deleted" | "all" | "archived" | "solicitacoes";

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

async function recoverCaseMirror(): Promise<CaseRow[]> {
  if (!isDentalFlowDesktop()) return [];
  const ownerId = await resolveDesktopOwnerId();
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

/**
 * A zero-row case result is ambiguous on Desktop: an offline device identity or
 * a momentary Cloud Login/profile hydration gap can make protected queries look
 * legitimately empty. Prefer the last mirrored SQLite entities when available;
 * explicit case deletion removes those mirrors, so intentional removals remain
 * authoritative.
 */
export async function fetchCases(
  scope: CaseScope = "active",
  filters?: { startDate?: string; endDate?: string },
): Promise<CaseRow[]> {
  const rows = await fetchCasesLocalFirst(scope, filters);
  if (!isDentalFlowDesktop() || rows.length > 0) return rows;
  const recovered = await recoverCaseMirror();
  return recovered.length > 0 ? applyCaseScope(recovered, scope, filters) : rows;
}

// NotificationPanel uses the generic adminDelete helper. Keep all other tables
// on the existing cloud implementation, but make notification deletion durable
// while the Windows client is offline.
export async function adminDelete(table: Parameters<typeof cloudApi.adminDelete>[0], id: string) {
  if (String(table) === "notifications") return deleteNotificationLocalFirst(id);
  return cloudApi.adminDelete(table, id);
}

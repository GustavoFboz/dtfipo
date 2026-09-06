// Desktop-only compatibility facade.
//
// Most DentalFlow screens keep importing from `@/lib/api`. The Tauri build
// aliases that exact module to this facade so progressively migrated domains
// become local-first without forking the UI or changing the Web build.
import * as cloudApi from "./api";
import { deleteNotificationLocalFirst } from "./notifications-local-first";

export * from "./api";
export {
  fetchPatientLocalFirst as fetchPatient,
  fetchPatientsLocalFirst as fetchPatients,
} from "./patients-local-first";
export {
  createCaseLocalFirst as createCase,
  deleteCaseLocalFirst as deleteCase,
  fetchCaseByIdLocalFirst as fetchCaseById,
  fetchCasesLocalFirst as fetchCases,
  fetchPatientCasesLocalFirst as fetchPatientCases,
  finishCaseLocalFirst as finishCase,
  reopenCaseLocalFirst as reopenCase,
  updateCaseLocalFirst as updateCase,
  updateCaseTiBasesLocalFirst as updateCaseTiBases,
} from "./cases-local-first";
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

// NotificationPanel uses the generic adminDelete helper. Keep all other tables
// on the existing cloud implementation, but make notification deletion durable
// while the Windows client is offline.
export async function adminDelete(table: Parameters<typeof cloudApi.adminDelete>[0], id: string) {
  if (String(table) === "notifications") return deleteNotificationLocalFirst(id);
  return cloudApi.adminDelete(table, id);
}

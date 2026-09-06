// Desktop-only clinic facade.
//
// The Web build continues using `@/lib/clinic` directly. The Tauri build aliases
// that module to this file so the existing Clinic UI can become local-first
// without forking screens or duplicating routes.
import type { ClinicContext } from "./clinic";
import {
  cancelClinicAppointmentLocalFirst,
  fetchClinicAppointmentsLocalFirst,
  fetchClinicContextLocalFirst,
  saveClinicAppointmentLocalFirst,
} from "./clinic-local-first";
import { localCacheGet } from "./desktop-local";
import { resolveDesktopOwnerId } from "./desktop-identity";

export * from "./clinic";
export {
  cancelClinicAppointmentLocalFirst as cancelClinicAppointment,
  fetchClinicAppointmentsLocalFirst as fetchClinicAppointments,
  saveClinicAppointmentLocalFirst as saveClinicAppointment,
};

/**
 * Keep the last server-verified Clinic entitlement available to the installed
 * Windows app. The primary repository already caches the complete context; this
 * second read uses the stable device owner id so a Cloud Login outage cannot make
 * an active Clinic disappear from the Hub merely because getSession() is offline.
 * We never invent/enable a module here: only a previously cached context is used.
 */
export async function fetchClinicContext(): Promise<ClinicContext> {
  try {
    return await fetchClinicContextLocalFirst();
  } catch (error) {
    const ownerId = await resolveDesktopOwnerId();
    if (ownerId) {
      const cached = await localCacheGet<ClinicContext>(ownerId, "clinic-context:v1", "current");
      if (cached?.payload) return cached.payload;
    }
    throw error;
  }
}

export {
  deleteClinicPatientEvolutionLocalFirst as deleteClinicPatientEvolution,
  fetchClinicActiveTreatmentsLocalFirst as fetchClinicActiveTreatments,
  fetchClinicFinancialEntriesLocalFirst as fetchClinicFinancialEntries,
  fetchClinicLowStockItemsLocalFirst as fetchClinicLowStockItems,
  fetchClinicPatientEvolutionsLocalFirst as fetchClinicPatientEvolutions,
  fetchClinicPatientFinancialEntriesLocalFirst as fetchClinicPatientFinancialEntries,
  fetchClinicPatientTreatmentsLocalFirst as fetchClinicPatientTreatments,
  fetchClinicRolePermissionsLocalFirst as fetchClinicRolePermissions,
  saveClinicFinancialEntryLocalFirst as saveClinicFinancialEntry,
  saveClinicPatientEvolutionLocalFirst as saveClinicPatientEvolution,
  setClinicRolePermissionLocalFirst as setClinicRolePermission,
} from "./clinic-records-local-first";

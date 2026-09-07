// Desktop-only clinic facade.
// The Web build continues using `@/lib/clinic` directly.
import type { ClinicContext } from "./clinic";
import {
  cancelClinicAppointmentLocalFirst,
  fetchClinicAppointmentsLocalFirst,
  fetchClinicContextLocalFirst,
  saveClinicAppointmentLocalFirst,
} from "./clinic-local-first";
import { localCacheGet } from "./desktop-local";
import { resolveDesktopOwnerId } from "./desktop-identity";
import { DESKTOP_READ_TIMEOUT_MS, withDesktopCloudTimeout } from "./desktop-cloud";

export * from "./clinic";
export {
  cancelClinicAppointmentLocalFirst as cancelClinicAppointment,
  saveClinicAppointmentLocalFirst as saveClinicAppointment,
};

type Appointment = Record<string, any> & { starts_at?: string };

function background(label: string, task: () => Promise<unknown>) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  void withDesktopCloudTimeout(label, task, DESKTOP_READ_TIMEOUT_MS).catch((error) => {
    console.warn(`[DentalFlow Desktop] Atualização em segundo plano adiada: ${label}`, error);
  });
}

function inRange(rows: Appointment[], start?: string, end?: string) {
  return rows.filter((row) => {
    if (!row.starts_at) return true;
    const value = new Date(row.starts_at).getTime();
    if (start && value < new Date(start).getTime()) return false;
    if (end && value >= new Date(end).getTime()) return false;
    return true;
  });
}

/**
 * A previously verified Clinic entitlement is an offline authorization asset.
 * Read it before touching the network. A cached negative result from older buggy
 * builds is not considered sufficient while online; we revalidate it immediately.
 */
export async function fetchClinicContext(): Promise<ClinicContext> {
  const ownerId = await resolveDesktopOwnerId();
  const cached = ownerId
    ? await localCacheGet<ClinicContext>(ownerId, "clinic-context:v1", "current")
    : null;

  if (cached?.payload?.hasClinicalModule) {
    background("permissões da Clínica", fetchClinicContextLocalFirst);
    return cached.payload;
  }

  if (cached?.payload && typeof navigator !== "undefined" && navigator.onLine === false) {
    return cached.payload;
  }

  try {
    return await withDesktopCloudTimeout(
      "permissões da Clínica",
      fetchClinicContextLocalFirst,
      DESKTOP_READ_TIMEOUT_MS,
    );
  } catch (error) {
    if (cached?.payload) return cached.payload;
    throw error;
  }
}

export async function fetchClinicAppointments(start?: string, end?: string) {
  const ownerId = await resolveDesktopOwnerId();
  const cached = ownerId
    ? await localCacheGet<Appointment[]>(ownerId, "clinic-appointments:v1", "all")
    : null;

  if (Array.isArray(cached?.payload) && cached.payload.length > 0) {
    background("agenda clínica", () => fetchClinicAppointmentsLocalFirst());
    return inRange(cached.payload, start, end);
  }

  try {
    return await withDesktopCloudTimeout(
      "agenda clínica",
      () => fetchClinicAppointmentsLocalFirst(start, end),
      DESKTOP_READ_TIMEOUT_MS,
    );
  } catch (error) {
    if (Array.isArray(cached?.payload)) return inRange(cached.payload, start, end);
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

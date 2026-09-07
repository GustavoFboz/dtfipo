// Desktop-only clinic facade.
// The Web build continues using `@/lib/clinic` directly.
import {
  CLINIC_PERMISSIONS,
  type ClinicContext,
  type ClinicPermission,
} from "./clinic";
import {
  cancelClinicAppointmentLocalFirst,
  fetchClinicAppointmentsLocalFirst,
  fetchClinicContextLocalFirst,
  saveClinicAppointmentLocalFirst,
} from "./clinic-local-first";
import {
  deleteClinicPatientEvolutionLocalFirst,
  fetchClinicActiveTreatmentsLocalFirst,
  fetchClinicFinancialEntriesLocalFirst,
  fetchClinicLowStockItemsLocalFirst,
  fetchClinicPatientEvolutionsLocalFirst,
  fetchClinicPatientFinancialEntriesLocalFirst,
  fetchClinicPatientTreatmentsLocalFirst,
  fetchClinicRolePermissionsLocalFirst,
  saveClinicFinancialEntryLocalFirst,
  saveClinicPatientEvolutionLocalFirst,
  setClinicRolePermissionLocalFirst,
} from "./clinic-records-local-first";
import { localCacheGet, localCachePut } from "./desktop-local";
import { resolveDesktopOwnerId } from "./desktop-identity";
import { DESKTOP_READ_TIMEOUT_MS, withDesktopCloudTimeout } from "./desktop-cloud";
import { supabase } from "@/integrations/supabase/client";

export * from "./clinic";
export {
  cancelClinicAppointmentLocalFirst as cancelClinicAppointment,
  saveClinicAppointmentLocalFirst as saveClinicAppointment,
  deleteClinicPatientEvolutionLocalFirst as deleteClinicPatientEvolution,
  fetchClinicPatientEvolutionsLocalFirst as fetchClinicPatientEvolutions,
  fetchClinicPatientFinancialEntriesLocalFirst as fetchClinicPatientFinancialEntries,
  fetchClinicPatientTreatmentsLocalFirst as fetchClinicPatientTreatments,
  fetchClinicRolePermissionsLocalFirst as fetchClinicRolePermissions,
  saveClinicFinancialEntryLocalFirst as saveClinicFinancialEntry,
  saveClinicPatientEvolutionLocalFirst as saveClinicPatientEvolution,
  setClinicRolePermissionLocalFirst as setClinicRolePermission,
};

type Appointment = Record<string, any> & { starts_at?: string };
type FinancialRow = Record<string, any> & { due_date?: string | null; created_at?: string | null };

const CONTEXT_NS = "clinic-context:v1";
const CONTEXT_KEY = "current";
const PROFILE_NS = "reference-data:v1";
const FINANCIAL_NS = "clinic-financial:v1";
const DASHBOARD_NS = "clinic-dashboard:v1";
const ALL_KEY = "all";

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

function filterMonth(rows: FinancialRow[], month?: string) {
  if (!month) return rows;
  return rows.filter((row) => String(row.due_date ?? row.created_at ?? "").slice(0, 7) === month);
}

function blankPermissions() {
  return Object.fromEntries(CLINIC_PERMISSIONS.map((permission) => [permission, false])) as Record<ClinicPermission, boolean>;
}

/**
 * Repair an incorrect negative Clinic entitlement using only server-verified
 * information for the currently authenticated account.
 *
 * Why this exists: older Desktop builds could persist a temporary profile/module
 * hydration gap as "Plano não habilitado". The production database can still have
 * the Clinical module enabled, but that stale negative snapshot would keep winning
 * offline. This repair reads the authenticated profile + clinic again, falls back
 * only to a previously server-cached profile for the same owner, and rewrites the
 * durable SQLite entitlement. No module is invented and RLS remains authoritative.
 */
async function repairClinicContextFromVerifiedCloud(ownerId: string): Promise<ClinicContext | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;

  const auth = await withDesktopCloudTimeout(
    "validação da Clínica",
    () => supabase.auth.getUser(),
    DESKTOP_READ_TIMEOUT_MS,
  );
  const user = auth.data.user;
  if (!user || user.id !== ownerId || user.user_metadata?.dentalflow_offline_device) return null;

  const serverProfile = await withDesktopCloudTimeout(
    "perfil para Clínica",
    async () => {
      const result = await supabase
        .from("profiles")
        .select("clinic_id,role,account_subtype,is_default_admin")
        .eq("id", ownerId)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data as any;
    },
    DESKTOP_READ_TIMEOUT_MS,
  ).catch(() => null);

  const cachedProfile = await localCacheGet<any>(ownerId, PROFILE_NS, "profile").catch(() => null);
  const profile = serverProfile ?? cachedProfile?.payload ?? null;
  const clinicId = profile?.clinic_id ?? null;
  if (!clinicId) return null;

  const clinic = await withDesktopCloudTimeout(
    "módulos da Clínica",
    async () => {
      const result = await supabase
        .from("clinics")
        .select("id,name,modules_enabled")
        .eq("id", clinicId)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data as any;
    },
    DESKTOP_READ_TIMEOUT_MS,
  );
  if (!clinic?.id) return null;

  const modules = Array.isArray(clinic.modules_enabled)
    ? clinic.modules_enabled.map((value: unknown) => String(value).toLowerCase())
    : [];
  const hasClinicalModule = modules.includes("clinical");
  const role = String(profile?.account_subtype || profile?.role || "USER").toUpperCase();
  const isAdvanced = Boolean(profile?.is_default_admin) || ["CEO", "ADMIN"].includes(role);
  const permissions = blankPermissions();

  if (hasClinicalModule) {
    if (isAdvanced) {
      for (const permission of CLINIC_PERMISSIONS) permissions[permission] = true;
    } else {
      const rows = await withDesktopCloudTimeout(
        "permissões da Clínica",
        async () => {
          const result = await (supabase as any)
            .from("clinic_role_permissions")
            .select("permission,allowed")
            .eq("clinic_id", clinicId)
            .eq("role", role);
          if (result.error) throw result.error;
          return result.data ?? [];
        },
        DESKTOP_READ_TIMEOUT_MS,
      ).catch(() => [] as any[]);

      for (const row of rows) {
        if (CLINIC_PERMISSIONS.includes(row.permission as ClinicPermission)) {
          permissions[row.permission as ClinicPermission] = Boolean(row.allowed);
        }
      }
    }
  }

  const repaired: ClinicContext = {
    clinicId,
    clinicName: clinic.name ?? null,
    modules,
    role,
    isAdvanced,
    hasClinicalModule,
    permissions,
  };

  await localCachePut(ownerId, CONTEXT_NS, CONTEXT_KEY, repaired);
  return repaired;
}

/**
 * A previously verified Clinic entitlement is an offline authorization asset.
 * Read it before touching the network. A cached negative result from an older
 * buggy build is not trusted while online; it is revalidated and repaired.
 *
 * Local cache access itself is deliberately non-authoritative: if SQLite has any
 * runtime issue, a valid online CEO/admin must still reach the verified Cloud
 * repair path rather than being trapped forever behind "Revalidando acesso".
 */
export async function fetchClinicContext(): Promise<ClinicContext> {
  const ownerId = await resolveDesktopOwnerId();
  const cached = ownerId
    ? await localCacheGet<ClinicContext>(ownerId, CONTEXT_NS, CONTEXT_KEY).catch(() => null)
    : null;

  if (cached?.payload?.hasClinicalModule) {
    background("permissões da Clínica", async () => {
      const refreshed = await fetchClinicContextLocalFirst();
      if (!refreshed.hasClinicalModule && ownerId) {
        await repairClinicContextFromVerifiedCloud(ownerId);
      }
    });
    return cached.payload;
  }

  if (cached?.payload && typeof navigator !== "undefined" && navigator.onLine === false) {
    return cached.payload;
  }

  try {
    const value = await withDesktopCloudTimeout(
      "permissões da Clínica",
      fetchClinicContextLocalFirst,
      DESKTOP_READ_TIMEOUT_MS,
    );
    if (value.hasClinicalModule || !ownerId) return value;

    const repaired = await repairClinicContextFromVerifiedCloud(ownerId).catch(() => null);
    return repaired ?? value;
  } catch (error) {
    if (ownerId) {
      const repaired = await repairClinicContextFromVerifiedCloud(ownerId).catch(() => null);
      if (repaired) return repaired;
    }
    if (cached?.payload) return cached.payload;
    throw error;
  }
}

export async function fetchClinicAppointments(start?: string, end?: string) {
  const ownerId = await resolveDesktopOwnerId();
  const cached = ownerId
    ? await localCacheGet<Appointment[]>(ownerId, "clinic-appointments:v1", "all").catch(() => null)
    : null;

  if (Array.isArray(cached?.payload)) {
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

/** Clinic dashboard datasets render directly from their warmed SQLite read-model. */
export async function fetchClinicFinancialEntries(month?: string) {
  const ownerId = await resolveDesktopOwnerId();
  const cached = ownerId
    ? await localCacheGet<FinancialRow[]>(ownerId, FINANCIAL_NS, ALL_KEY).catch(() => null)
    : null;
  if (Array.isArray(cached?.payload)) {
    background("financeiro da Clínica", () => fetchClinicFinancialEntriesLocalFirst());
    return filterMonth(cached.payload, month);
  }
  return withDesktopCloudTimeout(
    "financeiro da Clínica",
    () => fetchClinicFinancialEntriesLocalFirst(month),
    DESKTOP_READ_TIMEOUT_MS,
  );
}

export async function fetchClinicLowStockItems(limit = 6) {
  const ownerId = await resolveDesktopOwnerId();
  const cached = ownerId
    ? await localCacheGet<any[]>(ownerId, DASHBOARD_NS, "low-stock").catch(() => null)
    : null;
  if (Array.isArray(cached?.payload)) {
    background("estoque da Clínica", () => fetchClinicLowStockItemsLocalFirst(500));
    return cached.payload.slice(0, limit);
  }
  return withDesktopCloudTimeout(
    "estoque da Clínica",
    () => fetchClinicLowStockItemsLocalFirst(limit),
    DESKTOP_READ_TIMEOUT_MS,
  );
}

export async function fetchClinicActiveTreatments() {
  const ownerId = await resolveDesktopOwnerId();
  const cached = ownerId
    ? await localCacheGet<any[]>(ownerId, DASHBOARD_NS, "active-treatments").catch(() => null)
    : null;
  if (Array.isArray(cached?.payload)) {
    background("tratamentos ativos da Clínica", fetchClinicActiveTreatmentsLocalFirst);
    return cached.payload;
  }
  return withDesktopCloudTimeout(
    "tratamentos ativos da Clínica",
    fetchClinicActiveTreatmentsLocalFirst,
    DESKTOP_READ_TIMEOUT_MS,
  );
}

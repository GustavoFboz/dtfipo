import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { syncPendingPatientChanges, warmPatientLocalCache } from "@/lib/patients-local-first";
import { syncPendingClinicChanges, warmClinicLocalCache } from "@/lib/clinic-local-first";
import { syncPendingClinicRecordChanges, warmClinicRecordsLocalCache } from "@/lib/clinic-records-local-first";
import { syncPendingStockChanges, warmStockLocalCache } from "@/lib/stock-local-first";
import { syncPendingStockV2Changes, warmStockV2LocalCache } from "@/lib/stock-v2-local-first";
import { warmReferenceLocalCache } from "@/lib/reference-local-first";
import { syncPendingCaseChanges, warmCaseLocalCache } from "@/lib/cases-local-first";
import { syncPendingNotificationChanges, warmNotificationLocalCache } from "@/lib/notifications-local-first";
import { syncPendingWorkflowChanges, warmWorkflowLocalCache } from "@/lib/workflow-local-first";
import { warmTeamMembersLocalCache } from "@/lib/team-local-first";
import { refreshStorageUsage } from "@/lib/storage";
import { DESKTOP_SYNC_TIMEOUT_MS, withDesktopCloudTimeout } from "@/lib/desktop-cloud";

export type DesktopSyncSummary = {
  processed: number;
  failed: number;
  conflicts: number;
  patientsCached: number;
  appointmentsCached: number;
  casesCached: number;
  financialCached: number;
  evolutionsCached: number;
  stockItemsCached: number;
  stockMovementsCached: number;
  stockV2ItemsCached: number;
  stockCategoriesCached: number;
  clinicDashboardDatasetsCached: number;
  clinicContextCached: boolean;
  referenceDatasetsCached: number;
  notificationsCached: number;
  workflowDatasetsCached: number;
};

type BasicSync = { processed: number; failed: number; conflicts: number };

const ZERO_BASIC: BasicSync = { processed: 0, failed: 0, conflicts: 0 };

let activeSync: Promise<DesktopSyncSummary> | null = null;
let activeCriticalSync: Promise<DesktopSyncSummary> | null = null;
let activeAuxiliarySync: Promise<DesktopSyncSummary> | null = null;

async function safe<T>(label: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await withDesktopCloudTimeout(label, task, DESKTOP_SYNC_TIMEOUT_MS);
  } catch (error) {
    console.warn(`[DentalFlow Desktop] ${label} não bloqueou o restante da sincronização`, error);
    return fallback;
  }
}

function emptySummary(): DesktopSyncSummary {
  return {
    processed: 0,
    failed: 0,
    conflicts: 0,
    patientsCached: 0,
    appointmentsCached: 0,
    casesCached: 0,
    financialCached: 0,
    evolutionsCached: 0,
    stockItemsCached: 0,
    stockMovementsCached: 0,
    stockV2ItemsCached: 0,
    stockCategoriesCached: 0,
    clinicDashboardDatasetsCached: 0,
    clinicContextCached: false,
    referenceDatasetsCached: 0,
    notificationsCached: 0,
    workflowDatasetsCached: 0,
  };
}

function combineSummaries(a: DesktopSyncSummary, b: DesktopSyncSummary): DesktopSyncSummary {
  return {
    processed: a.processed + b.processed,
    failed: a.failed + b.failed,
    conflicts: a.conflicts + b.conflicts,
    patientsCached: Math.max(a.patientsCached, b.patientsCached),
    appointmentsCached: Math.max(a.appointmentsCached, b.appointmentsCached),
    casesCached: Math.max(a.casesCached, b.casesCached),
    financialCached: Math.max(a.financialCached, b.financialCached),
    evolutionsCached: Math.max(a.evolutionsCached, b.evolutionsCached),
    stockItemsCached: Math.max(a.stockItemsCached, b.stockItemsCached),
    stockMovementsCached: Math.max(a.stockMovementsCached, b.stockMovementsCached),
    stockV2ItemsCached: Math.max(a.stockV2ItemsCached, b.stockV2ItemsCached),
    stockCategoriesCached: Math.max(a.stockCategoriesCached, b.stockCategoriesCached),
    clinicDashboardDatasetsCached: Math.max(a.clinicDashboardDatasetsCached, b.clinicDashboardDatasetsCached),
    clinicContextCached: a.clinicContextCached || b.clinicContextCached,
    referenceDatasetsCached: Math.max(a.referenceDatasetsCached, b.referenceDatasetsCached),
    notificationsCached: Math.max(a.notificationsCached, b.notificationsCached),
    workflowDatasetsCached: Math.max(a.workflowDatasetsCached, b.workflowDatasetsCached),
  };
}

/**
 * Critical first-install phase.
 *
 * Only datasets required to prove a safe, useful Desktop session are awaited here:
 * patient/case outbox reconciliation plus patients, cases and the reference/profile
 * snapshot. Everything else warms after the UI is released.
 */
async function runCriticalSync(): Promise<DesktopSyncSummary> {
  if (!isDentalFlowDesktop()) return emptySummary();

  const patientSync = await safe("Sincronização crítica de pacientes", syncPendingPatientChanges, ZERO_BASIC);
  const caseSync = await safe("Sincronização crítica de casos", syncPendingCaseChanges, { ...ZERO_BASIC, cached: 0 });

  const summary = emptySummary();
  summary.processed = patientSync.processed + caseSync.processed;
  summary.failed = patientSync.failed + caseSync.failed;
  summary.conflicts = patientSync.conflicts + caseSync.conflicts;
  summary.casesCached = caseSync.cached;

  if (typeof navigator !== "undefined" && navigator.onLine === false) return summary;

  const [patients, cases, references] = await Promise.all([
    safe("Cache crítico de pacientes", warmPatientLocalCache, 0),
    safe("Cache crítico de casos", warmCaseLocalCache, 0),
    safe("Perfil e cadastros críticos", warmReferenceLocalCache, 0),
  ]);

  summary.patientsCached = patients;
  summary.casesCached = Math.max(summary.casesCached, cases);
  summary.referenceDatasetsCached = references;
  return summary;
}

/**
 * Secondary warm-up. Slow/large domains must never hold the first-install gate.
 * They keep their local-first mirrors and reconcile in the background once the
 * authenticated entitlement + critical patient/case proof are ready.
 */
async function runAuxiliarySync(): Promise<DesktopSyncSummary> {
  if (!isDentalFlowDesktop()) return emptySummary();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return emptySummary();

  const [clinicSync, recordsSync, stockSync, stockV2Sync, workflowSync] = await Promise.all([
    safe(
      "Sincronização da agenda clínica",
      syncPendingClinicChanges,
      { ...ZERO_BASIC, appointmentsCached: 0, contextCached: false },
    ),
    safe(
      "Sincronização de registros clínicos",
      syncPendingClinicRecordChanges,
      { ...ZERO_BASIC, financialCached: 0, evolutionsCached: 0, dashboardDatasetsCached: 0 },
    ),
    safe(
      "Sincronização do estoque legado",
      syncPendingStockChanges,
      { ...ZERO_BASIC, itemsCached: 0, movementsCached: 0 },
    ),
    safe(
      "Sincronização do estoque",
      syncPendingStockV2Changes,
      { ...ZERO_BASIC, itemsCached: 0, categoriesCached: 0 },
    ),
    safe("Sincronização do workflow", syncPendingWorkflowChanges, { ...ZERO_BASIC, datasetsCached: 0 }),
  ]);

  const notificationSync = await safe(
    "Sincronização de notificações",
    syncPendingNotificationChanges,
    { ...ZERO_BASIC, cached: 0 },
  );

  const summary = emptySummary();
  summary.processed = clinicSync.processed + recordsSync.processed + stockSync.processed +
    stockV2Sync.processed + workflowSync.processed + notificationSync.processed;
  summary.failed = clinicSync.failed + recordsSync.failed + stockSync.failed +
    stockV2Sync.failed + workflowSync.failed + notificationSync.failed;
  summary.conflicts = clinicSync.conflicts + recordsSync.conflicts + stockSync.conflicts +
    stockV2Sync.conflicts + workflowSync.conflicts + notificationSync.conflicts;
  summary.appointmentsCached = clinicSync.appointmentsCached;
  summary.clinicContextCached = clinicSync.contextCached;
  summary.financialCached = recordsSync.financialCached;
  summary.evolutionsCached = recordsSync.evolutionsCached;
  summary.clinicDashboardDatasetsCached = recordsSync.dashboardDatasetsCached;
  summary.stockItemsCached = stockSync.itemsCached;
  summary.stockMovementsCached = stockSync.movementsCached;
  summary.stockV2ItemsCached = stockV2Sync.itemsCached;
  summary.stockCategoriesCached = stockV2Sync.categoriesCached;
  summary.notificationsCached = notificationSync.cached;
  summary.workflowDatasetsCached = workflowSync.datasetsCached;

  // These mirrors remain important for later navigation/offline use, but none of
  // them should delay the initial Hub after patients/cases have been proven.
  const [clinic, records, stock, stockV2, notifications, workflow] = await Promise.all([
    safe("Cache da Clínica", warmClinicLocalCache, { appointmentsCached: 0, contextCached: false }),
    safe("Cache de registros clínicos", warmClinicRecordsLocalCache, { financialCached: 0, evolutionsCached: 0, dashboardDatasetsCached: 0 }),
    safe("Cache do estoque legado", warmStockLocalCache, { itemsCached: 0, movementsCached: 0 }),
    safe("Cache do estoque", warmStockV2LocalCache, { itemsCached: 0, categoriesCached: 0 }),
    safe("Cache de notificações", warmNotificationLocalCache, 0),
    safe("Cache do workflow", warmWorkflowLocalCache, 0),
    safe("Cache da equipe", warmTeamMembersLocalCache, 0),
    safe("Uso de armazenamento", refreshStorageUsage, null),
  ]);

  summary.appointmentsCached = Math.max(summary.appointmentsCached, clinic.appointmentsCached);
  summary.clinicContextCached = summary.clinicContextCached || clinic.contextCached;
  summary.financialCached = Math.max(summary.financialCached, records.financialCached);
  summary.evolutionsCached = Math.max(summary.evolutionsCached, records.evolutionsCached);
  summary.clinicDashboardDatasetsCached = Math.max(summary.clinicDashboardDatasetsCached, records.dashboardDatasetsCached);
  summary.stockItemsCached = Math.max(summary.stockItemsCached, stock.itemsCached);
  summary.stockMovementsCached = Math.max(summary.stockMovementsCached, stock.movementsCached);
  summary.stockV2ItemsCached = Math.max(summary.stockV2ItemsCached, stockV2.itemsCached);
  summary.stockCategoriesCached = Math.max(summary.stockCategoriesCached, stockV2.categoriesCached);
  summary.notificationsCached = Math.max(summary.notificationsCached, notifications);
  summary.workflowDatasetsCached = Math.max(summary.workflowDatasetsCached, workflow);
  return summary;
}

export function syncDesktopCriticalData(): Promise<DesktopSyncSummary> {
  if (activeCriticalSync) return activeCriticalSync;
  activeCriticalSync = runCriticalSync().finally(() => {
    activeCriticalSync = null;
  });
  return activeCriticalSync;
}

export function syncDesktopAuxiliaryData(): Promise<DesktopSyncSummary> {
  if (activeAuxiliarySync) return activeAuxiliarySync;
  activeAuxiliarySync = runAuxiliarySync().finally(() => {
    activeAuxiliarySync = null;
  });
  return activeAuxiliarySync;
}

export function syncDesktopOfflineData(): Promise<DesktopSyncSummary> {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const critical = await syncDesktopCriticalData();
    const auxiliary = await syncDesktopAuxiliaryData();
    return combineSummaries(critical, auxiliary);
  })().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

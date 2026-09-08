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

async function runDesktopSync(): Promise<DesktopSyncSummary> {
  if (!isDentalFlowDesktop()) return emptySummary();

  const patientSync = await safe("Sincronização de pacientes", syncPendingPatientChanges, ZERO_BASIC);

  const [clinicSync, recordsSync, caseSync, stockSync, stockV2Sync, workflowSync] = await Promise.all([
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
    safe("Sincronização de casos", syncPendingCaseChanges, { ...ZERO_BASIC, cached: 0 }),
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

  let summary: DesktopSyncSummary = {
    processed:
      patientSync.processed + clinicSync.processed + recordsSync.processed + caseSync.processed +
      stockSync.processed + stockV2Sync.processed + notificationSync.processed + workflowSync.processed,
    failed:
      patientSync.failed + clinicSync.failed + recordsSync.failed + caseSync.failed +
      stockSync.failed + stockV2Sync.failed + notificationSync.failed + workflowSync.failed,
    conflicts:
      patientSync.conflicts + clinicSync.conflicts + recordsSync.conflicts + caseSync.conflicts +
      stockSync.conflicts + stockV2Sync.conflicts + notificationSync.conflicts + workflowSync.conflicts,
    patientsCached: 0,
    appointmentsCached: clinicSync.appointmentsCached,
    casesCached: caseSync.cached,
    financialCached: recordsSync.financialCached,
    evolutionsCached: recordsSync.evolutionsCached,
    stockItemsCached: stockSync.itemsCached,
    stockMovementsCached: stockSync.movementsCached,
    stockV2ItemsCached: stockV2Sync.itemsCached,
    stockCategoriesCached: stockV2Sync.categoriesCached,
    clinicDashboardDatasetsCached: recordsSync.dashboardDatasetsCached,
    clinicContextCached: clinicSync.contextCached,
    referenceDatasetsCached: 0,
    notificationsCached: notificationSync.cached,
    workflowDatasetsCached: workflowSync.datasetsCached,
  };

  if (typeof navigator !== "undefined" && navigator.onLine === false) return summary;

  // Warm independent read models concurrently. Team and storage are explicitly
  // included because both screens are part of the persistent Desktop shell and
  // must have a verified local snapshot before a later auth/network interruption.
  const [patients, cases, references, clinic, records, stock, stockV2, notifications, workflow] = await Promise.all([
    safe("Cache de pacientes", warmPatientLocalCache, 0),
    safe("Cache de casos", warmCaseLocalCache, 0),
    safe("Cadastros auxiliares", warmReferenceLocalCache, 0),
    safe("Cache da Clínica", warmClinicLocalCache, { appointmentsCached: 0, contextCached: false }),
    safe("Cache de registros clínicos", warmClinicRecordsLocalCache, { financialCached: 0, evolutionsCached: 0, dashboardDatasetsCached: 0 }),
    safe("Cache do estoque legado", warmStockLocalCache, { itemsCached: 0, movementsCached: 0 }),
    safe("Cache do estoque", warmStockV2LocalCache, { itemsCached: 0, categoriesCached: 0 }),
    safe("Cache de notificações", warmNotificationLocalCache, 0),
    safe("Cache do workflow", warmWorkflowLocalCache, 0),
    safe("Cache da equipe", warmTeamMembersLocalCache, 0),
    safe("Uso de armazenamento", refreshStorageUsage, null),
  ]);

  summary = {
    ...summary,
    patientsCached: Math.max(summary.patientsCached, patients),
    casesCached: Math.max(summary.casesCached, cases),
    referenceDatasetsCached: Math.max(summary.referenceDatasetsCached, references),
    appointmentsCached: Math.max(summary.appointmentsCached, clinic.appointmentsCached),
    clinicContextCached: summary.clinicContextCached || clinic.contextCached,
    financialCached: Math.max(summary.financialCached, records.financialCached),
    evolutionsCached: Math.max(summary.evolutionsCached, records.evolutionsCached),
    clinicDashboardDatasetsCached: Math.max(summary.clinicDashboardDatasetsCached, records.dashboardDatasetsCached),
    stockItemsCached: Math.max(summary.stockItemsCached, stock.itemsCached),
    stockMovementsCached: Math.max(summary.stockMovementsCached, stock.movementsCached),
    stockV2ItemsCached: Math.max(summary.stockV2ItemsCached, stockV2.itemsCached),
    stockCategoriesCached: Math.max(summary.stockCategoriesCached, stockV2.categoriesCached),
    notificationsCached: Math.max(summary.notificationsCached, notifications),
    workflowDatasetsCached: Math.max(summary.workflowDatasetsCached, workflow),
  };

  return summary;
}

export function syncDesktopOfflineData(): Promise<DesktopSyncSummary> {
  if (activeSync) return activeSync;
  activeSync = runDesktopSync().finally(() => {
    activeSync = null;
  });
  return activeSync;
}
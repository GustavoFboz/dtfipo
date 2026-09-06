import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { syncPendingPatientChanges, warmPatientLocalCache } from "@/lib/patients-local-first";
import { syncPendingClinicChanges, warmClinicLocalCache } from "@/lib/clinic-local-first";
import { syncPendingClinicRecordChanges, warmClinicRecordsLocalCache } from "@/lib/clinic-records-local-first";
import { syncPendingStockChanges, warmStockLocalCache } from "@/lib/stock-local-first";
import { syncPendingStockV2Changes, warmStockV2LocalCache } from "@/lib/stock-v2-local-first";
import { warmReferenceLocalCache } from "@/lib/reference-local-first";
import { warmCaseLocalCache } from "@/lib/cases-local-first";

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
};

let activeSync: Promise<DesktopSyncSummary> | null = null;

async function runDesktopSync(): Promise<DesktopSyncSummary> {
  if (!isDentalFlowDesktop()) {
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
    };
  }

  const patientSync = await syncPendingPatientChanges();
  const clinicSync = await syncPendingClinicChanges();
  const recordsSync = await syncPendingClinicRecordChanges();
  const stockSync = await syncPendingStockChanges();
  const stockV2Sync = await syncPendingStockV2Changes();
  let patientsCached = 0;
  let appointmentsCached = clinicSync.appointmentsCached;
  let casesCached = 0;
  let financialCached = recordsSync.financialCached;
  let evolutionsCached = recordsSync.evolutionsCached;
  let stockItemsCached = stockSync.itemsCached;
  let stockMovementsCached = stockSync.movementsCached;
  let stockV2ItemsCached = stockV2Sync.itemsCached;
  let stockCategoriesCached = stockV2Sync.categoriesCached;
  let clinicDashboardDatasetsCached = recordsSync.dashboardDatasetsCached;
  let clinicContextCached = clinicSync.contextCached;
  let referenceDatasetsCached = 0;

  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    try {
      patientsCached = await warmPatientLocalCache();
    } catch (error) {
      console.warn("[DentalFlow Desktop] Não foi possível aquecer o cache local de pacientes", error);
    }

    try {
      casesCached = await warmCaseLocalCache();
    } catch (error) {
      console.warn("[DentalFlow Desktop] Não foi possível aquecer o cache local de casos", error);
    }

    try {
      referenceDatasetsCached = await warmReferenceLocalCache();
    } catch (error) {
      console.warn("[DentalFlow Desktop] Não foi possível aquecer os cadastros auxiliares", error);
    }

    if (!appointmentsCached || !clinicContextCached) {
      try {
        const warmed = await warmClinicLocalCache();
        appointmentsCached = Math.max(appointmentsCached, warmed.appointmentsCached);
        clinicContextCached = clinicContextCached || warmed.contextCached;
      } catch (error) {
        console.warn("[DentalFlow Desktop] Não foi possível aquecer o cache da clínica", error);
      }
    }

    if (!financialCached || !evolutionsCached || clinicDashboardDatasetsCached < 2) {
      try {
        const warmed = await warmClinicRecordsLocalCache();
        financialCached = Math.max(financialCached, warmed.financialCached);
        evolutionsCached = Math.max(evolutionsCached, warmed.evolutionsCached);
        clinicDashboardDatasetsCached = Math.max(clinicDashboardDatasetsCached, warmed.dashboardDatasetsCached);
      } catch (error) {
        console.warn("[DentalFlow Desktop] Não foi possível aquecer os registros clínicos", error);
      }
    }

    if (!stockItemsCached || !stockMovementsCached) {
      try {
        const warmed = await warmStockLocalCache();
        stockItemsCached = Math.max(stockItemsCached, warmed.itemsCached);
        stockMovementsCached = Math.max(stockMovementsCached, warmed.movementsCached);
      } catch (error) {
        console.warn("[DentalFlow Desktop] Não foi possível aquecer o estoque legado", error);
      }
    }

    if (!stockV2ItemsCached || !stockCategoriesCached) {
      try {
        const warmed = await warmStockV2LocalCache();
        stockV2ItemsCached = Math.max(stockV2ItemsCached, warmed.itemsCached);
        stockCategoriesCached = Math.max(stockCategoriesCached, warmed.categoriesCached);
      } catch (error) {
        console.warn("[DentalFlow Desktop] Não foi possível aquecer o estoque atual", error);
      }
    }
  }

  return {
    processed: patientSync.processed + clinicSync.processed + recordsSync.processed + stockSync.processed + stockV2Sync.processed,
    failed: patientSync.failed + clinicSync.failed + recordsSync.failed + stockSync.failed + stockV2Sync.failed,
    conflicts: patientSync.conflicts + clinicSync.conflicts + recordsSync.conflicts + stockSync.conflicts + stockV2Sync.conflicts,
    patientsCached,
    appointmentsCached,
    casesCached,
    financialCached,
    evolutionsCached,
    stockItemsCached,
    stockMovementsCached,
    stockV2ItemsCached,
    stockCategoriesCached,
    clinicDashboardDatasetsCached,
    clinicContextCached,
    referenceDatasetsCached,
  };
}

export function syncDesktopOfflineData(): Promise<DesktopSyncSummary> {
  if (activeSync) return activeSync;
  activeSync = runDesktopSync().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

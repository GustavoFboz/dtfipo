import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { syncPendingPatientChanges, warmPatientLocalCache } from "@/lib/patients-local-first";
import { syncPendingClinicChanges, warmClinicLocalCache } from "@/lib/clinic-local-first";
import { warmReferenceLocalCache } from "@/lib/reference-local-first";
import { warmCaseLocalCache } from "@/lib/cases-local-first";

export type DesktopSyncSummary = {
  processed: number;
  failed: number;
  conflicts: number;
  patientsCached: number;
  appointmentsCached: number;
  casesCached: number;
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
      clinicContextCached: false,
      referenceDatasetsCached: 0,
    };
  }

  const patientSync = await syncPendingPatientChanges();
  const clinicSync = await syncPendingClinicChanges();
  let patientsCached = 0;
  let appointmentsCached = clinicSync.appointmentsCached;
  let casesCached = 0;
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
  }

  return {
    processed: patientSync.processed + clinicSync.processed,
    failed: patientSync.failed + clinicSync.failed,
    conflicts: patientSync.conflicts + clinicSync.conflicts,
    patientsCached,
    appointmentsCached,
    casesCached,
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

import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { syncPendingPatientChanges, warmPatientLocalCache } from "@/lib/patients-local-first";

export type DesktopSyncSummary = {
  processed: number;
  failed: number;
  conflicts: number;
  patientsCached: number;
};

let activeSync: Promise<DesktopSyncSummary> | null = null;

async function runDesktopSync(): Promise<DesktopSyncSummary> {
  if (!isDentalFlowDesktop()) {
    return { processed: 0, failed: 0, conflicts: 0, patientsCached: 0 };
  }

  const patientSync = await syncPendingPatientChanges();
  let patientsCached = 0;

  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    try {
      patientsCached = await warmPatientLocalCache();
    } catch (error) {
      console.warn("[DentalFlow Desktop] Não foi possível aquecer o cache local de pacientes", error);
    }
  }

  return {
    processed: patientSync.processed,
    failed: patientSync.failed,
    conflicts: patientSync.conflicts,
    patientsCached,
  };
}

export function syncDesktopOfflineData(): Promise<DesktopSyncSummary> {
  if (activeSync) return activeSync;
  activeSync = runDesktopSync().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

import { useEffect } from "react";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";

/**
 * Starts the local-first desktop layer only after the authenticated shell exists.
 * This guarantees that a Supabase session is already available before we scope
 * local data by user and warm the first offline datasets.
 */
export function DesktopOfflineBootstrap() {
  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;

    const run = async () => {
      try {
        const summary = await syncDesktopOfflineData();
        if (disposed) return;
        window.dispatchEvent(new CustomEvent("dentalflow:desktop-sync-complete", { detail: summary }));
      } catch (error) {
        if (disposed) return;
        console.error("[DentalFlow Desktop] Falha ao preparar dados offline", error);
      }
    };

    void run();

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}

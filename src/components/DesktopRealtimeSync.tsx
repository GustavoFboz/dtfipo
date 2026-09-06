import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";

const WATCHED_TABLES = [
  "patients",
  "clinic_appointments",
  "clinic_financial_entries",
  "clinic_patient_evolutions",
  "cases",
  "stock_items",
  "stock_movements",
  "component_categories",
] as const;

/**
 * Keeps the local SQLite mirror fresh while the Desktop app is online.
 * The local database remains the offline fallback; Supabase Realtime only acts
 * as an invalidation signal and never writes directly into SQLite.
 */
export function DesktopRealtimeSync() {
  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const scheduleSync = () => {
      if (disposed) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void syncDesktopOfflineData().catch((error) => {
          console.warn("[DentalFlow Desktop] Falha ao aplicar atualização em tempo real", error);
        });
      }, 250);
    };

    const channel = WATCHED_TABLES.reduce((current, table) => {
      return current.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleSync,
      );
    }, supabase.channel(`desktop-local-mirror-${crypto.randomUUID()}`));

    channel.subscribe();
    window.addEventListener("online", scheduleSync);
    window.addEventListener("focus", scheduleSync);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", scheduleSync);
      window.removeEventListener("focus", scheduleSync);
      void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}

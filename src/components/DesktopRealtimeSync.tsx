import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";

const WATCHED_TABLES = [
  "patients",
  "clinic_appointments",
  "clinic_financial_entries",
  "clinic_patient_evolutions",
  "cases",
  "case_stages",
  "case_components",
  "case_types_link",
  "case_activity",
  "case_implant_teeth",
  "case_tooth_stock_usage",
  "case_stock_consumptions",
  "doctors",
  "cadistas",
  "profiles",
  "clinic_members",
  "stages",
  "phases",
  "stage_assignments",
  "phase_assignments",
  "workflow_settings",
  "stage_return_reasons",
  "stock_items",
  "stock_movements",
  "stock_consumption_rules",
  "component_categories",
  "components",
  "case_types",
  "tooth_colors",
  "implant_systems",
  "scan_jigs",
  "notifications",
] as const;

/**
 * Keeps the local SQLite mirror fresh while the Desktop app is online.
 * Realtime is only an invalidation signal: the authoritative read still goes
 * through each local-first repository, which updates SQLite before React Query
 * is invalidated. While Windows is offline we remove the realtime channel so the
 * app does not continuously retry a network service that cannot be reached.
 */
export function DesktopRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const runSync = async () => {
      if (disposed) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      try {
        const summary = await syncDesktopOfflineData();
        if (disposed) return;
        await queryClient.invalidateQueries();
        window.dispatchEvent(new CustomEvent("dentalflow:desktop-realtime-sync", { detail: summary }));
      } catch (error) {
        console.warn("[DentalFlow Desktop] Falha ao aplicar atualização em tempo real", error);
      }
    };

    const scheduleSync = () => {
      if (disposed) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void runSync();
      }, 300);
    };

    const subscribe = () => {
      if (disposed || channel) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      channel = WATCHED_TABLES.reduce((current, table) => {
        return current.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          scheduleSync,
        );
      }, supabase.channel(`desktop-local-mirror-${crypto.randomUUID()}`));
      channel.subscribe();
    };

    const unsubscribe = () => {
      if (!channel) return;
      const current = channel;
      channel = null;
      void supabase.removeChannel(current);
    };

    const handleOnline = () => {
      subscribe();
      scheduleSync();
    };
    const handleOffline = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      unsubscribe();
    };
    const handleFocus = () => scheduleSync();

    subscribe();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      unsubscribe();
    };
  }, [queryClient]);

  return null;
}

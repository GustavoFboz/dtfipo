import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";
import { broadcastEntity } from "@/lib/optimistic";

/**
 * 0.3.0 Desktop realtime bridge.
 *
 * Only tables actually published to Lovable Cloud Realtime are subscribed here.
 * Register every postgres_changes callback BEFORE subscribe(). This avoids the
 * Supabase Realtime runtime error seen when case dialogs were opened repeatedly.
 * Visible UI caches are invalidated immediately; the heavier SQLite mirror refresh
 * is debounced and never sits in the critical rendering path.
 */
export function DesktopRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;
    let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const scheduleMirrorRefresh = () => {
      if (disposed || navigator.onLine === false) return;
      if (mirrorTimer) clearTimeout(mirrorTimer);
      mirrorTimer = setTimeout(() => {
        mirrorTimer = null;
        void syncDesktopOfflineData()
          .then((summary) => {
            if (!disposed) {
              window.dispatchEvent(new CustomEvent("dentalflow:desktop-realtime-sync", { detail: summary }));
            }
          })
          .catch((error) => console.warn("[DentalFlow Desktop] Espelho realtime será tentado novamente", error));
      }, 350);
    };

    const teardownChannel = () => {
      if (!channel) return;
      const old = channel;
      channel = null;
      void supabase.removeChannel(old);
    };

    const connect = async () => {
      if (disposed || channel || navigator.onLine === false) return;

      const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
      const user = data.user;
      if (!user || user.user_metadata?.dentalflow_offline_device || disposed) return;

      const next = supabase
        .channel(`desktop-realtime-030:${user.id}:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as Record<string, any>;
            // Same-window delivery first; React Query + SQLite reconciliation follow.
            broadcastEntity("notifications", "insert", row);
            queryClient.setQueryData<any[]>(["notifications"], (old = []) =>
              old.some((item) => item?.id === row.id) ? old : [row, ...old],
            );
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
            window.dispatchEvent(new CustomEvent("dentalflow:realtime-notification", { detail: row }));
            scheduleMirrorRefresh();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as Record<string, any>;
            broadcastEntity("notifications", "update", row);
            queryClient.setQueryData<any[]>(["notifications"], (old = []) =>
              old.map((item) => item?.id === row.id ? { ...item, ...row } : item),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "case_activity" },
          (payload) => {
            const row = payload.new as Record<string, any>;
            broadcastEntity("case_activity", "insert", row);
            if (row.case_id) {
              void queryClient.invalidateQueries({ queryKey: ["case_activity", row.case_id] });
              void queryClient.invalidateQueries({ queryKey: ["case", row.case_id] });
              void queryClient.invalidateQueries({ queryKey: ["cases"] });
            }
            window.dispatchEvent(new CustomEvent("dentalflow:realtime-case-activity", { detail: row }));
            scheduleMirrorRefresh();
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (channel === next) channel = null;
            void supabase.removeChannel(next);
            if (!disposed && navigator.onLine !== false) {
              window.setTimeout(() => void connect(), 1200);
            }
          }
        });

      channel = next;
    };

    const onOnline = () => {
      teardownChannel();
      void connect();
      scheduleMirrorRefresh();
    };
    const onOffline = () => {
      if (mirrorTimer) {
        clearTimeout(mirrorTimer);
        mirrorTimer = null;
      }
      teardownChannel();
    };

    void connect();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const auth = supabase.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "TOKEN_REFRESHED", "INITIAL_SESSION"].includes(event)) {
        teardownChannel();
        window.setTimeout(() => void connect(), 50);
      }
      if (event === "SIGNED_OUT") teardownChannel();
    });
    authSubscription = auth.data.subscription;

    return () => {
      disposed = true;
      if (mirrorTimer) clearTimeout(mirrorTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      authSubscription?.unsubscribe();
      teardownChannel();
    };
  }, [queryClient]);

  return null;
}

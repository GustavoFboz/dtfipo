import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { broadcastEntity } from "@/lib/optimistic";

const REALTIME_RECONNECT_MS = 1_500;
const CASE_INVALIDATION_DEBOUNCE_MS = 220;

/**
 * Ponte realtime do Desktop.
 *
 * O realtime deve atualizar a interface, não iniciar uma sincronização integral
 * de todos os domínios a cada evento. Isso era particularmente caro após sleep:
 * eventos acumulados podiam acordar várias rotinas de cache ao mesmo tempo.
 */
export function DesktopRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;
    let connecting = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: number | null = null;
    let caseInvalidationTimer: number | null = null;
    let authSubscription: { unsubscribe: () => void } | null = null;
    const pendingCaseIds = new Set<string>();

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const clearCaseInvalidationTimer = () => {
      if (caseInvalidationTimer !== null) window.clearTimeout(caseInvalidationTimer);
      caseInvalidationTimer = null;
    };

    const teardownChannel = () => {
      clearReconnectTimer();
      if (!channel) return;
      const old = channel;
      channel = null;
      void supabase.removeChannel(old).catch(() => undefined);
    };

    const scheduleCaseInvalidation = (caseId: string) => {
      if (!caseId || disposed) return;
      pendingCaseIds.add(caseId);
      if (caseInvalidationTimer !== null) return;

      caseInvalidationTimer = window.setTimeout(() => {
        caseInvalidationTimer = null;
        const ids = Array.from(pendingCaseIds);
        pendingCaseIds.clear();
        for (const id of ids) {
          void queryClient.invalidateQueries({ queryKey: ["case_activity", id], refetchType: "active" });
          void queryClient.invalidateQueries({ queryKey: ["case", id], refetchType: "active" });
        }
      }, CASE_INVALIDATION_DEBOUNCE_MS);
    };

    const queueReconnect = () => {
      if (disposed || navigator.onLine === false || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, REALTIME_RECONNECT_MS);
    };

    const connect = async () => {
      if (disposed || connecting || channel || navigator.onLine === false) return;
      connecting = true;

      try {
        // getSession evita uma chamada remota extra em todo reconnect. A validade
        // da sessão é cuidada pelo lifecycle separado e o cliente atualiza tokens.
        const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
        const user = data.session?.user;
        if (!user || user.user_metadata?.dentalflow_offline_device || disposed) return;

        const next = supabase
          .channel(`desktop-realtime-030:${user.id}`)
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
              broadcastEntity("notifications", "insert", row);
              queryClient.setQueryData<any[]>(["notifications"], (old = []) =>
                old.some((item) => item?.id === row.id) ? old : [row, ...old],
              );
              window.dispatchEvent(new CustomEvent("dentalflow:realtime-notification", { detail: row }));
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
              if (row.case_id) scheduleCaseInvalidation(String(row.case_id));
              window.dispatchEvent(new CustomEvent("dentalflow:realtime-case-activity", { detail: row }));
            },
          )
          .subscribe((status) => {
            if (!["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) return;
            if (channel === next) channel = null;
            void supabase.removeChannel(next).catch(() => undefined);
            queueReconnect();
          });

        if (disposed) {
          void supabase.removeChannel(next).catch(() => undefined);
          return;
        }
        channel = next;
      } finally {
        connecting = false;
      }
    };

    const onOnline = () => {
      teardownChannel();
      void connect();
    };
    const onOffline = () => teardownChannel();
    const onVisibility = () => {
      if (!document.hidden && navigator.onLine !== false && !channel) void connect();
    };

    void connect();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    const auth = supabase.auth.onAuthStateChange((event) => {
      // TOKEN_REFRESHED é propositalmente ignorado. Derrubar e recriar o socket
      // em toda renovação de token contribuía para travamentos após inatividade.
      if (["SIGNED_IN", "INITIAL_SESSION", "USER_UPDATED"].includes(event)) {
        teardownChannel();
        queueReconnect();
      }
      if (event === "SIGNED_OUT") teardownChannel();
    });
    authSubscription = auth.data.subscription;

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearCaseInvalidationTimer();
      pendingCaseIds.clear();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      authSubscription?.unsubscribe();
      teardownChannel();
    };
  }, [queryClient]);

  return null;
}

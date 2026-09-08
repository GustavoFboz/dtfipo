import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getDesktopWindowState,
  getProvisionedDesktopIdentity,
  isDentalFlowDesktop,
  sendDesktopNativeNotification,
} from "@/lib/desktop-local";
import { broadcastEntity } from "@/lib/optimistic";

const REALTIME_RECONNECT_MS = 1_500;
const CASE_INVALIDATION_DEBOUNCE_MS = 220;
const BACKGROUND_NOTIFICATION_POLL_MS = 15_000;
const BACKGROUND_NOTIFICATION_BATCH = 50;
const NOTIFICATION_STARTUP_LOOKBACK_MS = 2 * 60_000;

function notificationPresentation(row: Record<string, any>) {
  const metadata = (row.metadata ?? {}) as Record<string, any>;
  const sender = String(metadata.sender_name ?? "").trim();
  const caseLabel = String(metadata.case_label ?? "").trim();
  const type = String(row.type ?? "").toLowerCase();

  let title = String(row.title ?? "DentalFlow").trim() || "DentalFlow";
  if (sender) {
    if (type === "attachment") title = `${sender} anexou um arquivo`;
    else if (["comment", "mention", "message"].includes(type)) title = `${sender} enviou uma mensagem`;
    else if (["case_update", "case_stage", "case_status"].includes(type)) title = `${sender} atualizou um caso`;
  }
  if (caseLabel) title = `${title} · ${caseLabel}`;

  return {
    title,
    body: String(row.content ?? "").trim(),
  };
}

function newerIso(a: string, b: string) {
  return Date.parse(a) > Date.parse(b) ? a : b;
}

/**
 * Ponte realtime central do Desktop.
 *
 * Realtime is the low-latency path. A recipient-scoped 15 s catch-up remains
 * active while the installed client is in background so Windows sleep/throttling
 * or a temporary auth validation gap cannot silently lose notifications.
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
    let backgroundPollTimer: number | null = null;
    let pollingNotifications = false;
    let currentUserId: string | null = null;
    let notificationCursor = new Date(Date.now() - NOTIFICATION_STARTUP_LOOKBACK_MS).toISOString();
    let authSubscription: { unsubscribe: () => void } | null = null;
    const pendingCaseIds = new Set<string>();
    const deliveredNativeIds = new Set<string>();
    const seenNotificationIds = new Set<string>();

    for (const row of queryClient.getQueryData<any[]>(["notifications"]) ?? []) {
      if (row?.id) seenNotificationIds.add(String(row.id));
      const createdAt = String(row?.created_at ?? "");
      if (createdAt && !Number.isNaN(Date.parse(createdAt))) {
        notificationCursor = newerIso(createdAt, notificationCursor);
      }
    }

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const clearCaseInvalidationTimer = () => {
      if (caseInvalidationTimer !== null) window.clearTimeout(caseInvalidationTimer);
      caseInvalidationTimer = null;
    };

    const clearBackgroundPoll = () => {
      if (backgroundPollTimer !== null) window.clearInterval(backgroundPollTimer);
      backgroundPollTimer = null;
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
          void queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "active" });
        }
      }, CASE_INVALIDATION_DEBOUNCE_MS);
    };

    const nativeWindowIsBackground = async () => {
      try {
        const state = await getDesktopWindowState();
        return !state.focused;
      } catch {
        return document.hidden || !document.hasFocus();
      }
    };

    const notifyNativeIfBackground = async (row: Record<string, any>) => {
      const id = String(row.id ?? "");
      if (!id || deliveredNativeIds.has(id)) return false;
      if (!(await nativeWindowIsBackground())) return false;

      const sent = await sendDesktopNativeNotification(notificationPresentation(row));
      if (sent) deliveredNativeIds.add(id);
      return sent;
    };

    const rememberNotificationCursor = (row: Record<string, any>) => {
      const createdAt = String(row.created_at ?? "");
      if (createdAt && !Number.isNaN(Date.parse(createdAt))) {
        notificationCursor = newerIso(createdAt, notificationCursor);
      }
    };

    const ingestNotification = (row: Record<string, any>, emitUiEvent = true) => {
      const id = String(row.id ?? "");
      if (!id) return;
      const alreadySeen = seenNotificationIds.has(id);
      seenNotificationIds.add(id);
      rememberNotificationCursor(row);

      broadcastEntity("notifications", "insert", row);
      queryClient.setQueryData<any[]>(["notifications"], (old = []) =>
        old.some((item) => item?.id === row.id) ? old : [row, ...old],
      );

      if (!alreadySeen) {
        void notifyNativeIfBackground(row);
        if (emitUiEvent) {
          window.dispatchEvent(new CustomEvent("dentalflow:realtime-notification", { detail: row }));
        }
      }
    };

    const pollBackgroundNotifications = async () => {
      if (
        disposed ||
        pollingNotifications ||
        navigator.onLine === false ||
        !currentUserId
      ) return;
      if (!(await nativeWindowIsBackground())) return;

      pollingNotifications = true;
      const cursorAtStart = notificationCursor;
      try {
        // Revalidate/recover the persisted real JWT before the protected read.
        // This is deliberately lightweight and also repairs a channel that
        // started while Cloud Login validation was temporarily unavailable.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session || sessionData.session.user.user_metadata?.dentalflow_offline_device) return;
        currentUserId = sessionData.session.user.id;

        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("recipient_id", currentUserId)
          .gt("created_at", cursorAtStart)
          .order("created_at", { ascending: true })
          .limit(BACKGROUND_NOTIFICATION_BATCH);
        if (error) throw error;

        for (const raw of data ?? []) {
          if (disposed) break;
          ingestNotification(raw as Record<string, any>, true);
        }
      } catch (error) {
        console.warn("[DentalFlow Desktop] Falha no catch-up de notificações", error);
      } finally {
        pollingNotifications = false;
      }
    };

    const startBackgroundPoll = () => {
      if (backgroundPollTimer !== null) return;
      backgroundPollTimer = window.setInterval(() => {
        void pollBackgroundNotifications();
      }, BACKGROUND_NOTIFICATION_POLL_MS);
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
        const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
        const user = data.session?.user;

        if (!user || user.user_metadata?.dentalflow_offline_device) {
          // Previous builds simply returned here. A single transient auth timeout
          // at startup could therefore leave both Realtime and catch-up dead for
          // the entire session. Keep the recipient identity and self-heal.
          const identity = await getProvisionedDesktopIdentity().catch(() => null);
          currentUserId = user?.id ?? identity?.user_id ?? currentUserId;
          startBackgroundPoll();
          queueReconnect();
          return;
        }
        if (disposed) return;
        currentUserId = user.id;

        const next = supabase
          .channel(`desktop-realtime-033:${user.id}:${crypto.randomUUID()}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `recipient_id=eq.${user.id}`,
            },
            (payload) => ingestNotification(payload.new as Record<string, any>, true),
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
              rememberNotificationCursor(row);
              if (row?.id) seenNotificationIds.add(String(row.id));
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
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "cases" },
            (payload) => {
              const row = payload.new as Record<string, any>;
              if (row.id) scheduleCaseInvalidation(String(row.id));
              window.dispatchEvent(new CustomEvent("dentalflow:realtime-case-update", { detail: row }));
            },
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              void pollBackgroundNotifications();
              return;
            }
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
        startBackgroundPoll();
      } finally {
        connecting = false;
      }
    };

    const onOnline = () => {
      teardownChannel();
      startBackgroundPoll();
      void connect().then(() => pollBackgroundNotifications());
    };
    const onOffline = () => teardownChannel();
    const onVisibility = () => {
      if (navigator.onLine !== false && !channel) void connect();
      if (document.hidden) void pollBackgroundNotifications();
    };
    const onWindowBlur = () => void pollBackgroundNotifications();

    void connect();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibility);

    const auth = supabase.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "INITIAL_SESSION", "USER_UPDATED"].includes(event)) {
        teardownChannel();
        queueReconnect();
      }
      if (event === "TOKEN_REFRESHED" && !channel) queueReconnect();
      if (event === "SIGNED_OUT") {
        currentUserId = null;
        teardownChannel();
        clearBackgroundPoll();
      }
    });
    authSubscription = auth.data.subscription;

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearCaseInvalidationTimer();
      clearBackgroundPoll();
      pendingCaseIds.clear();
      deliveredNativeIds.clear();
      seenNotificationIds.clear();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      authSubscription?.unsubscribe();
      teardownChannel();
    };
  }, [queryClient]);

  return null;
}
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  recoverDesktopCloudSession,
  supabase,
} from "@/integrations/supabase/client";
import {
  getDesktopWindowState,
  getProvisionedDesktopIdentity,
  isDentalFlowDesktop,
  sendDesktopNativeNotification,
  upsertLocalCaseActivities,
  upsertLocalNotifications,
} from "@/lib/desktop-local";
import { broadcastEntity } from "@/lib/optimistic";

const REALTIME_RECONNECT_MS = 1_500;
const ENTITY_INVALIDATION_DEBOUNCE_MS = 180;
const NOTIFICATION_RECONCILE_MS = 5_000;
const FULL_RECONCILE_MS = 15_000;
const SESSION_HEAL_MS = 20_000;
const BACKGROUND_NOTIFICATION_BATCH = 150;
const NOTIFICATION_STARTUP_LOOKBACK_MS = 15 * 60_000;
const NOTIFICATION_CURSOR_OVERLAP_MS = 20_000;
const CASE_UPDATE_NATIVE_DELAY_MS = 1_100;

function notificationTarget(row: Record<string, any>) {
  const metadata = (row.metadata ?? {}) as Record<string, any>;
  const caseId = String(metadata.case_id ?? row.case_id ?? "").trim() || undefined;
  const activityId = String(
    metadata.activity_id ?? metadata.case_activity_id ?? row.activity_id ?? row.case_activity_id ?? "",
  ).trim() || undefined;
  const route = caseId ? `/cases/${encodeURIComponent(caseId)}` : "/notifications";
  return { route, caseId, activityId };
}

function notificationPresentation(row: Record<string, any>) {
  const metadata = (row.metadata ?? {}) as Record<string, any>;
  const sender = String(metadata.sender_name ?? "").trim();
  const caseLabel = String(metadata.case_label ?? "").trim();
  const type = String(row.type ?? "").toLowerCase();

  let title = String(row.title ?? "DentalFlow").trim() || "DentalFlow";
  if (sender) {
    if (type === "attachment") title = `${sender} alterou um arquivo`;
    else if (["comment", "mention", "message"].includes(type)) title = `${sender} enviou uma mensagem`;
    else if (["case_update", "case_stage", "case_status"].includes(type)) title = `${sender} atualizou um caso`;
  }
  if (caseLabel) title = `${title} · ${caseLabel}`;

  return {
    title,
    body: String(row.content ?? "").trim(),
    data: notificationTarget(row),
  };
}

function newerIso(a: string, b: string) {
  return Date.parse(a) > Date.parse(b) ? a : b;
}

function cursorWithOverlap(cursor: string) {
  const ms = Date.parse(cursor);
  if (Number.isNaN(ms)) return cursor;
  return new Date(Math.max(0, ms - NOTIFICATION_CURSOR_OVERLAP_MS)).toISOString();
}

export function DesktopRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;
    let connecting = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: number | null = null;
    let entityInvalidationTimer: number | null = null;
    let notificationPollTimer: number | null = null;
    let fullReconcileTimer: number | null = null;
    let sessionHealTimer: number | null = null;
    let pollingNotifications = false;
    let reconciling = false;
    let healingSession = false;
    let currentUserId: string | null = null;
    let notificationCursor = new Date(Date.now() - NOTIFICATION_STARTUP_LOOKBACK_MS).toISOString();
    let authSubscription: { unsubscribe: () => void } | null = null;
    const pendingCaseIds = new Set<string>();
    const pendingDomains = new Set<string>();
    const deliveredNativeIds = new Set<string>();
    const seenNotificationIds = new Set<string>();
    const pendingCaseNativeTimers = new Map<string, number>();

    for (const row of queryClient.getQueryData<any[]>(["notifications"]) ?? []) {
      if (row?.id) seenNotificationIds.add(String(row.id));
      const createdAt = String(row?.created_at ?? "");
      if (createdAt && !Number.isNaN(Date.parse(createdAt))) notificationCursor = newerIso(createdAt, notificationCursor);
    }

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };
    const clearEntityInvalidationTimer = () => {
      if (entityInvalidationTimer !== null) window.clearTimeout(entityInvalidationTimer);
      entityInvalidationTimer = null;
    };
    const clearReconcileTimers = () => {
      if (notificationPollTimer !== null) window.clearInterval(notificationPollTimer);
      if (fullReconcileTimer !== null) window.clearInterval(fullReconcileTimer);
      if (sessionHealTimer !== null) window.clearInterval(sessionHealTimer);
      notificationPollTimer = null;
      fullReconcileTimer = null;
      sessionHealTimer = null;
    };
    const cancelPendingCaseNative = (caseId: string) => {
      const timer = pendingCaseNativeTimers.get(caseId);
      if (timer !== undefined) window.clearTimeout(timer);
      pendingCaseNativeTimers.delete(caseId);
    };
    const clearPendingCaseNative = () => {
      for (const timer of pendingCaseNativeTimers.values()) window.clearTimeout(timer);
      pendingCaseNativeTimers.clear();
    };
    const teardownChannel = () => {
      clearReconnectTimer();
      if (!channel) return;
      const old = channel;
      channel = null;
      void supabase.removeChannel(old).catch(() => undefined);
    };

    const flushInvalidations = () => {
      entityInvalidationTimer = null;
      const ids = Array.from(pendingCaseIds);
      const domains = new Set(pendingDomains);
      pendingCaseIds.clear();
      pendingDomains.clear();

      for (const id of ids) {
        void queryClient.invalidateQueries({ queryKey: ["case_activity", id], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["case-professional-activity", id], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["case_attachments", id], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["case", id], refetchType: "active" });
      }
      if (ids.length || domains.has("cases")) void queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "active" });
      if (domains.has("notifications")) void queryClient.invalidateQueries({ queryKey: ["notifications"], refetchType: "active" });
      if (domains.has("team")) {
        void queryClient.invalidateQueries({ queryKey: ["team"], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["team_members"], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["clinic_members"], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["company_team_access"], refetchType: "active" });
      }
      if (domains.has("sessions")) {
        void queryClient.invalidateQueries({ queryKey: ["subscription_context"], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["company_sessions"], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["company_member_sessions"], refetchType: "active" });
      }
    };

    const scheduleInvalidation = (domain: string, caseId?: string | null) => {
      if (disposed) return;
      if (caseId) pendingCaseIds.add(String(caseId));
      pendingDomains.add(domain);
      if (entityInvalidationTimer !== null) return;
      entityInvalidationTimer = window.setTimeout(flushInvalidations, ENTITY_INVALIDATION_DEBOUNCE_MS);
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

    const scheduleNativeCaseUpdate = (row: Record<string, any>) => {
      const caseId = String(row.id ?? "");
      if (!caseId) return;
      cancelPendingCaseNative(caseId);
      const timer = window.setTimeout(() => {
        pendingCaseNativeTimers.delete(caseId);
        void (async () => {
          if (disposed || !(await nativeWindowIsBackground())) return;
          const version = String(row.updated_at ?? row.current_stage_id ?? row.status ?? Date.now());
          const dedupeKey = `case-update:${caseId}:${version}`;
          if (deliveredNativeIds.has(dedupeKey)) return;
          const label = String(row.case_label ?? "").trim();
          const sent = await sendDesktopNativeNotification({
            title: label ? `Caso atualizado · ${label}` : "Caso atualizado",
            body: "Um caso ao qual você tem acesso recebeu uma atualização.",
            data: { route: `/cases/${encodeURIComponent(caseId)}`, caseId },
          });
          if (sent) deliveredNativeIds.add(dedupeKey);
        })();
      }, CASE_UPDATE_NATIVE_DELAY_MS);
      pendingCaseNativeTimers.set(caseId, timer);
    };

    const rememberNotificationCursor = (row: Record<string, any>) => {
      const createdAt = String(row.created_at ?? "");
      if (createdAt && !Number.isNaN(Date.parse(createdAt))) notificationCursor = newerIso(createdAt, notificationCursor);
    };

    const ingestNotification = (row: Record<string, any>, emitUiEvent = true) => {
      const id = String(row.id ?? "");
      if (!id) return;
      const alreadySeen = seenNotificationIds.has(id);
      seenNotificationIds.add(id);
      rememberNotificationCursor(row);
      const relatedCaseId = String((row.metadata as any)?.case_id ?? row.case_id ?? "");
      if (relatedCaseId) cancelPendingCaseNative(relatedCaseId);

      void upsertLocalNotifications([row as any]).catch((error) => {
        console.warn("[DentalFlow Desktop] Cache local de notificação adiado", error);
      });
      broadcastEntity("notifications", "insert", row);
      queryClient.setQueryData<any[]>(["notifications"], (old = []) =>
        old.some((item) => item?.id === row.id)
          ? old.map((item) => item?.id === row.id ? { ...item, ...row } : item)
          : [row, ...old],
      );
      window.dispatchEvent(new CustomEvent("dentalflow:notifications-updated", { detail: row }));
      if (!alreadySeen) {
        void notifyNativeIfBackground(row);
        if (emitUiEvent) window.dispatchEvent(new CustomEvent("dentalflow:realtime-notification", { detail: row }));
      }
    };

    const removeNotification = (row: Record<string, any>) => {
      const id = String(row.id ?? "");
      if (!id) return;
      queryClient.setQueryData<any[]>(["notifications"], (old = []) => old.filter((item) => String(item?.id ?? "") !== id));
      broadcastEntity("notifications", "delete", row);
      window.dispatchEvent(new CustomEvent("dentalflow:notifications-updated", { detail: row }));
    };

    const healSession = async () => {
      if (disposed || healingSession || navigator.onLine === false) return null;
      healingSession = true;
      try {
        const healed = await recoverDesktopCloudSession();
        if (healed?.user?.id) currentUserId = healed.user.id;
        return healed;
      } catch (error) {
        console.warn("[DentalFlow Desktop] Sessão online aguardando revalidação", error);
        return null;
      } finally {
        healingSession = false;
      }
    };

    // Realtime is the low-latency path. The overlap-window poll is the delivery
    // guarantee for suspended WebViews, token transitions and brief disconnects.
    const pollNotifications = async () => {
      if (disposed || pollingNotifications || navigator.onLine === false) return;
      pollingNotifications = true;
      try {
        const healed = await healSession();
        const userId = healed?.user?.id ?? currentUserId;
        if (!userId) return;
        currentUserId = userId;
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("recipient_id", userId)
          .gte("created_at", cursorWithOverlap(notificationCursor))
          .order("created_at", { ascending: true })
          .limit(BACKGROUND_NOTIFICATION_BATCH);
        if (error) throw error;
        for (const raw of data ?? []) {
          if (disposed) break;
          ingestNotification(raw as Record<string, any>, true);
        }
      } catch (error) {
        console.warn("[DentalFlow Desktop] Falha na reconciliação de notificações", error);
      } finally {
        pollingNotifications = false;
      }
    };

    const reconcileActiveData = async () => {
      if (disposed || reconciling || navigator.onLine === false) return;
      reconciling = true;
      try {
        const healed = await healSession();
        if (!healed) return;
        currentUserId = healed.user.id;
        await pollNotifications();
        try {
          const { syncPendingNotificationChanges } = await import("@/lib/notifications-local-first");
          await syncPendingNotificationChanges();
        } catch (error) {
          console.warn("[DentalFlow Desktop] Outbox de notificações aguardará a próxima reconciliação", error);
        }
        void queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["case_activity"], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["case_attachments"], refetchType: "active" });
        void queryClient.invalidateQueries({ queryKey: ["notifications"], refetchType: "active" });
      } catch (error) {
        console.warn("[DentalFlow Desktop] Reconciliação de dados adiada", error);
      } finally {
        reconciling = false;
      }
    };

    const startReconcileTimers = () => {
      if (notificationPollTimer === null) notificationPollTimer = window.setInterval(() => void pollNotifications(), NOTIFICATION_RECONCILE_MS);
      if (fullReconcileTimer === null) fullReconcileTimer = window.setInterval(() => void reconcileActiveData(), FULL_RECONCILE_MS);
      if (sessionHealTimer === null) {
        sessionHealTimer = window.setInterval(() => {
          void healSession().then((session) => {
            if (!session || disposed) return;
            if (!channel) void connect();
          });
        }, SESSION_HEAL_MS);
      }
    };

    const queueReconnect = () => {
      if (disposed || navigator.onLine === false || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, REALTIME_RECONNECT_MS);
    };

    const applyCaseUpdate = (row: Record<string, any>) => {
      if (!row?.id) return;
      queryClient.setQueriesData<any[]>({ queryKey: ["cases"] }, (old) =>
        Array.isArray(old) ? old.map((item) => item?.id === row.id ? { ...item, ...row } : item) : old,
      );
      queryClient.setQueryData<any>(["case", row.id], (old: any) => old ? { ...old, ...row } : old);
      scheduleInvalidation("cases", String(row.id));
    };

    const connect = async () => {
      if (disposed || connecting || channel || navigator.onLine === false) return;
      connecting = true;
      try {
        const healed = await healSession();
        const user = healed?.user;
        if (!user) {
          const identity = await getProvisionedDesktopIdentity().catch(() => null);
          currentUserId = identity?.user_id ?? currentUserId;
          startReconcileTimers();
          queueReconnect();
          return;
        }
        if (disposed) return;
        currentUserId = user.id;

        const next = supabase
          .channel(`desktop-realtime-040:${user.id}:${crypto.randomUUID()}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
            (payload) => ingestNotification(payload.new as Record<string, any>, true))
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
            (payload) => {
              const row = payload.new as Record<string, any>;
              rememberNotificationCursor(row);
              if (row?.id) seenNotificationIds.add(String(row.id));
              void upsertLocalNotifications([row as any]).catch(() => undefined);
              broadcastEntity("notifications", "update", row);
              queryClient.setQueryData<any[]>(["notifications"], (old = []) => old.map((item) => item?.id === row.id ? { ...item, ...row } : item));
              window.dispatchEvent(new CustomEvent("dentalflow:notifications-updated", { detail: row }));
            })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" },
            (payload) => removeNotification(payload.old as Record<string, any>))
          .on("postgres_changes", { event: "*", schema: "public", table: "case_activity" },
            (payload) => {
              const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, any>;
              if (payload.eventType !== "DELETE" && row?.id && row?.case_id) {
                void upsertLocalCaseActivities([row as any]).catch((error) => {
                  console.warn("[DentalFlow Desktop] Cache local do chat aguardará reconciliação", error);
                });
              }
              broadcastEntity("case_activity", payload.eventType.toLowerCase() as any, row);
              if (row?.case_id) scheduleInvalidation("cases", String(row.case_id));
              window.dispatchEvent(new CustomEvent("dentalflow:realtime-case-activity", { detail: row }));
            })
          .on("postgres_changes", { event: "*", schema: "public", table: "case_attachments" },
            (payload) => {
              const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, any>;
              broadcastEntity("case_attachments", payload.eventType.toLowerCase() as any, row);
              if (row?.case_id) scheduleInvalidation("cases", String(row.case_id));
              window.dispatchEvent(new CustomEvent("dentalflow:realtime-case-attachment", { detail: row }));
            })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cases" },
            (payload) => {
              const row = payload.new as Record<string, any>;
              applyCaseUpdate(row);
              scheduleNativeCaseUpdate(row);
              window.dispatchEvent(new CustomEvent("dentalflow:realtime-case-update", { detail: row }));
            })
          .on("postgres_changes", { event: "*", schema: "public", table: "clinic_members" }, () => scheduleInvalidation("team"))
          .on("postgres_changes", { event: "*", schema: "public", table: "company_sessions" }, () => scheduleInvalidation("sessions"))
          .on("postgres_changes", { event: "*", schema: "public", table: "company_member_sessions" }, () => {
            scheduleInvalidation("team");
            scheduleInvalidation("sessions");
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              void reconcileActiveData();
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
        startReconcileTimers();
      } finally {
        connecting = false;
      }
    };

    const forceOnlineRecovery = () => {
      if (disposed || navigator.onLine === false) return;
      teardownChannel();
      startReconcileTimers();
      void healSession().then(() => connect()).then(() => reconcileActiveData());
    };
    const onOnline = () => forceOnlineRecovery();
    const onOffline = () => teardownChannel();
    const onVisibility = () => {
      if (document.visibilityState === "visible") forceOnlineRecovery();
      else void pollNotifications();
    };
    const onWindowFocus = () => forceOnlineRecovery();
    const onWindowBlur = () => void pollNotifications();
    const onCloudSessionRestored = () => {
      if (!channel) void connect();
      void pollNotifications();
    };

    void connect();
    startReconcileTimers();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("dentalflow:desktop-cloud-session-restored", onCloudSessionRestored);
    document.addEventListener("visibilitychange", onVisibility);

    const auth = supabase.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "INITIAL_SESSION", "USER_UPDATED", "TOKEN_REFRESHED"].includes(event)) {
        teardownChannel();
        queueReconnect();
        window.setTimeout(() => void reconcileActiveData(), 150);
      }
      if (event === "SIGNED_OUT") {
        currentUserId = null;
        teardownChannel();
        clearReconcileTimers();
      }
    });
    authSubscription = auth.data.subscription;

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearEntityInvalidationTimer();
      clearReconcileTimers();
      clearPendingCaseNative();
      pendingCaseIds.clear();
      pendingDomains.clear();
      deliveredNativeIds.clear();
      seenNotificationIds.clear();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("dentalflow:desktop-cloud-session-restored", onCloudSessionRestored);
      document.removeEventListener("visibilitychange", onVisibility);
      authSubscription?.unsubscribe();
      teardownChannel();
    };
  }, [queryClient]);

  return null;
}

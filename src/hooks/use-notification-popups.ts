import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subscribeEntity } from "@/lib/optimistic";
import { isDentalFlowDesktop, playDesktopNotificationSound } from "@/lib/desktop-local";
import notificationSound from "@/assets/notification.mp3";

export type PopupNotification = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  type?: string | null;
  metadata?: any;
  read_at?: string | null;
};

/**
 * Unified notification presentation for Web + Desktop.
 *
 * Desktop owns exactly one recipient-scoped Realtime channel in
 * DesktopRealtimeSync. This hook only renders in-app popups there, avoiding a
 * second websocket and duplicate delivery. When the Desktop is in background,
 * the global bridge has already handed the event to the Windows notification
 * center, so no hidden in-app popup or browser Notification API is required.
 */
export function useNotificationPopups() {
  const [popups, setPopups] = useState<PopupNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const seenIds = useRef(new Set<string>());
  const currentUserId = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const desktop = isDentalFlowDesktop();

  const openNotification = (n: PopupNotification) => {
    const meta = (n.metadata || {}) as { case_id?: string; activity_id?: string | null };
    if (!meta.case_id) return;
    const focus = n.type === "comment" ? "comments" : n.type === "attachment" ? "attachments" : "overview";

    if (window.location.pathname.startsWith("/casos")) {
      window.dispatchEvent(new CustomEvent("dentalflow:open-case-dialog", {
        detail: {
          caseId: meta.case_id,
          focus,
          msgId: meta.activity_id ?? null,
        },
      }));
      return;
    }

    const hash = new URLSearchParams({ case: meta.case_id, focus });
    if (focus === "comments") hash.set("tab", "comentarios");
    if (meta.activity_id) hash.set("msg", meta.activity_id);

    void navigate({
      to: "/casos",
      search: { case: undefined, msg: undefined },
      hash: hash.toString(),
      replace: false,
    } as any);
  };

  useEffect(() => {
    const element = new Audio(notificationSound);
    element.preload = "auto";
    element.volume = 1;
    audio.current = element;

    const prime = () => {
      const old = element.volume;
      element.volume = 0;
      void element.play().then(() => {
        element.pause();
        element.currentTime = 0;
        element.volume = old;
      }).catch(() => {
        element.volume = old;
      });

      if (!desktop && typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission().catch(() => undefined);
      }
    };
    window.addEventListener("pointerdown", prime, { once: true, capture: true });
    window.addEventListener("keydown", prime, { once: true, capture: true });

    return () => {
      element.pause();
      audio.current = null;
    };
  }, [desktop]);

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: number | null = null;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const playWebSound = () => {
      const a = audio.current;
      if (!a) return;
      try {
        a.currentTime = 0;
        void a.play().catch(() => undefined);
      } catch {}
    };

    const playSound = () => {
      if (!desktop) {
        playWebSound();
        return;
      }
      void playDesktopNotificationSound().then((played) => {
        if (!played) playWebSound();
      }).catch(() => playWebSound());
    };

    const showExternalWebNotification = (n: PopupNotification) => {
      const background = document.hidden || !document.hasFocus();
      if (!background) return false;

      if (desktop) return true;

      if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
      try {
        const meta = (n.metadata || {}) as { sender_name?: string | null; case_label?: string | null };
        const title = meta.sender_name
          ? `${meta.sender_name}${n.type === "attachment" ? " anexou um arquivo" : " comentou"}${meta.case_label ? ` · ${meta.case_label}` : ""}`
          : n.title || "DentalFlow";
        const systemNotification = new Notification(title, {
          body: n.content || "",
          icon: "/icon-512.png",
          badge: "/icon-512.png",
          tag: n.id,
        });
        systemNotification.onclick = () => {
          window.focus();
          openNotification(n);
          systemNotification.close();
        };
        return true;
      } catch {
        return false;
      }
    };

    const deliver = (raw: any) => {
      const n = raw as PopupNotification & { recipient_id?: string | null };
      if (!n?.id || seenIds.current.has(n.id)) return;
      if (currentUserId.current && n.recipient_id && n.recipient_id !== currentUserId.current) return;
      seenIds.current.add(n.id);

      qc.setQueryData<any[]>(["notifications"], (old = []) =>
        old.some((item) => item?.id === n.id) ? old.map((item) => item?.id === n.id ? { ...item, ...n } : item) : [n, ...old],
      );
      setUnreadCount((value) => value + 1);

      if (showExternalWebNotification(n)) return;
      playSound();
      setPopups((old) => old.some((item) => item.id === n.id) ? old : [n, ...old].slice(0, 5));
    };

    const disconnect = () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (!channel) return;
      const old = channel;
      channel = null;
      void supabase.removeChannel(old);
    };

    const scheduleReconnect = () => {
      if (desktop || disposed || navigator.onLine === false || retryTimer !== null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect();
      }, 900);
    };

    const connect = async () => {
      if (desktop || disposed || channel || navigator.onLine === false) return;
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
      const user = data.session?.user;
      if (!user || user.user_metadata?.dentalflow_offline_device || disposed) return;
      currentUserId.current = user.id;

      const next = supabase
        .channel(`notification-popups:${user.id}:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => deliver(payload.new),
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
        )
        .subscribe((status) => {
          if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            if (channel === next) channel = null;
            void supabase.removeChannel(next);
            scheduleReconnect();
          }
        });
      channel = next;
    };

    const unsubPeer = subscribeEntity("notifications", (payload) => {
      if (payload.op === "insert" && payload.row) deliver(payload.row);
      if (payload.op === "update") void qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    const onDesktopRealtime = (event: Event) => deliver((event as CustomEvent).detail);
    window.addEventListener("dentalflow:realtime-notification", onDesktopRealtime as EventListener);

    if (desktop) {
      void supabase.auth.getSession().then(({ data }) => {
        currentUserId.current = data.session?.user?.id ?? null;
      }).catch(() => undefined);
    } else {
      const onOnline = () => {
        disconnect();
        void connect();
      };
      const onOffline = () => disconnect();
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);

      const auth = supabase.auth.onAuthStateChange((event) => {
        if (["SIGNED_IN", "INITIAL_SESSION", "USER_UPDATED"].includes(event)) {
          disconnect();
          window.setTimeout(() => void connect(), 30);
        }
        if (event === "SIGNED_OUT") disconnect();
      });
      authSubscription = auth.data.subscription;
      void connect();

      return () => {
        disposed = true;
        disconnect();
        authSubscription?.unsubscribe();
        unsubPeer();
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("dentalflow:realtime-notification", onDesktopRealtime as EventListener);
      };
    }

    return () => {
      disposed = true;
      disconnect();
      (authSubscription as { unsubscribe: () => void } | null)?.unsubscribe();
      unsubPeer();
      window.removeEventListener("dentalflow:realtime-notification", onDesktopRealtime as EventListener);
    };
  }, [desktop, navigate, qc]);

  const removePopup = (id: string) => setPopups((old) => old.filter((item) => item.id !== id));

  return {
    popups,
    unreadCount,
    setUnreadCount,
    removePopup,
    openNotification,
  };
}

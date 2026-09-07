import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subscribeEntity } from "@/lib/optimistic";
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
 * Unified notification delivery for Web + Desktop.
 *
 * 0.3.0 keeps one recipient-scoped postgres_changes channel, recreates it after
 * auth/network changes and never mutates a channel after subscribe(). Desktop also
 * receives the central realtime bridge event as a second, deduplicated delivery
 * path. Notification clicks use TanStack Router, so opening a comment never reloads
 * the whole Cases page.
 */
export function useNotificationPopups() {
  const [popups, setPopups] = useState<PopupNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const seenIds = useRef(new Set<string>());
  const currentUserId = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const openNotification = (n: PopupNotification) => {
    const meta = (n.metadata || {}) as { case_id?: string; activity_id?: string | null };
    if (!meta.case_id) return;
    const focus = n.type === "comment" ? "comments" : n.type === "attachment" ? "attachments" : "overview";
    const hash = new URLSearchParams({ case: meta.case_id, focus });
    if (focus === "comments") hash.set("tab", "comentarios");
    if (meta.activity_id) hash.set("msg", meta.activity_id);

    void navigate({
      to: "/casos",
      search: { case: meta.case_id, msg: meta.activity_id || undefined },
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
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission().catch(() => undefined);
      }
    };
    window.addEventListener("pointerdown", prime, { once: true, capture: true });
    window.addEventListener("keydown", prime, { once: true, capture: true });

    return () => {
      element.pause();
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: number | null = null;

    const playSound = () => {
      const a = audio.current;
      if (!a) return;
      try {
        a.currentTime = 0;
        void a.play().catch(() => undefined);
      } catch {}
    };

    const showSystemNotification = (n: PopupNotification) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
      if (!document.hidden && document.hasFocus()) return false;
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
        old.some((item) => item?.id === n.id) ? old : [n, ...old],
      );
      setUnreadCount((value) => value + 1);
      playSound();

      if (!showSystemNotification(n)) {
        setPopups((old) => old.some((item) => item.id === n.id) ? old : [n, ...old].slice(0, 5));
      }
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
      if (disposed || navigator.onLine === false || retryTimer !== null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect();
      }, 900);
    };

    const connect = async () => {
      if (disposed || channel || navigator.onLine === false) return;
      const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
      const user = data.user;
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

    const onOnline = () => {
      disconnect();
      void connect();
    };
    const onOffline = () => disconnect();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const auth = supabase.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "TOKEN_REFRESHED", "INITIAL_SESSION"].includes(event)) {
        disconnect();
        window.setTimeout(() => void connect(), 30);
      }
      if (event === "SIGNED_OUT") disconnect();
    });

    void connect();

    return () => {
      disposed = true;
      disconnect();
      auth.data.subscription.unsubscribe();
      unsubPeer();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("dentalflow:realtime-notification", onDesktopRealtime as EventListener);
    };
  }, [navigate, qc]);

  const removePopup = (id: string) => setPopups((old) => old.filter((item) => item.id !== id));

  return {
    popups,
    unreadCount,
    setUnreadCount,
    removePopup,
    openNotification,
  };
}

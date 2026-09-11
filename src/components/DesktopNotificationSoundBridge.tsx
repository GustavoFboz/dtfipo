import { useEffect, useRef } from "react";

import { isDentalFlowDesktop, playDesktopNotificationSound } from "@/lib/desktop-local";

/**
 * Plays one Windows system notification sound for every newly ingested
 * canonical notification in DentalFlow Desktop, even while the app is focused.
 * Native background toasts intentionally do not play their own sound so the
 * user never hears duplicate alerts from realtime + polling reconciliation.
 */
export function DesktopNotificationSoundBridge() {
  const deliveredIds = useRef(new Set<string>());

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    const onNotification = (event: Event) => {
      const row = (event as CustomEvent<Record<string, any>>).detail;
      const id = String(row?.id ?? "");
      if (!id || deliveredIds.current.has(id)) return;

      deliveredIds.current.add(id);
      void playDesktopNotificationSound().then((played) => {
        if (!played) deliveredIds.current.delete(id);
      });

      // Keep the dedupe set bounded during long-running desktop sessions.
      if (deliveredIds.current.size > 500) {
        const oldest = deliveredIds.current.values().next().value;
        if (oldest) deliveredIds.current.delete(oldest);
      }
    };

    window.addEventListener("dentalflow:realtime-notification", onNotification as EventListener);
    return () => {
      window.removeEventListener("dentalflow:realtime-notification", onNotification as EventListener);
      deliveredIds.current.clear();
    };
  }, []);

  return null;
}

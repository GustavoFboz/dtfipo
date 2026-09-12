import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";

const ANDROID_CHANNEL_ID = "dentalflow-notifications-v2";
const DENTALFLOW_SOUND = "dentalflow_notification.mp3";
const PUSH_ENABLED = import.meta.env.VITE_DENTALFLOW_PUSH_ENABLED === "true";

function notificationId(value: unknown) {
  const text = String(value ?? Date.now());
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash || 1);
}

/**
 * Android startup must never depend on FCM being provisioned. 0.1.0 registered
 * PushNotifications on every boot; on builds without google-services.json that
 * could tear down the Activity before the WebView became usable.
 *
 * Realtime + local Android notifications are the stable transport in 0.2.0.
 * Remote FCM registration is opt-in through VITE_DENTALFLOW_PUSH_ENABLED=true.
 */
export function MobileNativeBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    const initialize = async () => {
      try {
        const permission = await LocalNotifications.checkPermissions();
        if (permission.display !== "granted") {
          await LocalNotifications.requestPermissions().catch(() => undefined);
        }

        // Android notification-channel sound is immutable after first creation.
        // A versioned id guarantees that users upgrading from 0.1.0 receive the
        // DentalFlow sound instead of the old "default" channel configuration.
        await LocalNotifications.createChannel({
          id: ANDROID_CHANNEL_ID,
          name: "DentalFlow",
          description: "Casos, mensagens e atividades do DentalFlow",
          importance: 5,
          visibility: 1,
          vibration: true,
          sound: DENTALFLOW_SOUND,
        });
      } catch (error) {
        console.warn("[DentalFlow Mobile] Notificações locais indisponíveis", error);
      }

      try {
        const localHandle = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          ({ notification }) => {
            const target = notification.extra?.url;
            if (typeof target === "string" && target.startsWith("/")) window.location.assign(target);
          },
        );
        if (!disposed) handles.push(localHandle);
      } catch (error) {
        console.warn("[DentalFlow Mobile] Listener de notificação local indisponível", error);
      }

      if (!PUSH_ENABLED) return;

      // FCM is intentionally isolated from the critical startup path. Provider
      // configuration can be enabled later without changing the offline/runtime
      // architecture of the app.
      try {
        const permission = await PushNotifications.checkPermissions();
        const granted = permission.receive === "granted"
          ? permission
          : await PushNotifications.requestPermissions();

        if (granted.receive === "granted") {
          await PushNotifications.register();

          const pushHandle = await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            ({ notification }) => {
              const target = notification.data?.url;
              if (typeof target === "string" && target.startsWith("/")) window.location.assign(target);
            },
          );
          if (!disposed) handles.push(pushHandle);
        }
      } catch (error) {
        console.warn("[DentalFlow Mobile] Push remoto não foi ativado", error);
      }
    };

    void initialize();

    const onCanonicalNotification = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail ?? {};
      const title = String(detail.title ?? detail.subject ?? "DentalFlow");
      const body = String(detail.message ?? detail.body ?? detail.content ?? "Você recebeu uma nova atualização.");
      const caseId = detail.metadata?.case_id ?? detail.case_id ?? null;
      const url = detail.url ?? detail.href ?? (caseId ? `/casos#case=${encodeURIComponent(String(caseId))}` : null);

      void LocalNotifications.schedule({
        notifications: [{
          id: notificationId(detail.id),
          title,
          body,
          channelId: ANDROID_CHANNEL_ID,
          sound: DENTALFLOW_SOUND,
          extra: { url },
          schedule: { at: new Date(Date.now() + 40) },
        }],
      }).catch((error) => {
        console.warn("[DentalFlow Mobile] Falha ao apresentar notificação local", error);
      });
    };

    window.addEventListener("dentalflow:realtime-notification", onCanonicalNotification as EventListener);

    return () => {
      disposed = true;
      window.removeEventListener("dentalflow:realtime-notification", onCanonicalNotification as EventListener);
      for (const handle of handles) void handle.remove();
    };
  }, []);

  return null;
}

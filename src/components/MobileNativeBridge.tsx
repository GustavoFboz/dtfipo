import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

function notificationId(value: unknown) {
  const text = String(value ?? Date.now());
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash || 1);
}

export function MobileNativeBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    void (async () => {
      try {
        const localPermission = await LocalNotifications.checkPermissions();
        if (localPermission.display !== 'granted') await LocalNotifications.requestPermissions();
        if (Capacitor.getPlatform() === 'android') {
          await LocalNotifications.createChannel({
            id: 'dentalflow-notifications',
            name: 'DentalFlow',
            description: 'Notificações de casos e atividades do DentalFlow',
            importance: 5,
            visibility: 1,
            vibration: true,
            sound: 'default',
          });
        }
      } catch (error) {
        console.warn('[mobile] local notification setup failed', error);
      }

      try {
        const permission = await PushNotifications.checkPermissions();
        const granted = permission.receive === 'granted'
          ? permission
          : await PushNotifications.requestPermissions();
        if (granted.receive === 'granted') {
          await PushNotifications.register().catch((error) => {
            // A release de teste funciona sem FCM; o token remoto passa a ser
            // registrado assim que google-services.json for provisionado.
            console.warn('[mobile] push registration pending provider config', error);
          });
        }
      } catch (error) {
        console.warn('[mobile] push permission setup failed', error);
      }

      const realtimeHandle = await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        const target = notification.extra?.url;
        if (typeof target === 'string' && target.startsWith('/')) window.location.assign(target);
      });
      if (!disposed) handles.push(realtimeHandle);

      const pushHandle = await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const target = notification.data?.url;
        if (typeof target === 'string' && target.startsWith('/')) window.location.assign(target);
      });
      if (!disposed) handles.push(pushHandle);
    })();

    const onCanonicalNotification = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail ?? {};
      const title = detail.title ?? detail.subject ?? 'DentalFlow';
      const body = detail.message ?? detail.body ?? detail.content ?? 'Você recebeu uma nova atualização.';
      void LocalNotifications.schedule({
        notifications: [{
          id: notificationId(detail.id),
          title: String(title),
          body: String(body),
          channelId: Capacitor.getPlatform() === 'android' ? 'dentalflow-notifications' : undefined,
          sound: 'default',
          extra: { url: detail.url ?? detail.href ?? null },
        }],
      }).catch(() => {});
    };

    window.addEventListener('dentalflow:realtime-notification', onCanonicalNotification as EventListener);
    return () => {
      disposed = true;
      window.removeEventListener('dentalflow:realtime-notification', onCanonicalNotification as EventListener);
      for (const handle of handles) void handle.remove();
    };
  }, []);

  return null;
}

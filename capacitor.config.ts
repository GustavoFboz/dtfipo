import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.dentalflow.mobile',
  appName: 'DentalFlow',
  webDir: 'dist/client',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#2D7FF9',
      sound: 'dentalflow_notification.mp3',
    },
  },
};

export default config;

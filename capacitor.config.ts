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
      smallIcon: 'ic_stat_dentalflow',
      iconColor: '#2D7FF9',
      sound: 'default',
    },
  },
};

export default config;

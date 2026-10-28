import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ukaeke.uceno',
  appName: 'UCENO',
  webDir: 'www',
  server: { url: 'https://uceno-social.onrender.com', cleartext: false, androidScheme: 'https' },
  plugins: { PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] } },
};

export default config;

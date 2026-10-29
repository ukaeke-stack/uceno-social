'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

type CallAudioRoutePlugin = { createIncomingCallChannel(): Promise<void> };
const CallAudioRoute = registerPlugin<CallAudioRoutePlugin>('CallAudioRoute');

let initialized = false;

export async function registerNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || initialized) return;
  initialized = true;

  const permissions = await PushNotifications.checkPermissions();
  const result = permissions.receive === 'granted'
    ? permissions
    : await PushNotifications.requestPermissions();
  if (result.receive !== 'granted') {
    initialized = false;
    return;
  }

  if (Capacitor.getPlatform() === 'android') {
    await PushNotifications.createChannel({ id: 'uceno_notifications', name: 'UCENO notifications', importance: 4, sound: 'default' });
    try { await CallAudioRoute.createIncomingCallChannel(); } catch (error) { console.error('UCENO call notification channel setup failed', error); }
  }

  await PushNotifications.addListener('registration', async ({ value }) => {
    try {
      await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: value, platform: Capacitor.getPlatform() }),
      });
    } catch (error) {
      console.error('UCENO push token registration failed', error);
    }
  });

  await PushNotifications.addListener('registrationError', error => {
    console.error('UCENO push registration failed', error);
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const target = action.notification.data?.url;
    if (typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')) {
      window.location.assign(target);
    } else {
      window.location.assign('/?section=notifications');
    }
  });

  await PushNotifications.register();
}

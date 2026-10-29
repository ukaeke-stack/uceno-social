'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';

type CallAudioRoutePlugin = {
  requestMediaPermissions(): Promise<void>;
  startRingtone(): Promise<void>;
  stopRingtone(): Promise<void>;
  setSpeakerphone(options: { enabled: boolean }): Promise<{ speakerOn: boolean }>;
  resetCallAudio(): Promise<void>;
};

const CallAudioRoute = registerPlugin<CallAudioRoutePlugin>('CallAudioRoute');

export async function requestNativeMediaPermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try { await CallAudioRoute.requestMediaPermissions(); return true; } catch { return false; }
}

export async function startNativeCallRingtone(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try { await CallAudioRoute.startRingtone(); return true; } catch { return false; }
}

export async function stopNativeCallRingtone(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await CallAudioRoute.stopRingtone(); } catch {}
}

export async function setNativeSpeakerphone(enabled: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try { const result = await CallAudioRoute.setSpeakerphone({ enabled }); return result.speakerOn === enabled; } catch { return false; }
}

export async function resetNativeCallAudio(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await CallAudioRoute.resetCallAudio(); } catch {}
}

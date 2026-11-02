package com.uceno.virtualworld;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import com.unity3d.player.UnityPlayer;
import java.util.List;

/** Android communication-route adapter for UCENO proximity voice. */
public final class UCENOAudioRoute {
    private UCENOAudioRoute() {}

    public static boolean setRoute(String route) {
        try {
            Context context = UnityPlayer.currentActivity;
            if (context == null) return false;
            AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return false;
            audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                int wanted = routeType(route);
                for (AudioDeviceInfo device : audio.getAvailableCommunicationDevices()) {
                    int actual = device.getType();
                    boolean match = actual == wanted ||
                        ("bluetooth".equals(route) && actual == AudioDeviceInfo.TYPE_BLUETOOTH_SCO);
                    if (match) return audio.setCommunicationDevice(device);
                }
                return false;
            }
            if ("speaker".equals(route)) {
                audio.setBluetoothScoOn(false);
                audio.setSpeakerphoneOn(true);
                return true;
            }
            if ("earpiece".equals(route)) {
                audio.setBluetoothScoOn(false);
                audio.setSpeakerphoneOn(false);
                return true;
            }
            if ("bluetooth".equals(route)) {
                audio.setSpeakerphoneOn(false);
                audio.startBluetoothSco();
                audio.setBluetoothScoOn(true);
                return true;
            }
            return false;
        } catch (Exception error) { return false; }
    }

    public static void clearRoute() {
        try {
            Context context = UnityPlayer.currentActivity;
            if (context == null) return;
            AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audio.clearCommunicationDevice();
            else {
                audio.setBluetoothScoOn(false);
                audio.stopBluetoothSco();
                audio.setSpeakerphoneOn(false);
            }
            audio.setMode(AudioManager.MODE_NORMAL);
        } catch (Exception ignored) {}
    }

    private static int routeType(String route) {
        if ("speaker".equals(route)) return AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
        if ("earpiece".equals(route)) return AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
        if ("bluetooth".equals(route)) {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? AudioDeviceInfo.TYPE_BLE_HEADSET : AudioDeviceInfo.TYPE_BLUETOOTH_SCO;
        }
        return -1;
    }
}
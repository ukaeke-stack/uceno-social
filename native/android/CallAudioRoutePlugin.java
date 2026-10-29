package com.ukaeke.uceno;

import android.Manifest;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "CallAudioRoute", permissions = {
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class CallAudioRoutePlugin extends Plugin {
    private Ringtone ringtone;

    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        boolean requiresCamera = "video".equals(call.getString("mode"));
        boolean microphoneGranted = getPermissionState("microphone") == PermissionState.GRANTED;
        boolean cameraGranted = !requiresCamera || getPermissionState("camera") == PermissionState.GRANTED;
        if (microphoneGranted && cameraGranted) {
            call.resolve();
            return;
        }
        String[] aliases = requiresCamera
            ? new String[] { "camera", "microphone" }
            : new String[] { "microphone" };
        requestPermissionForAliases(aliases, call, "mediaPermissionsCallback");
    }

    @PermissionCallback
    private void mediaPermissionsCallback(PluginCall call) {
        boolean requiresCamera = "video".equals(call.getString("mode"));
        boolean microphoneGranted = getPermissionState("microphone") == PermissionState.GRANTED;
        boolean cameraGranted = !requiresCamera || getPermissionState("camera") == PermissionState.GRANTED;
        if (microphoneGranted && cameraGranted) {
            call.resolve();
        } else {
            call.reject(requiresCamera
                ? "Camera and microphone permissions are required to answer video calls"
                : "Microphone permission is required to answer audio calls");
        }
    }


    @PluginMethod
    public void createIncomingCallChannel(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager == null) {
                    call.reject("Android notification service is unavailable");
                    return;
                }
                String channelId = "uceno_incoming_calls_v2";
                if (manager.getNotificationChannel(channelId) == null) {
                    NotificationChannel channel = new NotificationChannel(channelId, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
                    channel.setDescription("Incoming UCENO audio and video calls");
                    channel.enableVibration(true);
                    channel.setVibrationPattern(new long[] { 0, 700, 300, 700 });
                    Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                    if (ringtoneUri == null) ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                    AudioAttributes attributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                    channel.setSound(ringtoneUri, attributes);
                    channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                    manager.createNotificationChannel(channel);
                }
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not configure incoming call notifications", error);
        }
    }

    @PluginMethod
    public void startRingtone(PluginCall call) {
        try {
            if (ringtone == null || !ringtone.isPlaying()) {
                Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                ringtone = RingtoneManager.getRingtone(getContext(), sound);
                if (ringtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        ringtone.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.setLooping(true);
                    ringtone.play();
                }
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not start call ringtone", error);
        }
    }

    @PluginMethod
    public void stopRingtone(PluginCall call) {
        try {
            stopRingtoneInternal();
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not stop call ringtone", error);
        }
    }

    @PluginMethod
    public void setSpeakerphone(PluginCall call) {
        try {
            boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
            AudioManager manager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (manager == null) {
                call.reject("Android audio service is unavailable");
                return;
            }
            manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AudioDeviceInfo desired = null;
                for (AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
                    if (enabled && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                        desired = device;
                        break;
                    }
                    if (!enabled && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) desired = device;
                }
                if (desired == null || !manager.setCommunicationDevice(desired)) {
                    call.reject("Requested call audio device is not available");
                    return;
                }
            } else {
                manager.setSpeakerphoneOn(enabled);
            }
            JSObject result = new JSObject();
            result.put("speakerOn", enabled);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not change speakerphone route", error);
        }
    }

    @PluginMethod
    public void resetCallAudio(PluginCall call) {
        try {
            stopRingtoneInternal();
            AudioManager manager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (manager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) manager.clearCommunicationDevice();
                manager.setSpeakerphoneOn(false);
                manager.setMode(AudioManager.MODE_NORMAL);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not reset call audio route", error);
        }
    }

    private void stopRingtoneInternal() {
        if (ringtone != null) {
            if (ringtone.isPlaying()) ringtone.stop();
            ringtone = null;
        }
    }
}

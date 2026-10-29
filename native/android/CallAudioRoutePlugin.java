package com.ukaeke.uceno;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallAudioRoute")
public class CallAudioRoutePlugin extends Plugin {
    private Ringtone ringtone;

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
            manager.setSpeakerphoneOn(enabled);
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

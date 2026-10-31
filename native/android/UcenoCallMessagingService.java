package com.ukaeke.uceno;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class UcenoCallMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        Map<String,String> data = message.getData();
        if (!"call".equals(data.get("type")) || data.get("invitationId") == null) return;
        String id = data.get("invitationId");
        String caller = data.getOrDefault("callerHandle", "Someone");
        String mode = data.getOrDefault("mode", "audio");
        String channelId = "uceno_incoming_calls_v3";
        NotificationManager manager = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(channelId) == null) {
            NotificationChannel channel = new NotificationChannel(channelId, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Incoming UCENO audio and video calls");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0,700,300,700});
            Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringtone == null) ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            channel.setSound(ringtone, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.putExtra("url", "/calls?incoming=" + id);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(this, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent answer = actionPendingIntent(id, "accept", 1);
        PendingIntent decline = actionPendingIntent(id, "reject", 2);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(data.getOrDefault("title", "Incoming " + mode + " call"))
            .setContentText(data.getOrDefault("body", "@" + caller + " is calling you"))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(true)
            .setContentIntent(content)
            .addAction(android.R.drawable.sym_action_call, "Answer", answer)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", decline);
        manager.notify(id.hashCode(), builder.build());
    }
    private PendingIntent actionPendingIntent(String invitationId, String action, int requestCode) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.putExtra("url", "/calls?nativeCallAction=" + action + "&invitationId=" + invitationId);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, invitationId.hashCode() + requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}

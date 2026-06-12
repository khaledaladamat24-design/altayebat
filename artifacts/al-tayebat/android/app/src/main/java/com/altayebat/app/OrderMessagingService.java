package com.altayebat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.RemoteMessage;

import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;

import java.util.Map;

/**
 * Extends the @capacitor-firebase/messaging plugin service so its JS listeners
 * (tokenReceived / notificationReceived) keep working, while also starting a
 * native looping alarm ({@link OrderAlarmService}) for new orders.
 *
 * Requires DATA-ONLY FCM messages (no `notification` block) so onMessageReceived
 * fires even when the app is in the background or killed — see api-server fcm.ts.
 * This service replaces the plugin's auto-registered MessagingService via a
 * tools:node="remove" in AndroidManifest.xml.
 */
public class OrderMessagingService extends MessagingService {
    // A notification channel's sound is immutable once Android has created it,
    // so a device that already registered the old channel keeps playing the old
    // sound forever. Bumping the channel id forces a fresh channel that picks up
    // the current res/raw/order_alert.mp3. Bump this suffix whenever the sound
    // (or other channel attributes) change.
    private static final String FALLBACK_CHANNEL_ID = "orders_fallback_v2";
    private static final int FALLBACK_NOTIF_ID = 4712;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Forward to the Capacitor plugin so JS listeners still fire when alive.
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if (data == null) return;
        if (!"new_order".equals(data.get("type"))) return;

        String title = data.get("title");
        String body = data.get("body");

        // When the app is in the foreground the in-app vendor dashboard already
        // plays its own looping alert. We deliberately do NOT start the native
        // looping alarm here: while the app is foreground the vendor accepts the
        // order from the UI, which cannot signal this native service to stop, so
        // a foreground-started loop would keep blaring until manually killed.
        if (MainActivity.isForeground) return;

        Intent i = new Intent(this, OrderAlarmService.class);
        if (title != null) i.putExtra(OrderAlarmService.EXTRA_TITLE, title);
        if (body != null) i.putExtra(OrderAlarmService.EXTRA_BODY, body);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(i);
            } else {
                startService(i);
            }
        } catch (Exception e) {
            // Android 12+ can deny a background foreground-service start (OEM
            // policy / restricted app state) even for high-priority data FCM.
            // Don't drop the order — fall back to a single high-importance
            // heads-up notification so the vendor still gets an audible alert.
            postFallbackNotification(title, body);
        }
    }

    private void postFallbackNotification(String title, String body) {
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            String t = title != null ? title : "طلب جديد";
            String b = body != null ? body : "لديك طلب جديد بانتظار القبول";

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && nm.getNotificationChannel(FALLBACK_CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        FALLBACK_CHANNEL_ID,
                        "تنبيه الطلبات (احتياطي)",
                        NotificationManager.IMPORTANCE_HIGH);
                Uri sound = Uri.parse(
                        "android.resource://" + getPackageName()
                                + "/" + R.raw.order_alert);
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                ch.setSound(sound, attrs);
                ch.enableVibration(true);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }

            Intent openIntent = new Intent(this, MainActivity.class);
            openIntent.setFlags(
                    Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            // Tapping the fallback notification opens the vendor's orders list.
            openIntent.putExtra("navigateTo", "/vendor-dashboard");
            PendingIntent pi = PendingIntent.getActivity(
                    this, 2, openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Notification n = new NotificationCompat.Builder(this, FALLBACK_CHANNEL_ID)
                    .setContentTitle(t)
                    .setContentText(b)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setAutoCancel(true)
                    .setContentIntent(pi)
                    .build();
            nm.notify(FALLBACK_NOTIF_ID, n);
        } catch (Exception ignored) {
            // Best-effort fallback — nothing more we can do here.
        }
    }
}

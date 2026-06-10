package com.altayebat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service that plays the new-order alert sound on a LOOP until the
 * vendor stops it manually (taps "إيقاف الصوت", opens the app, or accepts the
 * order). A plain notification only plays its sound once, which is too easy to
 * miss — this guarantees the order is noticed even when the app is closed.
 *
 * Triggered by {@link OrderMessagingService} from a high-priority data-only FCM
 * message (see api-server fcm.ts). The sound asset is res/raw/order_alert.mp3.
 */
public class OrderAlarmService extends Service {
    public static final String ACTION_STOP = "com.altayebat.app.STOP_ORDER_ALARM";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";

    private static final String CHANNEL_ID = "orders_alarm";
    private static final int NOTIF_ID = 4711;

    private MediaPlayer player;
    private Vibrator vibrator;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopAlarm();
            return START_NOT_STICKY;
        }

        String title = "طلب جديد";
        String body = "لديك طلب جديد بانتظار القبول";
        if (intent != null) {
            if (intent.getStringExtra(EXTRA_TITLE) != null) {
                title = intent.getStringExtra(EXTRA_TITLE);
            }
            if (intent.getStringExtra(EXTRA_BODY) != null) {
                body = intent.getStringExtra(EXTRA_BODY);
            }
        }

        startForegroundWithNotification(title, body);
        startSound();
        startVibration();
        return START_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "تنبيه الطلبات",
                        NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("صوت تنبيه الطلبات الجديدة");
                // The looping sound is driven by MediaPlayer, so keep the
                // channel itself silent to avoid a double sound.
                ch.setSound(null, null);
                ch.enableVibration(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        }
    }

    private void startForegroundWithNotification(String title, String body) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(
                Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
                this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stopIntent = new Intent(this, OrderAlarmService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
                this, 1, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(contentPi)
                .addAction(0, "إيقاف الصوت", stopPi)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                    NOTIF_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, notification);
        }
    }

    private void startSound() {
        stopPlayer();
        try {
            player = new MediaPlayer();
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            player.setAudioAttributes(attrs);
            AssetFileDescriptor afd =
                    getResources().openRawResourceFd(R.raw.order_alert);
            player.setDataSource(
                    afd.getFileDescriptor(),
                    afd.getStartOffset(),
                    afd.getLength());
            afd.close();
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            // Fallback to the simpler create() path if the fd approach fails.
            try {
                player = MediaPlayer.create(this, R.raw.order_alert);
                if (player != null) {
                    player.setLooping(true);
                    player.start();
                }
            } catch (Exception ignored) {
                // Sound unavailable — the ongoing notification still shows.
            }
        }
    }

    private void startVibration() {
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] pattern = {0, 700, 600};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        } catch (Exception ignored) {
            // Vibration is best-effort.
        }
    }

    private void stopPlayer() {
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
                // already stopped
            }
            player.release();
            player = null;
        }
    }

    private void cancelVibration() {
        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception ignored) {
                // best-effort
            }
        }
    }

    private void stopAlarm() {
        stopPlayer();
        cancelVibration();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopPlayer();
        cancelVibration();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** Stop any active alarm (called when the vendor opens the app). */
    public static void stop(Context ctx) {
        Intent i = new Intent(ctx, OrderAlarmService.class);
        i.setAction(ACTION_STOP);
        try {
            ctx.startService(i);
        } catch (Exception ignored) {
            // Service may not be running — nothing to stop.
        }
    }
}

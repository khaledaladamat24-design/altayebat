package com.altayebat.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * Tracks whether the app is in the foreground so {@link OrderMessagingService}
     * can skip the native looping alarm when the in-app vendor dashboard is
     * already playing its own alert (avoids a double sound).
     */
    public static volatile boolean isForeground = false;

    /**
     * Route the web app should navigate to after being opened from a
     * notification tap. Set from the launching Intent's "navigateTo" extra and
     * consumed once by {@link AppNavPlugin#consumePendingRoute} from JS (on app
     * start and on resume). Null when the app was opened normally.
     */
    public static volatile String pendingRoute = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate so the Capacitor bridge
        // exposes them to the WebView.
        registerPlugin(BatteryOptimizationPlugin.class);
        registerPlugin(AppNavPlugin.class);
        registerPlugin(FacebookEventsPlugin.class);
        super.onCreate(savedInstanceState);
        // Cold start from a notification tap: capture the target route now so
        // the web layer can pick it up once it has loaded.
        captureNavRoute(getIntent());
        // Enable remote WebView inspection (chrome://inspect) for DEBUGGABLE
        // builds only (the CI debug APK). Install the debug APK to inspect the
        // Capacitor WebView on a connected device; release builds stay locked.
        if ((getApplicationInfo().flags
                & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Warm start from a notification tap (app was backgrounded/killed and
        // brought to front). Record the target route; onResume → the JS resume
        // listener consumes it and navigates.
        setIntent(intent);
        captureNavRoute(intent);
    }

    /**
     * Pull the notification's target route out of the launching Intent. The web
     * layer reads it via {@link AppNavPlugin} and performs the actual
     * navigation.
     */
    private void captureNavRoute(Intent intent) {
        if (intent == null) return;
        String route = intent.getStringExtra("navigateTo");
        if (route != null && !route.isEmpty()) {
            pendingRoute = route;
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        isForeground = true;
        // Opening the app means the vendor is now looking at it, so silence any
        // active looping order alarm (this also handles tapping the alarm
        // notification, which opens the app).
        OrderAlarmService.stop(this);
    }

    @Override
    public void onPause() {
        isForeground = false;
        super.onPause();
    }
}

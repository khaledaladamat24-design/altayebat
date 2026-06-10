package com.altayebat.app;

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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate so the Capacitor bridge
        // exposes it to the WebView. Lets the vendor dashboard request a
        // battery-optimization exemption for reliable background order pushes.
        registerPlugin(BatteryOptimizationPlugin.class);
        super.onCreate(savedInstanceState);
        // Enable remote WebView inspection (chrome://inspect) for DEBUGGABLE
        // builds only (the CI debug APK). Install the debug APK to inspect the
        // Capacitor WebView on a connected device; release builds stay locked.
        if ((getApplicationInfo().flags
                & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
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

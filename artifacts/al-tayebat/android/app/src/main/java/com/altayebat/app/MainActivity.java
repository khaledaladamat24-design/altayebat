package com.altayebat.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable remote WebView inspection (chrome://inspect) for DEBUGGABLE
        // builds only (the CI debug APK). Install the debug APK to inspect the
        // Capacitor WebView on a connected device; release builds stay locked.
        if ((getApplicationInfo().flags
                & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }
}

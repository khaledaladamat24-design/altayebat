package com.altayebat.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable remote WebView inspection (chrome://inspect) on a connected
        // device for ALL builds (including signed release APKs) so the
        // Capacitor WebView can be debugged while diagnosing native auth.
        WebView.setWebContentsDebuggingEnabled(true);
    }
}

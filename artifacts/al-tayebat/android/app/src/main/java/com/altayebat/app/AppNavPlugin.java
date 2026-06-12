package com.altayebat.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges a notification-tap target route to the web layer. When the vendor
 * taps a new-order notification, {@link MainActivity} records the target route
 * ("/vendor-dashboard") from the launching Intent's "navigateTo" extra. The web
 * app calls {@code consumePendingRoute()} on startup and on resume to read and
 * clear it, then navigates there. Returns {@code {route: null}} when the app was
 * opened normally (no notification tap).
 */
@CapacitorPlugin(name = "AppNav")
public class AppNavPlugin extends Plugin {

    @PluginMethod
    public void consumePendingRoute(PluginCall call) {
        JSObject ret = new JSObject();
        String route = MainActivity.pendingRoute;
        // Clear so a normal resume later doesn't re-navigate to it.
        MainActivity.pendingRoute = null;
        ret.put("route", route);
        call.resolve(ret);
    }
}

package com.altayebat.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the vendor exempt the app from OEM battery optimization. Aggressive
 * battery savers (Doze / OEM app-killers) are the #1 reason a high-priority
 * data-only FCM new-order push is delayed or dropped when the app is in the
 * background or killed. Exempting the app keeps onMessageReceived (and thus the
 * looping {@link OrderAlarmService}) reliable. Called from the vendor dashboard
 * only — never prompted for regular customers.
 */
@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptimizationPlugin extends Plugin {

    @PluginMethod
    public void isExempt(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("exempt", isIgnoringBatteryOptimizations());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestExemption(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !isIgnoringBatteryOptimizations()) {
            Context ctx = getContext();
            String pkg = ctx.getPackageName();
            try {
                Intent intent =
                        new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + pkg));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
            } catch (Exception e) {
                // Some OEMs block the direct request dialog — fall back to the
                // battery-optimization settings list so the vendor can still
                // exempt the app manually.
                try {
                    Intent intent =
                            new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(intent);
                } catch (Exception ignored) {
                    // Nothing more we can do; resolve anyway.
                }
            }
        }
        call.resolve();
    }

    private boolean isIgnoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }
}

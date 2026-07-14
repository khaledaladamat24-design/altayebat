package com.altayebat.app;

import android.os.Bundle;

import com.facebook.appevents.AppEventsConstants;
import com.facebook.appevents.AppEventsLogger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.math.BigDecimal;
import java.util.Currency;

/**
 * Bridges Meta (Facebook) App Events from the web layer to the native SDK.
 *
 * App launch / install events are logged automatically by the SDK
 * (AutoLogAppEventsEnabled in AndroidManifest.xml) — no code needed here.
 * This plugin adds the two explicit conversion events the web app fires:
 *
 *  - completeRegistration — a user finished sign-up (consumer or vendor)
 *  - purchase             — an order was placed (value in JOD)
 *
 * Both are fire-and-forget: failures resolve normally so tracking can never
 * break the app flow.
 */
@CapacitorPlugin(name = "FacebookEvents")
public class FacebookEventsPlugin extends Plugin {

    private AppEventsLogger logger;

    private AppEventsLogger getLogger() {
        if (logger == null) {
            logger = AppEventsLogger.newLogger(getContext());
        }
        return logger;
    }

    @PluginMethod
    public void completeRegistration(PluginCall call) {
        try {
            Bundle params = new Bundle();
            String method = call.getString("method");
            if (method != null) {
                params.putString(
                        AppEventsConstants.EVENT_PARAM_REGISTRATION_METHOD,
                        method);
            }
            getLogger().logEvent(
                    AppEventsConstants.EVENT_NAME_COMPLETED_REGISTRATION,
                    params);
        } catch (Exception ignored) {
            // Tracking must never break the app.
        }
        call.resolve();
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        try {
            Double value = call.getDouble("value");
            String currency = call.getString("currency", "JOD");
            if (value != null && value > 0) {
                getLogger().logPurchase(
                        BigDecimal.valueOf(value),
                        Currency.getInstance(currency));
            }
        } catch (Exception ignored) {
            // Tracking must never break the app.
        }
        call.resolve();
    }
}

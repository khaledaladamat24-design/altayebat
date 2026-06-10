import { Capacitor, registerPlugin } from "@capacitor/core";
import { apiUrl, authHeaders } from "./api-url";

// Native bridge to BatteryOptimizationPlugin.java — lets the vendor exempt the
// app from OEM battery optimization so background/killed new-order pushes (and
// the looping alarm) are delivered reliably.
interface BatteryOptimizationPlugin {
  isExempt(): Promise<{ exempt: boolean }>;
  requestExemption(): Promise<void>;
}
const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>(
  "BatteryOptimization",
);

// Don't re-prompt a vendor who keeps declining the battery exemption on every
// dashboard mount — back off for a few days between attempts.
const BATTERY_PROMPT_KEY = "al_tayebat_batt_prompt_ts";
const BATTERY_PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function batteryPromptDue(): boolean {
  try {
    const last = Number(localStorage.getItem(BATTERY_PROMPT_KEY) ?? 0);
    return !last || Date.now() - last > BATTERY_PROMPT_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markBatteryPrompted(): void {
  try {
    localStorage.setItem(BATTERY_PROMPT_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable — fine, we just prompt next time
  }
}

// FCM push registration. NATIVE-ONLY: web push is intentionally not wired up —
// the browser preview can never receive these. Safe to call repeatedly; it
// re-points the existing token to the current user. The owning user is resolved
// server-side from the auth session, so no userId is passed from the client.
export async function registerPushForUser(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== "granted") return;

    // No notification channel is created here: new-order pushes are DATA-ONLY
    // (see api-server fcm.ts) and handled natively by OrderMessagingService,
    // which starts OrderAlarmService. That foreground service owns its own
    // "orders_alarm" channel and loops res/raw/order_alert.mp3 until the vendor
    // stops it manually.

    const { token } = await FirebaseMessaging.getToken();
    if (token) await sendToken(token);

    // OEM battery optimization is the #1 reason a backgrounded/killed vendor
    // app never receives the high-priority data FCM new-order alarm. Ask the
    // vendor to whitelist the app — but only if not already exempt, and at most
    // once per cooldown so a vendor who keeps declining isn't nagged on every
    // dashboard mount.
    try {
      const { exempt } = await BatteryOptimization.isExempt();
      if (!exempt && batteryPromptDue()) {
        markBatteryPrompted();
        await BatteryOptimization.requestExemption();
      }
    } catch {
      // best-effort; older Android / unsupported OEMs just skip it
    }

    await FirebaseMessaging.removeAllListeners();
    await FirebaseMessaging.addListener("tokenReceived", (event) => {
      if (event?.token) void sendToken(event.token);
    });
  } catch (err) {
    console.warn("Push registration failed", err);
  }
}

async function sendToken(token: string) {
  try {
    await fetch(apiUrl("/api/devices/register"), {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        token,
        platform: Capacitor.getPlatform(),
      }),
    });
  } catch (err) {
    console.warn("Failed to send device token", err);
  }
}

// Drop this device's token from the backend (call on logout).
export async function unregisterPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      await fetch(apiUrl("/api/devices/unregister"), {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ token }),
      });
    }
    await FirebaseMessaging.deleteToken();
  } catch (err) {
    console.warn("Push unregister failed", err);
  }
}

import { Capacitor, registerPlugin } from "@capacitor/core";

// Native bridge to AppNavPlugin.java. When the vendor taps a new-order
// notification, MainActivity records the target route ("/vendor-dashboard")
// from the launching Intent. The web layer reads (and clears) it here, then
// navigates there. Returns { route: null } when the app was opened normally.
interface AppNavPlugin {
  consumePendingRoute(): Promise<{ route: string | null }>;
}
const AppNav = registerPlugin<AppNavPlugin>("AppNav");

// Only navigate to routes the app intentionally emits from notifications. Guards
// against a crafted external Intent supplying an arbitrary "navigateTo" value.
const ALLOWED_ROUTES = new Set(["/vendor-dashboard"]);

// Read a pending notification-tap route from the native layer and navigate to
// it. Called on app start and whenever the app resumes — tapping a notification
// while the app is backgrounded/killed brings it to the foreground, which fires
// the Capacitor "resume" event. Safe to call repeatedly: the native side clears
// the route once consumed, so it never re-navigates on a normal resume.
export async function consumePendingRoute(
  navigate: (to: string) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { route } = await AppNav.consumePendingRoute();
    if (route && ALLOWED_ROUTES.has(route)) navigate(route);
  } catch {
    // Plugin unavailable (web preview or older build) — nothing to navigate.
  }
}

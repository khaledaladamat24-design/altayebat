import { Capacitor, registerPlugin } from "@capacitor/core";

// Meta (Facebook) App Events bridge. The native side (FacebookEventsPlugin)
// forwards these to the Facebook SDK; on the web (browser preview) every call
// is a silent no-op. All calls are fire-and-forget — tracking must never
// break or delay the user flow.

interface FacebookEventsPlugin {
  completeRegistration(options: { method?: string }): Promise<void>;
  purchase(options: { value: number; currency?: string }): Promise<void>;
}

const FacebookEvents = registerPlugin<FacebookEventsPlugin>("FacebookEvents");

/** A user finished creating an account (consumer or vendor). */
export function trackCompleteRegistration(method: string): void {
  if (!Capacitor.isNativePlatform()) return;
  FacebookEvents.completeRegistration({ method }).catch(() => {});
}

/** An order was placed successfully. Value is the order total in JOD. */
export function trackPurchase(value: number): void {
  if (!Capacitor.isNativePlatform()) return;
  if (!Number.isFinite(value) || value <= 0) return;
  FacebookEvents.purchase({ value, currency: "JOD" }).catch(() => {});
}

---
name: Android looping new-order alarm
description: Why a "repeat until manually stopped" alert needs a native foreground service + data-only FCM, and the non-obvious wiring traps.
---

# A looping "never miss it" alert is NOT a notification-channel sound

A plain Android notification plays its channel sound exactly once. To make an
alert repeat until the user stops it manually, drive the sound from a native
foreground service `MediaPlayer.setLooping(true)` (USAGE_ALARM), not the channel.

**Why:** channel sound is one-shot and its sound/importance are immutable after
first creation; you cannot get a true loop out of it.

**How to apply (the non-obvious constraints):**

- The push MUST be **data-only** (no `notification` block) with
  `android.priority=high`. Only data-only messages invoke the app's
  `FirebaseMessagingService.onMessageReceived` when the app is backgrounded/killed;
  a `notification` payload is swallowed by the system tray and your code never runs.
- Only ONE service may own the `com.google.firebase.MESSAGING_EVENT` intent-filter.
  To customize, subclass the messaging plugin's service (call `super` so its JS
  listeners survive) and remove the plugin's auto-registered one via
  `xmlns:tools` + `tools:node="remove"` in the app manifest.
- A Capacitor plugin keeps `firebase-messaging` as a non-exposed `implementation`
  dep, so the app module must declare `com.google.firebase:firebase-messaging`
  itself (via firebase-bom) to reference `RemoteMessage`.
- **Do not start the looping alarm while the app is foreground.** A vendor who
  accepts the order from the in-app UI cannot signal the native service to stop,
  so a foreground-started loop blares until force-killed. Let the in-app loop
  handle foreground; the native alarm is for background/killed only.
- Android 12+ can still **deny** a background foreground-service start even for
  high-priority data FCM (OEM/Doze/restricted state). Wrap the start in try/catch
  and fall back to a single high-importance notification so the order isn't
  silently dropped.
- Resource sound names must be lowercase a-z/0-9/underscore; the `android/` raw
  asset survives `cap sync`. Real push + looping sound only fire in a native
  build, never the browser preview. The looped file is `res/raw/order_alert.mp3`
  loaded as `R.raw.order_alert` — swap the file content to change the sound,
  keep the resource name so the Java needs no edit.

## When the architecture is correct but background pushes still don't arrive

Once data-only + high-priority + IMPORTANCE_HIGH + native background handler are
all in place, the remaining real-world cause of "no alert when screen off / app
killed" is **OEM battery optimization / Doze**, not code. Force-stopped apps
(some OEMs treat swipe-from-recents as force-stop) get NO FCM until reopened.

**Fix:** a `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` exemption, requested via a tiny
native Capacitor plugin (`registerPlugin(...)` before `super.onCreate`) and
called only from the **vendor** push-registration path (never customers).
Guard with `isExempt()` + a local cooldown so a declining vendor isn't nagged.
Note: this permission is Play-policy-sensitive — justify it as core merchant
order-alert reliability in the Console declaration. Native plugin compile errors
only surface in Android CI, never in the TS typecheck/lint gates here.

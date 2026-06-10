---
name: Capacitor MainActivity lifecycle override visibility
description: Why overriding onResume/onPause/etc. in MainActivity must be public, not protected
---

# Capacitor lifecycle overrides must be `public`

When overriding Android `Activity` lifecycle methods (`onResume`, `onPause`, …) in
`MainActivity extends BridgeActivity`, declare them **`public`**, not `protected`.

**Why:** Capacitor's `BridgeActivity` already re-declares these lifecycle methods as
`public`. Java forbids an override from narrowing access, so `protected void onResume()`
fails to compile with: `attempting to assign weaker access privileges; was public`.
This only surfaces in the Android CI build (`compileReleaseJavaWithJavac`), never in the
TS typecheck/lint gates — so it's easy to miss until the GitHub APK/AAB build fails.

**How to apply:** Any lifecycle override added to `MainActivity` (or another
`BridgeActivity` subclass) → use `public`. Plain `Activity` defaults are `protected`,
but BridgeActivity is the relevant supertype here.

---
name: Capacitor Firebase phone auth
description: Why native phone OTP in this app uses @capacitor-firebase/authentication instead of the Firebase JS reCAPTCHA flow, and the non-obvious gotchas.
---

# Native Firebase phone OTP in Capacitor

The Firebase **JS Web SDK** `RecaptchaVerifier` + `signInWithPhoneNumber` flow does NOT work for live (non-test) phone numbers inside a Capacitor Android WebView. The invisible reCAPTCHA challenge can't complete its popup/redirect, so the WebView spins forever — Logcat shows a `setRequestedFrameRate frameRate=-4.0 ... CapacitorWebView` loop and the app freezes. Test phone numbers "work" only because they bypass reCAPTCHA entirely.

**Decision:** phone OTP branches on `Capacitor.isNativePlatform()`.

- Native: `@capacitor-firebase/authentication` — `signInWithPhoneNumber` then the `phoneCodeSent` / `phoneVerificationCompleted` / `phoneVerificationFailed` listeners, then `confirmVerificationCode`. Backed by Play Integrity / Android Device Verification, no WebView reCAPTCHA.
- Web browser: keep the JS `RecaptchaVerifier` path unchanged.

**Why:** native verification is the only reliable path for real-number SMS in an embedded WebView; keeping the web path preserves browser behaviour and the existing test suite.

**How to apply / gotchas:**

- Register **all** event listeners and `await` their `PluginListenerHandle`s (via `Promise.all`) _before_ calling `signInWithPhoneNumber` — instant verification can fire an event before a late listener exists and deadlock the promise.
- Handle `phoneVerificationCompleted` (instant verification, no code entry): the native SDK is already signed in; finalize directly instead of waiting for `phoneCodeSent`.
- Always clean up listener handles afterward and reset the stashed `verificationId` once consumed, so a stale id can't pass the "session exists" gate.
- Requires: `android/app/google-services.json`, the `FirebaseAuthentication` plugin block in `capacitor.config.ts`, the app's SHA-1/SHA-256 registered in the Firebase console, and **Android Device Verification (Play Integrity)** enabled in Google Cloud for the project.
- Real-number SMS cannot be tested in the Replit browser preview — only in an actual native build (CI `cap sync android` wires the plugin in automatically).

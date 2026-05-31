---
name: Firebase phone OTP "are blocked" / status 17499
description: How to diagnose Android Firebase phone-auth SMS failures in this app
---

# Firebase phone OTP blocked on native Android

Symptom: native build, OTP send fails with logcat `FirebaseAuth E [SmsRetrieverHelper] ... unknown status code: 17499 Requests from this Android client application com.altayebat.app are blocked.` during "reCAPTCHA Enterprise + phone verification".

## Key diagnostic: Firebase test phone number

Add a test number under Authentication → Sign-in method → Phone → "Phone numbers for testing" (number + fixed code). Test numbers bypass reCAPTCHA, Play Integrity, AND real SMS.

- **Test number works** → the app code + Firebase wiring are 100% correct. The block is in the **real-SMS app-verification layer** (signing SHA fingerprint + Play Integrity), NOT the code and NOT the Google Cloud API-key restriction.
- Confirmed in this project: test number worked while real numbers were blocked.

**Why:** "are blocked" has two independent sources — (1) Google Cloud API-key Application restriction, and (2) Firebase's own app/device verification (registered SHA-1/SHA-256 + Play Integrity). Setting the API key to **None does NOT disable layer (2)**. So if None doesn't help, suspect (2).

## How to apply

1. If test number works, stop touching the API key — focus on whether the **installed APK's actual SHA-256** is registered in Firebase Project Settings → Android app.
2. The CI keystore (`ANDROID_KEYSTORE_BASE64` secret) must match the registered fingerprint. Local keystore `.local/keystore/al-tayebat.keystore` SHA-1 = `38:7F:BF:E8:..:7D:A1`, SHA-256 = `17:E8:23:..:A4:C6`. If the installed APK differs, the secret holds a different keystore.
3. Sideloaded (non-Play) builds can still be flaky for real SMS; Google Play internal-testing track (with Play App Signing) is the robust path.

## Gotcha

`keytool -printcert -jarfile app.apk` says "Not a signed jar file" for modern v2/v3-only signed APKs — that does NOT mean unsigned. Use apksigner or read it from the CI log (see apk-signing-fingerprint.md).

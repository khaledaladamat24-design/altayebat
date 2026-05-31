# Memory Index

- [Firebase phone OTP "blocked"/17499](firebase-phone-auth-blocked.md) — test number working proves code+wiring fine; real-SMS block is the app-verification (SHA/Play Integrity) layer, not code or API-key.
- [Git push constraint](git-push-constraint.md) — main agent cannot git commit/push/fetch (sandbox blocks as destructive); user must push via Replit Git pane.
- [Reading the release APK signing fingerprint](apk-signing-fingerprint.md) — CI prints keystore + APK SHA-1/SHA-256 in the build log; local keytool/sisik are unreliable for v2/v3-signed APKs.

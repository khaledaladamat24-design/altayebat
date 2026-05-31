---
name: Reading the release APK signing fingerprint
description: How to obtain the actual SHA-1/SHA-256 of the signed Android build
---

# Reading the release APK signing fingerprint

Local tools were unreliable for the user: `keytool -printcert -jarfile` fails ("Not a signed jar file") on v2/v3-only signed APKs, sisik.eu/cert wants an extracted PKCS7 cert (not the APK), and KeyStore Explorer was confusing for a non-expert.

**Reliable approach:** the `Build Android App` CI workflow (`.github/workflows/main.yml`) prints fingerprints directly into the run log:
- "Print signing keystore fingerprints (SHA-1 / SHA-256)" — runs `keytool -list -v` on the decoded keystore.
- "Print APK signing certificate (apksigner)" — runs `apksigner verify --print-certs` on the built release APK (most authoritative).

**How to apply:** user pushes → open the workflow run → expand those two steps → read SHA-1/SHA-256 → compare against what's registered in Firebase Project Settings → Android app. Passwords are never echoed (only the fingerprint lines are grepped).

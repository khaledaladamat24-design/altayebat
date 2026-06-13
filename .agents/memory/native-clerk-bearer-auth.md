---
name: Native Clerk bearer-token auth
description: Why email/Clerk users are unauthenticated in the Capacitor build and how the bearer-token forwarding fixes it.
---

# Native Clerk users need a bearer token, not the cookie

In the Capacitor (Android) build the web bundle is served from the local
filesystem and calls the deployed API cross-origin
(`VITE_API_BASE_URL`). The Clerk `__session` cookie is therefore **never sent**,
so email/Clerk users (including the super-admin) are unauthenticated
server-side. Only phone users worked, because they forward `x-firebase-uid`.

**Symptom:** `403 {error:"Not authorized"}` on owner/IDOR-guarded routes
(e.g. `/api/auth/location` during registration), and the super-admin cannot act
in native — even though everything works in the browser preview.

**Fix (the durable rule):** forward the Clerk session JWT as
`Authorization: Bearer <token>` **only when native** (`Capacitor.isNativePlatform()`).
- The token is cached in memory (never localStorage) and kept fresh by a sync
  component refreshing on mount, on auth-state change, and on a short interval —
  Clerk JWTs are short-lived (~60s).
- Both request paths must attach it: the manual-fetch header builder AND the
  generated-hook default-headers getter.
- The server already verifies bearer tokens via Clerk JWKS, so no server change
  is needed.

**Why native-only gating matters:** on the web the session cookie already
authenticates same-origin (or via the Clerk proxy); attaching a possibly-stale
bearer token there could shadow the valid cookie. Gating to native keeps web
auth untouched and makes the change strictly non-regressive (a missing/invalid
token in native just yields the same 401/403 that already happened).

**Known edge:** a protected request firing before the first async `getToken()`
resolves can still 401 on cold start. In practice the registration location-save
runs after sign-in completes, so the on-mount refresh covers it; if intermittent
cold-start 401s appear, add a one-shot retry on 401 in native.

**Verification caveat:** real native behavior is only testable in an actual APK
build (CI), never the browser preview.

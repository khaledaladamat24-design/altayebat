---
name: Google sign-in uses Firebase, not Clerk OAuth
description: Why "Continue with Google" in al-tayebat goes through Firebase rather than Clerk, and how identity is bound.
---

Google sign-in ("المتابعة عبر Google") is implemented with **Firebase Auth**, NOT Clerk OAuth.

**Why:** Clerk's OAuth redirect/popup is blocked inside the Capacitor Android WebView (the
same reason phone auth uses Firebase, not Clerk). Firebase Google works on web
(`signInWithPopup`) and natively (`@capacitor-firebase/authentication` `signInWithGoogle`).

**How identity binds:** the flow reuses the existing phone-user transport — it proves
identity via Firebase, then upserts the local DB profile through `POST /api/users/profile`
with `{firebaseUid, email, name, role:"consumer"}`, exactly like the phone `completePhoneAuth`
path. Local markers (`al_tayebat_firebase_uid`, etc.) are written only AFTER the upsert
succeeds, to avoid a half-signed-in state.

**Known limitation (intentional):** like all profile upserts, this endpoint trusts the
client-supplied `firebaseUid`/`email` (see `header-trust-auth.md`) — it is the app-wide auth
model, not specific to Google. Hardening it to verify a Firebase ID token server-side would be
an app-wide change touching phone auth too; out of scope for adding the Google button.

**firebaseUid backfill is mandatory (regression):** when a Google sign-in's email
already has a row, `POST /api/users/profile` matches by email — it MUST backfill
`firebaseUid` on that row (isNull-guarded, first-write-wins, never overwrite), exactly
like the `clerkId` backfill. Without it the row keeps a null `firebase_uid`, so the
`x-firebase-uid` identity header never resolves in `getActingDbUserId` and owner-gated
routes (e.g. `POST /api/auth/location`) 403 "Not authorized" forever. Brand-new Google
emails are fine because the INSERT path stores the uid. **Why:** any new identity
transport added to the profile upsert must be backfilled onto email-matched rows or
header-based ownership silently breaks.

**Order gate still applies:** Google users carry no phone, so they still hit the
order-placement gate at checkout and must register a phone (by design).

**Native prerequisites:** `google.com` must be in the `FirebaseAuthentication.providers` list
in `capacitor.config.ts`, and `android/app/google-services.json` must contain a web OAuth
client (`client_type: 3`). Native Google sign-in is only testable in a real Android build.

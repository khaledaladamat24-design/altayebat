---
name: Firebase Android phone-auth auto-retrieval timing
description: Why the native phoneVerificationCompleted listener must outlive phoneCodeSent
---

# Android auto-retrieval fires AFTER phoneCodeSent

On native Android (`@capacitor-firebase/authentication`), the order of events for
`signInWithPhoneNumber` is normally: `phoneCodeSent` first, then a few seconds
later `phoneVerificationCompleted` once the SMS Retriever auto-reads the code
(silent / instant verification). Instant-verification-before-codeSent also exists
but is the rarer case.

**Rule:** keep a PERSISTENT `phoneVerificationCompleted` listener alive through the
whole OTP-entry screen. Do NOT remove all listeners in a `finally` right after
`phoneCodeSent` — that silently kills auto-retrieval and forces every user to type
the code manually.

**Why:** the old code resolved a single race promise on the first event and removed
every listener in `finally`; since `phoneCodeSent` wins the race in the common path,
the later auto-retrieval completion had no live listener and was dropped.

**How to apply:**

- Register the long-lived completion listener separately (store its handle in a ref)
  and a one-shot race only for the send result (code / instant-complete / failed).
- Dedupe finalize with a once-guard ref (auto + manual paths can both fire); reset
  the guard on new send, manual-verify failure, auto-verify failure, profile-save
  failure, and on leaving the OTP screen (Back/unmount).
- Tear the persistent listener down on unmount, on Back, and on a send that fails
  before reaching the OTP screen, or it leaks a stale callback.
- Firebase's `timeout` (capped 120s on Android) is the auto-retrieval window; mirror
  it in any on-screen resend countdown so UI matches the real timer.

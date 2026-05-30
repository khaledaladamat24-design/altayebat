---
name: Auth unified identifier form
description: Why the al-tayebat login/signup UI is one combined phone-or-email form, and how it dispatches to the existing backend flows
---

# Unified auth form (al-tayebat)

The login/signup UI (`artifacts/al-tayebat/src/pages/auth.tsx`) is a SINGLE
combined form (Tulip Market style): one identifier field accepting phone OR
email, plus password. There is intentionally no "choose a method" landing
screen and no separate email/phone screens.

**Rule:** the visible field is `identifier`; a change handler derives the
hidden `email`/`phone` state from it (email iff the value contains `@`). The
existing backend handlers (Clerk email password login, Firebase phone OTP +
`/api/auth/phone-login` + `/api/auth/set-password`) read `email`/`phone` and
are kept unchanged — only thin dispatchers route to them.

**Why:** the backend auth flows are battle-tested (see replit.md "Auth flows");
keeping them and only changing the UI shell avoids reworking Clerk/Firebase
logic. The user explicitly wanted the Tulip single-form UX.

**How to apply / gotchas when editing this file:**
- Keep the `<div ref={recaptchaRef} />` on whatever screen triggers
  `handleSendPhoneOtp` (currently the signup screen + login fallback) — Firebase
  needs the container mounted.
- Phone signup collects the password up front; `pendingPhonePassword` carries
  it so `handleOtpPhoneVerify` auto-saves it after OTP. `handlePhoneSetPassword`
  returns a boolean — on failure the user must fall back to the
  `phone-set-password` screen (the OTP code is single-use, so never strand them
  on the OTP step).
- Email signup has no name field; if Clerk rejects with `form_param_missing`,
  a first name is derived from the email local-part.

---
name: Order placement requires a registered phone
description: Why POST /api/orders rejects orders whose phone isn't already in the users table, and the policy choice behind it.
---

# Order placement gate (registered phone required)

`POST /api/orders` rejects **every** order — including Cash-on-Delivery — when the
submitted `customerPhone` does not resolve (in canonical `07XXXXXXXX` form, via the
shared `normalizePhone` helper) to an existing row in the `users` table. Invalid
phone → `400 {code:"INVALID_PHONE"}`; unregistered → `403 {code:"PHONE_NOT_REGISTERED"}`.

**Why:** the app's COD flow was guest-only with a self-reported, unverified phone —
the primary fake/fraud-order vector. When asked, the operator explicitly chose the
_lightest_ of three options: "the phone must already exist in the users DB" (rather
than full login-required, or OTP-on-every-order), and chose to apply it to COD too.

**How to apply:**

- Keep the gate server-side and ahead of any fee/charge logic — it must not be
  bypassable from the client. The checkout client only adds UX (redirect to `/auth`
  on `PHONE_NOT_REGISTERED`), it is not the enforcement point.
- Any test or flow that creates an order must use a `customerPhone` that belongs to a
  seeded `users` row, or it will now 403.
- Email-only (Clerk) signups store no phone, so they still hit the gate until a phone
  is registered — this is intended under the chosen policy, not a bug. If the operator
  later wants email accounts to order, that's a policy change (revisit with them).

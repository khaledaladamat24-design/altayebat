---
name: Header-trust auth weak point
description: The app authorizes some privileged routes from spoofable request headers; constrains what user endpoints may return.
---

# Header-trust authorization

The app's privilege checks partly rely on **raw, unverified request headers**, which
is the known weak point of its auth model:

- **Admin** (`requireAdmin` / `isAdminReq`, now in `lib/vendor-auth.ts`;
  `admin-auth.ts` keeps only `SUPER_ADMIN_EMAIL` + `getAdminPassword`): passes if
  the request carries the admin password (`x-admin-key`, a real secret) **or** a
  **verified** acting user (Clerk session, else `x-firebase-uid`) whose DB row is a
  super-admin (`role === "admin"` or email === `SUPER_ADMIN_EMAIL`). The old
  spoofable `x-admin-email` header bypass was **removed** — it is no longer read
  server-side, and the admin frontend no longer sends it (super-admin relies on the
  Clerk session cookie). `isAdminReq`/`requireAdmin` are now **async**.
- **Vendor / order / wallet** (`requireVendorOwner` / `requireOrderVendorOwner` /
  `requireWalletOwner`, plus the order balance-payment user resolution, all via
  `getActingDbUserId` in `lib/vendor-auth.ts`): resolves identity from the Clerk
  session, else falls back to matching a raw `x-firebase-uid` header against
  `users.firebase_uid`. Needed so phone/Firebase-registered users (no Clerk
  session) can use the dashboard **and their own wallet / wallet-balance checkout**,
  but the header is not cryptographically verified. Ownership is still enforced
  (`actingId === :userId`), so the fallback only changes _how_ identity is resolved,
  not whether ownership is checked.
- **How the frontend forwards it:** generated API hooks send `x-firebase-uid` via
  `setDefaultHeadersGetter()` (registered once in `App.tsx`, reads
  `localStorage.al_tayebat_firebase_uid`); manual `fetch` calls use `authHeaders()`
  from `lib/api-url.ts`. **Why:** phone-login users have no Clerk cookie, so without
  this every wallet/order-balance call 401s in production.

**Why this matters / how to apply:**

- Because `x-firebase-uid` is trusted as a fallback identity, **no public endpoint
  may ever return `firebaseUid`** (nor `passwordHash`). The open user-enumeration
  routes in `routes/users.ts` (`/users`, `/users/profile`) must funnel every
  response through the `publicUser()` sanitizer that drops those fields. Leaking the
  uid would let anyone replay it to pass the vendor/order guards.
- Returning a user their _own_ `firebaseUid` after they authenticate (e.g. the
  `/api/auth/phone-login` response) is fine — that's not enumeration.
- **Proper hardening (future):** verify a Firebase **ID token** server-side with the
  Firebase Admin SDK instead of trusting the raw uid header, and gate the
  super-admin path on a verified Clerk session email instead of `x-admin-email`.
  Both are larger changes (new dep / service-account secret, admin-login flow
  rework) deliberately left as follow-ups.

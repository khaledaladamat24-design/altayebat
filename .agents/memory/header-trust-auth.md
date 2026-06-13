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
  `users.firebase_uid`, else a raw `x-clerk-user-id` header against `users.clerk_id`.
  Needed so phone/Firebase-registered users **and native-WebView Clerk users** (the
  Clerk session cookie + `getToken()` don't reach the cross-origin API from the
  Capacitor shell) can use the dashboard / admin / wallet. Neither header is
  cryptographically verified. Ownership is still enforced (`actingId === :userId`),
  so the fallback only changes _how_ identity is resolved, not whether ownership is
  checked.
- **How the frontend forwards it:** generated API hooks send `x-firebase-uid` **and
  `x-clerk-user-id`** via `setDefaultHeadersGetter()` (registered once in `App.tsx`,
  reads `localStorage.al_tayebat_firebase_uid` / `al_tayebat_clerk_id`); manual
  `fetch` calls use `authHeaders()` from `lib/api-url.ts`. `al_tayebat_clerk_id` is
  persisted reactively by `ClerkTokenSync` from `useAuth().userId` and **cleared on
  sign-out** (stale id = wrong-account writes). **Why:** native users have no Clerk
  cookie reaching the API, so without this every owner/admin call 401s on Android.

**Why this matters / how to apply:**

- Because `x-firebase-uid` **and `x-clerk-user-id`** are trusted as fallback
  identities, **no public/enumerable endpoint may ever return `firebaseUid` OR
  `clerkId`** (nor `passwordHash`). The open user-enumeration routes in
  `routes/users.ts` (`/users`, `/users/profile`) funnel every response through the
  `publicUser()` sanitizer that drops all three; the admin-gated `/admin/users` also
  strips them. **Why:** leaking either id lets anyone replay it to pass the
  vendor/order/**admin** guards (e.g. enumerate the super-admin's clerkId →
  impersonate admin). A regression test
  (`routes/__tests__/users.no-identity-leak.test.ts`) asserts the public routes never
  return them — keep it green when changing user response shapes.
- Returning a user their _own_ `firebaseUid`/`clerkId` after they authenticate (e.g.
  the `/api/auth/phone-login` or other `stripUser` auth responses) is fine — that's
  the owner's own row, not cross-user enumeration.
- **Proper hardening (future):** verify a Firebase **ID token** server-side with the
  Firebase Admin SDK instead of trusting the raw uid header, and gate the
  super-admin path on a verified Clerk session email instead of `x-admin-email`.
  Both are larger changes (new dep / service-account secret, admin-login flow
  rework) deliberately left as follow-ups.

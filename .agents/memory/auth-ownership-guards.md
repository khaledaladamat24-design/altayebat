---
name: Auth ownership guards (IDOR)
description: How to authorize per-user write routes in the API server, and the localStorage gate-flag lifecycle pitfall.
---

# Per-user write routes must resolve the acting user server-side

Any route that mutates a specific `users` row by `userId` from the body/params
must verify ownership against a server-resolved identity — never trust the
client-supplied id alone, and never authorize solely by an optional header that
is absent for some account types.

**Why:** an early `POST /api/auth/location` authorized phone users by
`x-firebase-uid` but accepted email/Clerk rows (no `firebaseUid`) by id with no
session check → trivial IDOR (overwrite any non-phone user's location by guessing
the numeric id).

**How to apply:** use `getActingDbUserId(req)` from
`artifacts/api-server/src/lib/vendor-auth.ts` (Clerk session first, then
`x-firebase-uid` for phone accounts) and require `actingId === targetId`, with
`isAdminReq(req)` bypass. This is the canonical ownership pattern in this repo.

# localStorage gate flags must be cleared on every logout path

A global localStorage flag (e.g. `al_tayebat_location_set`) that releases a
signup/onboarding gate must be added to **every** logout key list (settings,
account, complete-location). Otherwise account B signing in on the same device
inherits account A's "done" flag and wrongly skips the gate.

**How to apply:** add the flag to `SIGNED_IN_KEYS` everywhere it's defined, and
clear the Clerk session (`signOut()`) on any in-gate "sign out" action or the
Clerk JWT (`__clerk_db_jwt`) leaves `isSignedIn()` true → redirect loop.

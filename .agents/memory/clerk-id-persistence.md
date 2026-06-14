---
name: clerkId persistence for email/Clerk users
description: Why email/Clerk user rows must have clerkId stored, and how the public profile upsert backfills it safely.
---

# clerkId must be persisted on email/Clerk user rows

The vendor / order / admin guards resolve a caller's identity by matching the DB
row's `clerkId` — via the Clerk session OR the forwarded `x-clerk-user-id`
header (native has no usable Clerk cookie/token, so it relies on the header).
If a user's row has `clerkId = null`, identity resolution returns nothing →
`isAdminReq` false → **403 "Not authorized"** on every owner/admin call,
including the super-admin saving their location.

**Rule:** any flow that signs in an email/Clerk user must persist that user's
Clerk id onto its `users` row.

**Why:** the client email upsert historically POSTed only `{email, role}` — no
clerkId — so email/Clerk rows (incl. the super-admin) stayed null and the whole
native identity-header path was dead. `clerk.user` hydrates a beat AFTER
`setActive`, so the value isn't available synchronously; the OTP-verify branch
already polls for it, so reuse that poll and pass `activeUser?.id`. Do NOT add a
second blocking poll inside the upsert — it delays navigation ~1.5s and breaks
the timing-sensitive auth-return-to tests (and the test's mock `clerk.user` has
no `id`, so an id-keyed poll never resolves).

**How to apply (server, public `POST /api/users/profile`):**
- Look up the existing row by clerkId → firebaseUid → email **sequentially**
  (not `else if`), so a pre-clerkId email row is found by email and updated, not
  duplicated.
- Backfill clerkId **only while it is still null**, with the guard in the WHERE
  (`...AND clerk_id IS NULL`) so it is atomic — "first write wins", concurrent
  claims can't both succeed, and a populated clerkId is never overwritten.
- **Why backfill-only-when-null:** this endpoint is public/unauthenticated and
  `clerkId` is a trusted identity header, so overwriting it would be account
  takeover. Backfill-once locks in the first (legitimate) login's id. Residual
  first-claim risk is inherent to the app's accepted header-trust model (no
  Clerk middleware on the API); closing it fully needs real server-side Clerk
  verification, which is a separate architectural change.
- `publicUser()` still strips clerkId from the response — never leak it.

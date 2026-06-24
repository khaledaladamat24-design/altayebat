---
name: Role onboarding gate + non-downgrade rule
description: How the consumer/vendor role-selection gate is signalled, and why login upserts must never demote an existing vendor/admin.
---

# Role onboarding gate (consumer vs vendor)

`users.auth_method` (nullable text) is the **"has chosen a role" signal**: NULL ⇒ not
onboarded ⇒ client routes to `/register` (role selection). It is set **only** when the
user submits a role choice (register.tsx `saveUserProfile`). Client routing helper
`routeAfterProfile(profile)` in `auth.tsx`: NULL authMethod → `/register`;
role==="vendor" → `/vendor-dashboard`; else home — all honor a stashed `returnTo`.

**Every auth entry path must route by profile, including the Clerk auto-session effect**
(already-signed-in users opening the auth page). An unconditional `setLocation("/")` there
silently bypasses the gate — fetch the profile first, then `routeAfterProfile`.

**Why:** existing users (esp. vendors) must NOT be forced back through selection; a
startup backfill (`backfill-auth-method.ts`) grandfathers rows older than a ~30-min cutoff
by inferring auth_method.

## Non-downgrade rule (CRITICAL)

Routine login/upsert flows (Google, email, phone) send `role:"consumer"` to
`POST /users/profile`. Without a guard, every returning vendor sign-in silently demotes
them to consumer (wrong routing, lost dashboard). The server computes an `effectiveRole`
that **never lowers an established vendor/admin** — role is only ever elevated (via the
explicit role-selection submit, or the super-admin email).

**How to apply:** any change to login/upsert payloads or the `/users/profile` update set
must preserve this: never write a lower role than the existing row already has from a
generic login. The endpoint is unauthenticated and identity-resolved, so role is
elevate-only here, never demote.

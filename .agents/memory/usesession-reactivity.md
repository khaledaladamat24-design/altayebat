---
name: useSession cart-session reactivity
description: How the cart sessionId hook must balance account-switch reactivity against the Android React #185 render-churn crash.
---

# useSession must be EVENT-driven reactive (not lazy-once, not per-render)

`artifacts/al-tayebat/src/hooks/use-session.ts` returns the cart `sessionId`
(`user_<id>` when signed in, else a random guest id in `al_tayebat_session`).

**Rule:** keep it reactive via window events only — subscribe to a custom
`al-tayebat-session-change` event + `storage`, and re-read on those. Do NOT make
it re-read on every render, and do NOT go back to read-once lazy `useState`.

**Why:**

- Read-once lazy `useState` (the original form) is stale across account switches:
  logging out then logging in as another account on the same device/tab kept the
  previous account's `sessionId`, so the old cart showed until a full reload.
- But re-reading `sessionId` on every render previously crashed the Android
  WebView with React error #185 (combined with Orval `useGetCart` returning a
  fresh queryKey reference each render). That's why it was lazy in the first
  place.
- Event-driven re-reads satisfy both: stable across renders, but updates the
  instant login/logout fires the event.

**How to apply:**

- Every login path that sets `al_tayebat_user_id` (and `auth.tsx` `goAfterAuth`)
  must call `notifySessionChange()`.
- Every logout / account-deletion path (`account.tsx`, `settings.tsx`) must call
  `resetGuestSession()` (rotates the guest id so the next account starts with an
  empty cart) then `notifySessionChange()`.

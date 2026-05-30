---
name: Guest auth return-to flow (al-tayebat)
description: Convention for sending guests to signup mid-action and returning them afterward, plus payment pre-selection.
---

# Guest → auth → return-to-where-you-were

When a guest hits an action that needs an account (currently: any non-COD payment
method at checkout), stash an intent and route through `/auth`, then bring them
back.

**Mechanism** (`artifacts/al-tayebat/src/lib/post-auth.ts`):

- `setReturnTo(path)` / `takeReturnTo()` use localStorage key `al_tayebat_return_to`.
- `takeReturnTo()` reads-and-clears (single use).

**Rule:** every auth _success_ path must finish with `takeReturnTo() || fallback`,
and explicit guest-exit paths (`skipAuth`) must call `takeReturnTo()` to discard a
stale intent. Email signup goes through `/register`, so its consumer-completion
handler is the one that consumes the return path for the email-signup branch.

**Why:** without consuming on every success and discarding on skip, a stale
`return_to` can silently bounce a later sign-in to `/checkout`.

**Payment pre-selection:** checkout stashes `al_tayebat_pending_payment` and
initializes `paymentMethod` from it (read-and-clear in the `useState` initializer).
A guard effect downgrades the selection to `cod` once the async vendor/wallet
lookups have completed (`vendorChecked` / `walletChecked` gates) if the method
turns out unavailable (guest, vendor hasn't enabled CliQ/wallet, or insufficient
balance) — otherwise the user lands on a selected-but-disabled option.

**Login detection** (checkout): signed-in if any of `al_tayebat_user_id`,
`al_tayebat_firebase_uid`, or `__clerk_db_jwt` exist — same markers SplashGate uses.

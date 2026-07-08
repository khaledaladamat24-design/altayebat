---
name: One-time seed flags
description: Rules for app_flags-gated one-time seeds and testing global bulk-delete endpoints against the shared dev DB
---

# One-time seed flags (app_flags)

- The demo-product seed is gated by an `app_flags` row (`demo_products_seeded_v1`). **Rule:** write the flag in the SAME transaction as the seeded rows.
- **Why:** flag-first without a transaction leaves a permanent "flagged but never seeded" state if the insert fails; rows-first can double-seed on concurrent startups.
- **How to apply:** any future one-time startup job should `tx.insert(appFlags).onConflictDoNothing().returning()` and bail if empty, then do its work inside the same `db.transaction`.
- Tests that hit **global** destructive endpoints (e.g. `DELETE /api/admin/products/demo`) run against the shared dev DB — snapshot the affected rows in `beforeAll` and re-insert them in `afterAll`, or every test run silently wipes seeded/dev data (and the flag prevents reseeding).

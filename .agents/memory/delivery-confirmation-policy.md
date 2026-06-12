---
name: Delivery confirmation policy (who marks an order delivered) + shift reset
description: Why orders reach "delivered" via the customer, and why close-shift is a non-destructive screen reset (NOT a cancel).
---

# Who marks an order "delivered"

The vendor dashboard phone stays at the restaurant while the courier is out, so the vendor
cannot reliably press "delivered". The customer self-confirms instead:

- **Customer self-confirm** — `POST /api/orders/:id/received {sessionId}`. An atomic
  conditional UPDATE flips to `delivered` only if the `sessionId` matches the order AND the
  order is `out_for_delivery` (delivery) or `ready` (pickup). No vendor/admin auth — ownership
  is the session that placed the order.

No SMS/WhatsApp is involved (explicit product decision).

# Shift reset ("تصفير الوردية") — NON-destructive

`POST /api/vendors/:id/orders/close-shift` (requireVendorOwner) stamps
`vendor_profiles.shift_reset_at = now()`. It does **NOT** cancel or delete any order — every
order stays in the DB permanently.

**Why:** the vendor wanted finished orders hidden from the live board to start a clean shift,
but the full sales history must survive. Cancelling leftovers (the old behavior) destroyed that
record and risked losing real orders.

**How to apply:**
- Live board = `GET /api/vendors/:id/orders` filtered to `createdAt >= shiftResetAt` (current
  shift only). This is what hides finished-shift orders.
- History = `GET /api/vendors/:id/orders?date=YYYY-MM-DD` returns ALL statuses for that **Amman
  (UTC+3)** calendar day, ignoring the shift boundary. The frontend date dropdown drives this;
  history mode is read-only (no polling, no alarm, mutation buttons hidden).
- A "did this complete?" report should still trust `delivered` as the only real completion
  signal — shift reset never changes status.

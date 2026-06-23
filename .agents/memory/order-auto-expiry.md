---
name: Order auto-expiry for unresponsive vendors
description: Policy for what happens to a pending order the vendor ignores too long
---

# Stuck-pending order policy

A server scheduler sweeps orders still `pending` (vendor hasn't accepted) older
than 20 minutes:

- **COD** (no money moved) → auto-`cancelled`.
- **Manual prepaid** (cliq/iban/ewallet, customer already transferred) → NOT
  cancelled; moved to a new holding status `awaiting_admin`, and admins are
  notified (in-panel count/badge + FCM push to admin users).

**Why:** prepaid orders must never be silently cancelled — that would strand the
customer's money. A human (admin) takes over instead. COD has no such risk.

**How to apply:**
- The sweep re-scans every minute, so it is robust to server restarts (an order
  older than the cutoff is caught on the next tick regardless of when it
  started).
- `awaiting_admin` is a real order status: it lives in the OpenAPI `OrderStatus`
  enum (run codegen after touching it), the consumer order list/detail (shows a
  reassurance banner, not the progress tracker), and the admin panel.
- Rescue transitions: `awaiting_admin → preparing` (vendor/admin finally
  accepts) and `awaiting_admin → cancelled` (admin cancels for refund) are in
  `STATUS_TRANSITIONS`.
- Admin order actions must use the contract status `preparing`, NOT the legacy
  off-contract `processing` (kept only as a display alias for old rows). The
  admin order PATCH writes status directly, so it validates against a status
  allowlist to block off-contract values.

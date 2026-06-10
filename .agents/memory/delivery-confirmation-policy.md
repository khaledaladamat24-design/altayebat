---
name: Delivery confirmation policy (who marks an order delivered)
description: Why orders reach "delivered" via the customer, and why close-shift cancels rather than delivers.
---

# Who marks an order "delivered"

The vendor dashboard phone stays at the restaurant while the courier is out, so the vendor
cannot reliably press "delivered". Two mechanisms cover it instead:

1. **Customer self-confirm** — `POST /api/orders/:id/received {sessionId}`. An atomic
   conditional UPDATE flips to `delivered` only if the `sessionId` matches the order AND the
   order is `out_for_delivery` (delivery) or `ready` (pickup). No vendor/admin auth — ownership
   is the session that placed the order.
2. **Vendor "تصفير الوردية" (close shift)** — `POST /api/vendors/:id/orders/close-shift`
   (requireVendorOwner). Bulk-sets every still-active order (pending, confirmed, preparing,
   ready, out_for_delivery) to `cancelled`.

**Why close-shift cancels (not delivers):** marking leftover orders delivered would inflate
sales totals with orders that may never have completed. Cancelling keeps them out of revenue.
**How to apply:** if you ever add a "did this complete?" report, trust `delivered` as a real
completion signal — close-shift never produces it.

No SMS/WhatsApp is involved in either path (explicit product decision).

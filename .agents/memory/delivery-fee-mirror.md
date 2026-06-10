---
name: Delivery fee must be computed identically in cart and orders
description: Cross-file invariant — the vendor-driven delivery fee logic in cart.ts and orders.ts must stay in lockstep.
---

# Delivery fee is vendor-driven and computed in two places that must agree

The delivery fee shown to the user and the fee actually charged are computed in
two independent server endpoints:

- `artifacts/api-server/src/routes/cart.ts` → `buildCart()` (drives the checkout
  summary, the wallet-balance gate, and the displayed total)
- `artifacts/api-server/src/routes/orders.ts` → `POST /orders` (the amount
  actually charged / deducted from wallet balance)

Both resolve the cart's vendor (first cart item that carries a `vendorId`,
single-vendor-cart assumption), then use that vendor's `deliveryFeeFixed` /
`freeDeliveryAbove`, falling back to the platform defaults
(`DELIVERY_FEE = 1.5`, `FREE_DELIVERY_THRESHOLD = 20`).

**Why:** when only `orders.ts` was made vendor-aware, `cart.ts` still returned
the platform-default fee, so the checkout summary and wallet-balance gating could
disagree with the amount charged (a customer could be gated/charged a different
total than displayed). Pickup waives the fee entirely (client `effectiveDeliveryFee`

- server `fulfillmentType === "pickup"` → 0).

**How to apply:** any change to the fee formula, the vendor field names, or the
platform defaults must be made in BOTH files in the same change, or the displayed
and charged totals drift apart.

Related: `POST /orders` validates the requested `fulfillmentType` against the
vendor's `pickupEnabled`/`deliveryEnabled` so a client can't force pickup to skip
the fee when the vendor has pickup disabled.

import { Router } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  productsTable,
  vendorProfilesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, or, inArray, isNull } from "drizzle-orm";
import { requireOrderVendorOwner, getActingDbUserId } from "../lib/vendor-auth";
import { normalizePhone } from "../lib/phone";
import { sendPushToUser } from "../lib/fcm";

const router = Router();

const DELIVERY_FEE = 1.5;
const FREE_DELIVERY_THRESHOLD = 20;

// Notify the vendor of a brand-new order via native push. Fire-and-forget: any
// failure is swallowed (sendPushToUser logs) so it never affects order creation.
async function notifyVendorOfOrder(
  vendorId: number,
  order: { id: number; total: number; customerName: string | null },
) {
  try {
    const [vendor] = await db
      .select({ userId: vendorProfilesTable.userId })
      .from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.id, vendorId))
      .limit(1);
    if (!vendor) return;
    const who = order.customerName ?? "زبون";
    await sendPushToUser(vendor.userId, {
      title: "طلب جديد",
      body: `طلب جديد بقيمة ${order.total.toFixed(2)} د.أ من ${who}`,
      data: { type: "new_order", orderId: String(order.id) },
    });
  } catch {
    // sendPushToUser already logs; nothing actionable here.
  }
}

async function getOrderWithItems(orderId: number) {
  const order = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!order.length) return null;

  const items = await db
    .select({ oi: orderItemsTable, p: productsTable })
    .from(orderItemsTable)
    .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, orderId));

  const o = order[0];
  return {
    id: o.id,
    sessionId: o.sessionId,
    status: o.status,
    fulfillmentType: o.fulfillmentType,
    vendorId: o.vendorId,
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.deliveryFee),
    total: Number(o.total),
    deliveryAddress: o.deliveryAddress,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    notes: o.notes,
    createdAt: o.createdAt.toISOString(),
    estimatedDelivery: o.estimatedDelivery,
    items: items.map((r) => ({
      id: r.oi.id,
      productId: r.oi.productId,
      productName: r.p?.name ?? "",
      productNameAr: r.p?.nameAr ?? "",
      productImageUrl: r.p?.imageUrl ?? null,
      quantity: r.oi.quantity,
      unitPrice: Number(r.oi.unitPrice),
      totalPrice: Number(r.oi.totalPrice),
    })),
  };
}

router.get("/orders", async (req, res) => {
  try {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) return res.json([]);

    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.sessionId, sessionId))
      .orderBy(ordersTable.createdAt);

    const full = await Promise.all(orders.map((o) => getOrderWithItems(o.id)));
    return res.json(full.filter(Boolean));
  } catch (err) {
    req.log.error({ err }, "Failed to list orders");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const {
      sessionId = "guest",
      deliveryAddress,
      customerName,
      customerPhone,
      notes,
    } = req.body;

    const cartItems = await db
      .select({ ci: cartItemsTable, p: productsTable })
      .from(cartItemsTable)
      .leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.sessionId, sessionId));

    if (!cartItems.length)
      return res.status(400).json({ error: "Cart is empty" });

    // Anti-fraud gate: every order (including COD) must come from a phone number
    // that already exists in the users table. This blocks throwaway/fake orders
    // by requiring the customer to have registered first. The check is by the
    // canonical phone form so any input variant resolves to the same account.
    const canonicalPhone = normalizePhone(customerPhone);
    if (!canonicalPhone) {
      return res.status(400).json({
        error: "رقم الهاتف غير صالح. أدخل رقم هاتف أردني صحيح.",
        code: "INVALID_PHONE",
      });
    }
    let [registeredUser]: { id: number }[] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, canonicalPhone))
      .limit(1);
    if (!registeredUser) {
      // The phone isn't registered, but if the caller is a signed-in user
      // (e.g. Google/Clerk account) with NO phone on file yet, claim the
      // entered phone permanently on their profile and let the order proceed
      // instead of bouncing them to the auth page. Users who already have a
      // (different) phone on file keep the original strict gate.
      let phoneClaimed = false;
      const actingUserId = await getActingDbUserId(req);
      if (actingUserId) {
        const [acting] = await db
          .select({ id: usersTable.id, phone: usersTable.phone })
          .from(usersTable)
          .where(eq(usersTable.id, actingUserId))
          .limit(1);
        if (acting && !acting.phone) {
          try {
            // Conditional UPDATE (phone IS NULL) keeps the claim atomic under
            // concurrent requests — only one wins; a loser falls through to 403.
            const claimed = await db
              .update(usersTable)
              .set({ phone: canonicalPhone })
              .where(
                and(eq(usersTable.id, actingUserId), isNull(usersTable.phone)),
              )
              .returning({ id: usersTable.id });
            if (claimed.length > 0) {
              phoneClaimed = true;
              // The acting user now owns this phone — link the order to them.
              registeredUser = { id: actingUserId };
              req.log.info(
                { userId: actingUserId },
                "Claimed checkout phone for signed-in user",
              );
            }
          } catch (err) {
            req.log.error({ err }, "Failed to claim checkout phone");
          }
        }
      }
      if (!phoneClaimed) {
        return res.status(403).json({
          error:
            "يجب التسجيل برقم هاتفك أولاً قبل إتمام الطلب لتجنب الطلبات الوهمية.",
          code: "PHONE_NOT_REGISTERED",
        });
      }
    }

    const subtotal = cartItems.reduce(
      (sum, r) => sum + Number(r.ci.unitPrice) * r.ci.quantity,
      0,
    );

    // Single-vendor cart assumption (per replit.md): take the vendorId from
    // the first cart item's product so vendors can list "their" orders.
    const cartVendorId =
      cartItems.find((r) => r.p?.vendorId)?.p?.vendorId ?? null;

    // Pickup orders never carry a delivery fee. Delivery orders use the vendor's
    // configured fixed fee / free-delivery threshold when available, otherwise
    // the platform defaults. The requested fulfillment is validated against the
    // vendor's capabilities server-side so a client can't force pickup (and skip
    // the delivery fee) when the vendor has pickup disabled, or vice versa.
    const requestedFulfillment =
      req.body.fulfillmentType === "pickup" ? "pickup" : "delivery";

    let perVendorFee = DELIVERY_FEE;
    let freeThreshold = FREE_DELIVERY_THRESHOLD;
    let vendorPickupEnabled = true;
    let vendorDeliveryEnabled = true;
    if (cartVendorId) {
      const [vendor] = await db
        .select()
        .from(vendorProfilesTable)
        .where(eq(vendorProfilesTable.id, cartVendorId))
        .limit(1);
      if (vendor) {
        const f = Number(vendor.deliveryFeeFixed);
        if (!isNaN(f)) perVendorFee = f;
        const t = Number(vendor.freeDeliveryAbove);
        if (!isNaN(t)) freeThreshold = t;
        vendorPickupEnabled = vendor.pickupEnabled ?? true;
        vendorDeliveryEnabled = vendor.deliveryEnabled ?? true;
      }
    }

    if (requestedFulfillment === "pickup" && !vendorPickupEnabled) {
      return res
        .status(400)
        .json({ error: "الاستلام من المتجر غير متاح لهذا البائع" });
    }
    if (requestedFulfillment === "delivery" && !vendorDeliveryEnabled) {
      return res.status(400).json({ error: "التوصيل غير متاح لهذا البائع" });
    }
    const fulfillmentType = requestedFulfillment;

    const deliveryFee =
      fulfillmentType === "pickup"
        ? 0
        : subtotal >= freeThreshold
          ? 0
          : perVendorFee;
    const total = subtotal + deliveryFee;

    const now = new Date();
    const estimated = new Date(now.getTime() + 45 * 60 * 1000);

    const paymentMethod = req.body.paymentMethod || "cod";
    const paymentScreenshotUrl = req.body.paymentScreenshotUrl || null;

    // Allowed payment methods: cash-on-delivery + three manual-transfer methods.
    const MANUAL_PAYMENT_METHODS = ["cliq", "iban", "ewallet"];
    const ALLOWED_PAYMENT_METHODS = ["cod", ...MANUAL_PAYMENT_METHODS];
    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return res
        .status(400)
        .json({ error: "طريقة دفع غير صالحة", code: "INVALID_PAYMENT_METHOD" });
    }
    const isManualPayment = MANUAL_PAYMENT_METHODS.includes(paymentMethod);
    // Manual-transfer methods must carry a payment receipt — enforce server-side
    // so a crafted request cannot skip the receipt the UI requires.
    if (isManualPayment && !paymentScreenshotUrl) {
      return res.status(400).json({
        error: "يجب إرفاق إيصال الدفع لطرق التحويل اليدوي",
        code: "RECEIPT_REQUIRED",
      });
    }

    const newOrderId = await db.transaction(async (tx) => {
      const [newOrder] = await tx
        .insert(ordersTable)
        .values({
          sessionId,
          // Link the order to the registered account (matched by canonical phone
          // in the anti-fraud gate above). Drives rating eligibility — only a
          // customer with a delivered order containing a product may rate it.
          userId: registeredUser.id,
          vendorId: cartVendorId,
          status: "pending",
          fulfillmentType,
          paymentMethod,
          // Manual transfer methods (CliQ/IBAN/e-wallet) upload a receipt and
          // wait for the vendor to confirm payment; COD is settled on delivery.
          paymentStatus: isManualPayment ? "pending" : "cod",
          paymentScreenshotUrl,
          subtotal: subtotal.toFixed(3),
          deliveryFee: deliveryFee.toFixed(3),
          total: total.toFixed(3),
          deliveryAddress,
          customerName,
          customerPhone,
          notes,
          estimatedDelivery: estimated.toISOString(),
        })
        .returning();

      await tx.insert(orderItemsTable).values(
        cartItems.map((r) => ({
          orderId: newOrder.id,
          productId: r.ci.productId,
          quantity: r.ci.quantity,
          unitPrice: r.ci.unitPrice,
          totalPrice: (Number(r.ci.unitPrice) * r.ci.quantity).toFixed(3),
        })),
      );

      await tx
        .delete(cartItemsTable)
        .where(eq(cartItemsTable.sessionId, sessionId));

      return newOrder.id;
    });

    const result = await getOrderWithItems(newOrderId);

    if (cartVendorId && result) {
      void notifyVendorOfOrder(cartVendorId, result);
    }

    return res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const result = await getOrderWithItems(id);
    if (!result) return res.status(404).json({ error: "Order not found" });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Vendors and admins use this to move an order through its lifecycle
// (pending → preparing → ready → out_for_delivery → delivered, or cancelled).
// Allowed forward transitions. The guard verifies vendor ownership; we then
// only flip the row if the current status matches an allowed predecessor —
// this is the atomic conditional update the architect asked for and prevents
// a stale "accept" from undoing a later "deliver".
// `delivered` is reachable from `out_for_delivery` (delivery orders) AND from
// `ready` (pickup orders, which skip the out-for-delivery leg entirely).
// `awaiting_admin` is a holding state for prepaid orders the vendor ignored for
// too long (see lib/order-expiry.ts). The vendor/admin can still rescue it by
// accepting (→ preparing) or the admin can cancel it for a refund.
const STATUS_TRANSITIONS: Record<string, string[]> = {
  preparing: ["pending", "awaiting_admin"],
  ready: ["preparing"],
  out_for_delivery: ["ready"],
  delivered: ["out_for_delivery", "ready"],
  cancelled: [
    "pending",
    "awaiting_admin",
    "preparing",
    "ready",
    "out_for_delivery",
  ],
};

// Customer-driven delivery confirmation. The phone with the vendor dashboard
// stays at the restaurant while the courier is out, so the customer confirms
// receipt from their own device instead. Ownership is proven by matching the
// order's sessionId (the same guest/account session that placed it). The order
// can only be confirmed once it's actually on its way (out_for_delivery) or, for
// pickup orders, ready — the atomic conditional UPDATE enforces that.
router.post("/orders/:id/received", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const sessionId = String(req.body?.sessionId ?? "");
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    const [updated] = await db
      .update(ordersTable)
      .set({ status: "delivered" })
      .where(
        and(
          eq(ordersTable.id, id),
          eq(ordersTable.sessionId, sessionId),
          or(
            eq(ordersTable.status, "out_for_delivery"),
            and(
              eq(ordersTable.status, "ready"),
              eq(ordersTable.fulfillmentType, "pickup"),
            ),
          ),
        ),
      )
      .returning();
    if (!updated) {
      // Either it's not this session's order or it's not in a confirmable state.
      return res.status(409).json({
        error: "Order cannot be confirmed as received in its current state",
      });
    }
    return res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    req.log.error({ err }, "Failed to confirm order received");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch(
  "/orders/:id/status",
  requireOrderVendorOwner("id"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const status = String(req.body?.status ?? "");
      const fromStates = STATUS_TRANSITIONS[status];
      if (!fromStates) {
        return res.status(400).json({ error: "Invalid status" });
      }
      // Two targets are fulfillment-aware so pickup and delivery flows can't
      // cross-contaminate:
      //  - `out_for_delivery` exists ONLY for delivery orders (a pickup order
      //    has no courier leg), so it's reachable from `ready` only when
      //    fulfillmentType = 'delivery'.
      //  - `delivered` is reached from `out_for_delivery` for delivery orders,
      //    or directly from `ready` for pickup orders (which skip the courier
      //    leg).
      // All other targets use the plain predecessor list.
      let predecessorCondition;
      if (status === "delivered") {
        predecessorCondition = or(
          eq(ordersTable.status, "out_for_delivery"),
          and(
            eq(ordersTable.status, "ready"),
            eq(ordersTable.fulfillmentType, "pickup"),
          ),
        );
      } else if (status === "out_for_delivery") {
        predecessorCondition = and(
          inArray(ordersTable.status, fromStates),
          eq(ordersTable.fulfillmentType, "delivery"),
        );
      } else {
        predecessorCondition = inArray(ordersTable.status, fromStates);
      }
      const [updated] = await db
        .update(ordersTable)
        .set({ status })
        .where(and(eq(ordersTable.id, id), predecessorCondition))
        .returning();
      if (!updated) {
        // Either the order disappeared or it's in a state we won't transition from.
        return res.status(409).json({
          error: "Order is not in a state that allows this transition",
        });
      }
      return res.json({ id: updated.id, status: updated.status });
    } catch (err) {
      req.log.error({ err }, "Failed to update order status");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;

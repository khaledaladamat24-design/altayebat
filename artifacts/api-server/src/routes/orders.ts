import { Router } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  productsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireOrderVendorOwner, getDbUserIdFromClerk } from "../lib/vendor-auth";
import { payOrderFromWallet } from "../lib/wallet-pay";

const router = Router();

const DELIVERY_FEE = 1.5;
const FREE_DELIVERY_THRESHOLD = 20;

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

    const subtotal = cartItems.reduce(
      (sum, r) => sum + Number(r.ci.unitPrice) * r.ci.quantity,
      0,
    );
    const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const total = subtotal + deliveryFee;

    const now = new Date();
    const estimated = new Date(now.getTime() + 45 * 60 * 1000);

    const paymentMethod = req.body.paymentMethod || "cod";
    const paymentScreenshotUrl = req.body.paymentScreenshotUrl || null;

    // Single-vendor cart assumption (per replit.md): take the vendorId from
    // the first cart item's product so vendors can list "their" orders.
    const cartVendorId =
      cartItems.find((r) => r.p?.vendorId)?.p?.vendorId ?? null;

    // For wallet-balance orders we must charge the wallet in the SAME server
    // transaction that creates the order, so a dropped client connection can
    // never leave an order placed-but-uncharged. Resolve the paying user from
    // the signed-in Clerk session (never trust a client-supplied id).
    let balanceUserId: number | null = null;
    if (paymentMethod === "balance") {
      balanceUserId = await getDbUserIdFromClerk(req);
      if (!balanceUserId) {
        return res
          .status(401)
          .json({ error: "سجّل دخولك لاستخدام رصيد المحفظة" });
      }
    }

    let newOrderId: number;
    try {
      newOrderId = await db.transaction(async (tx) => {
        const [newOrder] = await tx
          .insert(ordersTable)
          .values({
            sessionId,
            vendorId: cartVendorId,
            status: "pending",
            paymentMethod,
            paymentStatus:
              paymentMethod === "balance"
                ? "paid"
                : paymentScreenshotUrl
                  ? "pending"
                  : "cod",
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

        // Charge the wallet atomically. Insufficient balance aborts the whole
        // transaction (the order row is rolled back) so we never create an
        // order that wasn't paid for.
        if (paymentMethod === "balance" && balanceUserId) {
          const pay = await payOrderFromWallet(tx, {
            userId: balanceUserId,
            amount: total,
            orderId: newOrder.id,
            description: `دفع طلب #${newOrder.id}`,
          });
          if (!pay.ok) {
            throw new Error("INSUFFICIENT_BALANCE");
          }
        }

        await tx
          .delete(cartItemsTable)
          .where(eq(cartItemsTable.sessionId, sessionId));

        return newOrder.id;
      });
    } catch (txErr) {
      if ((txErr as Error).message === "INSUFFICIENT_BALANCE") {
        return res.status(400).json({ error: "الرصيد غير كافٍ" });
      }
      throw txErr;
    }

    const result = await getOrderWithItems(newOrderId);
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
const STATUS_TRANSITIONS: Record<string, string[]> = {
  preparing: ["pending"],
  ready: ["preparing"],
  out_for_delivery: ["ready"],
  delivered: ["out_for_delivery"],
  cancelled: ["pending", "preparing"],
};

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
      const [updated] = await db
        .update(ordersTable)
        .set({ status })
        .where(
          and(eq(ordersTable.id, id), inArray(ordersTable.status, fromStates)),
        )
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

import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, cartItemsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const DELIVERY_FEE = 1.5;
const FREE_DELIVERY_THRESHOLD = 20;

async function getOrderWithItems(orderId: number) {
  const order = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
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
    res.json(full.filter(Boolean));
  } catch (err) {
    req.log.error({ err }, "Failed to list orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const { sessionId = "guest", deliveryAddress, customerName, customerPhone, notes } = req.body;

    const cartItems = await db
      .select({ ci: cartItemsTable, p: productsTable })
      .from(cartItemsTable)
      .leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.sessionId, sessionId));

    if (!cartItems.length) return res.status(400).json({ error: "Cart is empty" });

    const subtotal = cartItems.reduce((sum, r) => sum + Number(r.ci.unitPrice) * r.ci.quantity, 0);
    const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const total = subtotal + deliveryFee;

    const now = new Date();
    const estimated = new Date(now.getTime() + 45 * 60 * 1000);

    const [newOrder] = await db
      .insert(ordersTable)
      .values({
        sessionId,
        status: "pending",
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

    await db.insert(orderItemsTable).values(
      cartItems.map((r) => ({
        orderId: newOrder.id,
        productId: r.ci.productId,
        quantity: r.ci.quantity,
        unitPrice: r.ci.unitPrice,
        totalPrice: (Number(r.ci.unitPrice) * r.ci.quantity).toFixed(3),
      }))
    );

    await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));

    const result = await getOrderWithItems(newOrder.id);
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const result = await getOrderWithItems(id);
    if (!result) return res.status(404).json({ error: "Order not found" });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

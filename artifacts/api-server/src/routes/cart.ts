import { Router } from "express";
import { db } from "@workspace/db";
import { cartItemsTable, productsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const DELIVERY_FEE = 1.5;
const FREE_DELIVERY_THRESHOLD = 20;

async function buildCart(sessionId: string) {
  const items = await db
    .select({ ci: cartItemsTable, p: productsTable })
    .from(cartItemsTable)
    .leftJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.sessionId, sessionId));

  const cartItems = items.map((r) => ({
    id: r.ci.id,
    productId: r.ci.productId,
    productName: r.p?.name ?? "",
    productNameAr: r.p?.nameAr ?? "",
    productImageUrl: r.p?.imageUrl ?? null,
    quantity: r.ci.quantity,
    unitPrice: Number(r.ci.unitPrice),
    totalPrice: Number(r.ci.unitPrice) * r.ci.quantity,
  }));

  const subtotal = cartItems.reduce((sum, i) => sum + i.totalPrice, 0);
  const deliveryFee = subtotal > 0 && subtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_FEE : subtotal === 0 ? 0 : 0;
  const total = subtotal + deliveryFee;

  return {
    sessionId,
    items: cartItems,
    subtotal: Math.round(subtotal * 1000) / 1000,
    deliveryFee: Math.round(deliveryFee * 1000) / 1000,
    total: Math.round(total * 1000) / 1000,
    itemCount: cartItems.reduce((sum, i) => sum + i.quantity, 0),
  };
}

router.get("/cart", async (req, res) => {
  try {
    const sessionId = (req.query.sessionId as string) || "guest";
    res.json(await buildCart(sessionId));
  } catch (err) {
    req.log.error({ err }, "Failed to get cart");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cart", async (req, res) => {
  try {
    const { sessionId = "guest", productId, quantity } = req.body;

    const product = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product.length) return res.status(404).json({ error: "Product not found" });

    const existing = await db
      .select()
      .from(cartItemsTable)
      .where(and(eq(cartItemsTable.sessionId, sessionId), eq(cartItemsTable.productId, productId)))
      .limit(1);

    if (existing.length) {
      await db
        .update(cartItemsTable)
        .set({ quantity: existing[0].quantity + quantity, updatedAt: new Date() })
        .where(eq(cartItemsTable.id, existing[0].id));
    } else {
      await db.insert(cartItemsTable).values({
        sessionId,
        productId,
        quantity,
        unitPrice: product[0].price,
      });
    }

    res.json(await buildCart(sessionId));
  } catch (err) {
    req.log.error({ err }, "Failed to add to cart");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/cart/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { quantity } = req.body;

    const item = await db.select().from(cartItemsTable).where(eq(cartItemsTable.id, itemId)).limit(1);
    if (!item.length) return res.status(404).json({ error: "Cart item not found" });

    if (quantity <= 0) {
      await db.delete(cartItemsTable).where(eq(cartItemsTable.id, itemId));
    } else {
      await db.update(cartItemsTable).set({ quantity, updatedAt: new Date() }).where(eq(cartItemsTable.id, itemId));
    }

    res.json(await buildCart(item[0].sessionId));
  } catch (err) {
    req.log.error({ err }, "Failed to update cart item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/cart/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const item = await db.select().from(cartItemsTable).where(eq(cartItemsTable.id, itemId)).limit(1);
    if (!item.length) return res.status(404).json({ error: "Cart item not found" });

    await db.delete(cartItemsTable).where(eq(cartItemsTable.id, itemId));
    res.json(await buildCart(item[0].sessionId));
  } catch (err) {
    req.log.error({ err }, "Failed to remove cart item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/cart", async (req, res) => {
  try {
    const sessionId = (req.query.sessionId as string) || "guest";
    await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));
    res.json(await buildCart(sessionId));
  } catch (err) {
    req.log.error({ err }, "Failed to clear cart");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

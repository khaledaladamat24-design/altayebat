import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, ordersTable, orderItemsTable, usersTable, vendorProfilesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const SUPER_ADMIN_EMAIL = "khaledaladamat24@gmail.com";

function isAdmin(req: Parameters<Parameters<typeof router.use>[0]>[0]): boolean {
  const adminEmail = req.headers["x-admin-email"] as string | undefined;
  const adminKey = req.headers["x-admin-key"] as string | undefined;
  return adminKey === "tayebat2024" || adminEmail === SUPER_ADMIN_EMAIL;
}

router.post("/admin/products", async (req, res) => {
  try {
    const {
      nameAr, name, descriptionAr, description,
      price, originalPrice, categoryId,
      imageUrl, isKeto, isOrganic, isFeatured, isBestseller,
      weightOrVolume, inStock,
    } = req.body;

    if (!nameAr || !name || !price || !categoryId) {
      return res.status(400).json({ error: "الاسم والسعر والقسم مطلوبة" });
    }

    const [product] = await db.insert(productsTable).values({
      nameAr, name,
      descriptionAr: descriptionAr || null,
      description: description || null,
      price: String(price),
      originalPrice: originalPrice ? String(originalPrice) : null,
      categoryId: Number(categoryId),
      imageUrl: imageUrl || null,
      isKeto: Boolean(isKeto),
      isOrganic: Boolean(isOrganic),
      isFeatured: Boolean(isFeatured),
      isBestseller: Boolean(isBestseller),
      weightOrVolume: weightOrVolume || null,
      inStock: inStock !== false,
    }).returning();

    res.status(201).json({ ...product, price: Number(product.price) });
  } catch (err) {
    req.log.error({ err }, "Failed to create product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const { nameAr, name, price, originalPrice, categoryId, imageUrl,
      isKeto, isOrganic, isFeatured, isBestseller, weightOrVolume,
      inStock, descriptionAr, description } = req.body;

    const [updated] = await db.update(productsTable).set({
      ...(nameAr && { nameAr }),
      ...(name && { name }),
      ...(descriptionAr !== undefined && { descriptionAr }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { price: String(price) }),
      ...(originalPrice !== undefined && { originalPrice: originalPrice ? String(originalPrice) : null }),
      ...(categoryId !== undefined && { categoryId: Number(categoryId) }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(isKeto !== undefined && { isKeto: Boolean(isKeto) }),
      ...(isOrganic !== undefined && { isOrganic: Boolean(isOrganic) }),
      ...(isFeatured !== undefined && { isFeatured: Boolean(isFeatured) }),
      ...(isBestseller !== undefined && { isBestseller: Boolean(isBestseller) }),
      ...(weightOrVolume !== undefined && { weightOrVolume }),
      ...(inStock !== undefined && { inStock: Boolean(inStock) }),
    }).where(eq(productsTable.id, id)).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, price: Number(updated.price) });
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(productsTable).where(eq(productsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/orders", async (req, res) => {
  try {
    const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
    res.json(orders);
  } catch (err) {
    req.log.error({ err }, "Failed to list orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { status, paymentStatus } = req.body;
    const [updated] = await db.update(ordersTable).set({
      ...(status && { status }),
      ...(paymentStatus && { paymentStatus }),
    }).where(eq(ordersTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, id));
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/users", async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
    res.json(users.map(u => ({
      ...u,
      isAdmin: u.email === SUPER_ADMIN_EMAIL || u.role === "admin",
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/vendors", async (req, res) => {
  try {
    const vendors = await db.select().from(vendorProfilesTable).orderBy(desc(vendorProfilesTable.createdAt));
    res.json(vendors);
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/vendors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    const [updated] = await db.update(vendorProfilesTable)
      .set({ status }).where(eq(vendorProfilesTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update vendor");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/vendors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(vendorProfilesTable).where(eq(vendorProfilesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete vendor");
    res.status(500).json({ error: "Internal server error" });
  }
});

export { isAdmin };
export default router;

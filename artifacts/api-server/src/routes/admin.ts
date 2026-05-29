import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { productsTable, ordersTable, orderItemsTable, usersTable, vendorProfilesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { checkSaleIntegrity } from "../lib/sale-integrity";

const router = Router();

const SUPER_ADMIN_EMAIL = "khaledaladamat24@gmail.com";
const FALLBACK_ADMIN_PASSWORD = "tayebat2024";

function getAdminPassword(): string {
  const env = process.env.ADMIN_PASSWORD;
  if (env && env.length > 0) return env;
  // eslint-disable-next-line no-console
  console.warn(
    "[admin] ⚠️  ADMIN_PASSWORD env secret is not set — falling back to the legacy default. " +
    "Set ADMIN_PASSWORD as a Replit Secret to secure the admin panel."
  );
  return FALLBACK_ADMIN_PASSWORD;
}

function isAdmin(req: Request): boolean {
  const adminEmail = req.headers["x-admin-email"] as string | undefined;
  const adminKey = req.headers["x-admin-key"] as string | undefined;
  return adminKey === getAdminPassword() || adminEmail === SUPER_ADMIN_EMAIL;
}

router.post("/admin/products", async (req, res) => {
  try {
    const {
      nameAr, name, descriptionAr, description,
      price, originalPrice, categoryId,
      imageUrl, isKeto, isOrganic, isFeatured, isBestseller, isOnSale,
      weightOrVolume, inStock,
      calories, protein, carbs, fats, vendorId, foodType, subcategory,
    } = req.body;

    if (!nameAr || !name || !price || !categoryId) {
      return res.status(400).json({ error: "الاسم والسعر والقسم مطلوبة" });
    }

    const saleCheck = checkSaleIntegrity({ isOnSale, price, originalPrice });
    if (!saleCheck.ok) {
      return res.status(400).json({ error: saleCheck.error });
    }

    const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : v);

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
      isOnSale: Boolean(isOnSale),
      weightOrVolume: weightOrVolume || null,
      inStock: inStock !== false,
      calories: num(calories) !== null ? Number(calories) : null,
      protein: num(protein) !== null ? String(protein) : null,
      carbs: num(carbs) !== null ? String(carbs) : null,
      fats: num(fats) !== null ? String(fats) : null,
      vendorId: vendorId ? Number(vendorId) : null,
      foodType: foodType === "regular" ? "regular" : "healthy",
      subcategory: subcategory ? String(subcategory) : null,
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
      isKeto, isOrganic, isFeatured, isBestseller, isOnSale, weightOrVolume,
      inStock, descriptionAr, description,
      calories, protein, carbs, fats, foodType, subcategory } = req.body;

    if (isOnSale !== undefined || originalPrice !== undefined || price !== undefined) {
      const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      const effOnSale = isOnSale !== undefined ? Boolean(isOnSale) : existing.isOnSale;
      const effPrice = price !== undefined ? price : existing.price;
      const effOrigRaw = originalPrice !== undefined ? originalPrice : existing.originalPrice;
      const saleCheck = checkSaleIntegrity({ isOnSale: effOnSale, price: effPrice, originalPrice: effOrigRaw });
      if (!saleCheck.ok) {
        return res.status(400).json({ error: saleCheck.error });
      }
    }

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
      ...(isOnSale !== undefined && { isOnSale: Boolean(isOnSale) }),
      ...(weightOrVolume !== undefined && { weightOrVolume }),
      ...(inStock !== undefined && { inStock: Boolean(inStock) }),
      ...(calories !== undefined && { calories: calories === "" || calories === null ? null : Number(calories) }),
      ...(protein !== undefined && { protein: protein === "" || protein === null ? null : String(protein) }),
      ...(carbs !== undefined && { carbs: carbs === "" || carbs === null ? null : String(carbs) }),
      ...(fats !== undefined && { fats: fats === "" || fats === null ? null : String(fats) }),
      ...(foodType !== undefined && { foodType: foodType === "regular" ? "regular" : "healthy" }),
      ...(subcategory !== undefined && { subcategory: subcategory ? String(subcategory) : null }),
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

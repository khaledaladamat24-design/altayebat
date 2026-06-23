import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable,
  ordersTable,
  orderItemsTable,
  usersTable,
  vendorProfilesTable,
  categoriesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { checkSaleIntegrity } from "../lib/sale-integrity";
import { SUPER_ADMIN_EMAIL } from "../lib/admin-auth";
import { requireAdmin } from "../lib/vendor-auth";

const router = Router();

const FOOD_TYPES = ["healthy", "regular", "grocery"] as const;
type FoodType = (typeof FOOD_TYPES)[number];
const normalizeFoodType = (v: unknown): FoodType =>
  FOOD_TYPES.includes(v as FoodType) ? (v as FoodType) : "healthy";

router.use("/admin", requireAdmin);

router.post("/admin/products", async (req, res) => {
  try {
    const {
      nameAr,
      name,
      descriptionAr,
      description,
      price,
      originalPrice,
      categoryId,
      imageUrl,
      isKeto,
      isOrganic,
      isFeatured,
      isBestseller,
      isOnSale,
      weightOrVolume,
      inStock,
      calories,
      protein,
      carbs,
      fats,
      vendorId,
      foodType,
      subcategory,
    } = req.body;

    if (!nameAr || !price || !categoryId) {
      return res.status(400).json({ error: "الاسم والسعر والقسم مطلوبة" });
    }

    const saleCheck = checkSaleIntegrity({ isOnSale, price, originalPrice });
    if (!saleCheck.ok) {
      return res.status(400).json({ error: saleCheck.error });
    }

    const num = (v: unknown) =>
      v === undefined || v === null || v === "" ? null : v;

    // English name is optional — the column is NOT NULL, so fall back to the
    // Arabic name when the caller leaves it blank.
    const englishName =
      typeof name === "string" && name.trim() ? name.trim() : nameAr;

    const [product] = await db
      .insert(productsTable)
      .values({
        nameAr,
        name: englishName,
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
        foodType: normalizeFoodType(foodType),
        subcategory: subcategory ? String(subcategory) : null,
      })
      .returning();

    return res.status(201).json({ ...product, price: Number(product.price) });
  } catch (err) {
    req.log.error({ err }, "Failed to create product");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const {
      nameAr,
      name,
      price,
      originalPrice,
      categoryId,
      imageUrl,
      isKeto,
      isOrganic,
      isFeatured,
      isBestseller,
      isOnSale,
      weightOrVolume,
      inStock,
      descriptionAr,
      description,
      calories,
      protein,
      carbs,
      fats,
      foodType,
      subcategory,
    } = req.body;

    if (
      isOnSale !== undefined ||
      originalPrice !== undefined ||
      price !== undefined
    ) {
      const [existing] = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      const effOnSale =
        isOnSale !== undefined ? Boolean(isOnSale) : existing.isOnSale;
      const effPrice = price !== undefined ? price : existing.price;
      const effOrigRaw =
        originalPrice !== undefined ? originalPrice : existing.originalPrice;
      const saleCheck = checkSaleIntegrity({
        isOnSale: effOnSale,
        price: effPrice,
        originalPrice: effOrigRaw,
      });
      if (!saleCheck.ok) {
        return res.status(400).json({ error: saleCheck.error });
      }
    }

    const [updated] = await db
      .update(productsTable)
      .set({
        ...(nameAr && { nameAr }),
        ...(name && { name }),
        ...(descriptionAr !== undefined && { descriptionAr }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: String(price) }),
        ...(originalPrice !== undefined && {
          originalPrice: originalPrice ? String(originalPrice) : null,
        }),
        ...(categoryId !== undefined && { categoryId: Number(categoryId) }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isKeto !== undefined && { isKeto: Boolean(isKeto) }),
        ...(isOrganic !== undefined && { isOrganic: Boolean(isOrganic) }),
        ...(isFeatured !== undefined && { isFeatured: Boolean(isFeatured) }),
        ...(isBestseller !== undefined && {
          isBestseller: Boolean(isBestseller),
        }),
        ...(isOnSale !== undefined && { isOnSale: Boolean(isOnSale) }),
        ...(weightOrVolume !== undefined && { weightOrVolume }),
        ...(inStock !== undefined && { inStock: Boolean(inStock) }),
        ...(calories !== undefined && {
          calories:
            calories === "" || calories === null ? null : Number(calories),
        }),
        ...(protein !== undefined && {
          protein: protein === "" || protein === null ? null : String(protein),
        }),
        ...(carbs !== undefined && {
          carbs: carbs === "" || carbs === null ? null : String(carbs),
        }),
        ...(fats !== undefined && {
          fats: fats === "" || fats === null ? null : String(fats),
        }),
        ...(foodType !== undefined && {
          foodType: normalizeFoodType(foodType),
        }),
        ...(subcategory !== undefined && {
          subcategory: subcategory ? String(subcategory) : null,
        }),
      })
      .where(eq(productsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json({ ...updated, price: Number(updated.price) });
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(productsTable).where(eq(productsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/orders", async (req, res) => {
  try {
    // Left-join the vendor profile so each order card in the super-admin panel
    // can show which restaurant it belongs to (and be filtered per-vendor).
    const rows = await db
      .select({
        order: ordersTable,
        vendorName: vendorProfilesTable.storeName,
        vendorNameAr: vendorProfilesTable.storeNameAr,
      })
      .from(ordersTable)
      .leftJoin(
        vendorProfilesTable,
        eq(ordersTable.vendorId, vendorProfilesTable.id),
      )
      .orderBy(desc(ordersTable.createdAt));
    res.json(
      rows.map((r) => ({
        ...r.order,
        vendorName: r.vendorName ?? null,
        vendorNameAr: r.vendorNameAr ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin order edits write the status directly (bypassing the vendor transition
// guard), so validate against the known statuses here to keep orders from
// landing in an off-contract state the customer/vendor UIs can't render.
const ADMIN_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "awaiting_admin",
  "delivered",
  "cancelled",
]);

router.patch("/admin/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { status, paymentStatus } = req.body;
    if (status !== undefined && !ADMIN_ORDER_STATUSES.has(String(status))) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const [updated] = await db
      .update(ordersTable)
      .set({
        ...(status && { status }),
        ...(paymentStatus && { paymentStatus }),
      })
      .where(eq(ordersTable.id, id))
      .returning();
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update order");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/orders/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, id));
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete order");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/users", async (req, res) => {
  try {
    const users = await db
      .select()
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt));
    // Never return the trusted identity headers (clerkId / firebaseUid) or the
    // password hash to the client — even an admin client doesn't need them, and
    // they are impersonation credentials if they ever leak.
    res.json(
      users.map(({ passwordHash, clerkId, firebaseUid, ...u }) => {
        void passwordHash;
        void clerkId;
        void firebaseUid;
        return {
          ...u,
          isAdmin: u.email === SUPER_ADMIN_EMAIL || u.role === "admin",
        };
      }),
    );
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
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/vendors", async (req, res) => {
  try {
    const vendors = await db
      .select()
      .from(vendorProfilesTable)
      .orderBy(desc(vendorProfilesTable.createdAt));
    res.json(vendors);
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin product management dashboard: returns EVERY product (including those
// from suspended/offline vendors, which the public /products endpoint hides) so
// the super-admin can manage and group them by vendor.
router.get("/admin/products", async (req, res) => {
  try {
    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id),
      )
      .leftJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .orderBy(desc(productsTable.id));
    res.json(
      rows.map((r) => ({
        id: r.p.id,
        name: r.p.name,
        nameAr: r.p.nameAr,
        description: r.p.description ?? null,
        descriptionAr: r.p.descriptionAr ?? null,
        price: Number(r.p.price),
        originalPrice: r.p.originalPrice ? Number(r.p.originalPrice) : null,
        imageUrl: r.p.imageUrl ?? null,
        categoryId: r.p.categoryId,
        categoryName: r.c?.name ?? null,
        categoryNameAr: r.c?.nameAr ?? null,
        inStock: r.p.inStock,
        isFeatured: r.p.isFeatured,
        isBestseller: r.p.isBestseller,
        isKeto: r.p.isKeto,
        isOrganic: r.p.isOrganic,
        isOnSale: r.p.isOnSale,
        weightOrVolume: r.p.weightOrVolume ?? null,
        calories: r.p.calories ?? null,
        protein: r.p.protein ? Number(r.p.protein) : null,
        carbs: r.p.carbs ? Number(r.p.carbs) : null,
        fats: r.p.fats ? Number(r.p.fats) : null,
        foodType: r.p.foodType,
        vendorId: r.p.vendorId ?? null,
        vendorName: r.v?.storeName ?? null,
        vendorNameAr: r.v?.storeNameAr ?? null,
        vendorStatus: r.v?.status ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list admin products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/vendors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    const [updated] = await db
      .update(vendorProfilesTable)
      .set({ status })
      .where(eq(vendorProfilesTable.id, id))
      .returning();
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
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete vendor");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, categoriesTable, vendorProfilesTable } from "@workspace/db";
import { eq, and, or, ilike, isNull, sql } from "drizzle-orm";

// Products without a vendor (admin-uploaded) stay visible. Products linked to
// a vendor only appear when that vendor is marked online — this lets vendors
// pause incoming orders by flipping their "Online" switch off.
const vendorOnlineCondition = or(
  isNull(productsTable.vendorId),
  eq(vendorProfilesTable.isOnline, true),
);

const router = Router();

type VendorLite = Pick<typeof vendorProfilesTable.$inferSelect, "id" | "storeName" | "storeNameAr"> | null;

function buildProductRow(p: typeof productsTable.$inferSelect, c: typeof categoriesTable.$inferSelect | null, v: VendorLite = null) {
  return {
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    description: p.description ?? null,
    descriptionAr: p.descriptionAr ?? null,
    price: Number(p.price),
    originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
    imageUrl: p.imageUrl ?? null,
    categoryId: p.categoryId,
    categoryName: c?.name ?? null,
    categoryNameAr: c?.nameAr ?? null,
    inStock: p.inStock,
    isFeatured: p.isFeatured,
    isBestseller: p.isBestseller,
    isKeto: p.isKeto,
    isOrganic: p.isOrganic,
    weightOrVolume: p.weightOrVolume ?? null,
    rating: p.rating ? Number(p.rating) : null,
    reviewCount: p.reviewCount,
    calories: p.calories ?? null,
    protein: p.protein ? Number(p.protein) : null,
    carbs: p.carbs ? Number(p.carbs) : null,
    fats: p.fats ? Number(p.fats) : null,
    vendorId: p.vendorId ?? null,
    vendorName: v?.storeName ?? null,
    vendorNameAr: v?.storeNameAr ?? null,
    foodType: p.foodType,
    isOnSale: p.isOnSale,
    subcategory: p.subcategory ?? null,
  };
}

function foodTypeCondition(raw: unknown) {
  if (raw === "healthy" || raw === "regular") {
    return eq(productsTable.foodType, raw);
  }
  return undefined;
}

router.get("/products/featured", async (req, res) => {
  try {
    const ft = foodTypeCondition(req.query.foodType);
    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(vendorProfilesTable, eq(productsTable.vendorId, vendorProfilesTable.id))
      .where(and(eq(productsTable.isFeatured, true), vendorOnlineCondition, ft));
    res.json(rows.map((r) => buildProductRow(r.p, r.c, r.v)));
  } catch (err) {
    req.log.error({ err }, "Failed to list featured products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products/bestsellers", async (req, res) => {
  try {
    const ft = foodTypeCondition(req.query.foodType);
    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(vendorProfilesTable, eq(productsTable.vendorId, vendorProfilesTable.id))
      .where(and(eq(productsTable.isBestseller, true), vendorOnlineCondition, ft));
    res.json(rows.map((r) => buildProductRow(r.p, r.c, r.v)));
  } catch (err) {
    req.log.error({ err }, "Failed to list bestsellers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products", async (req, res) => {
  try {
    const { categoryId, search, featured, foodType, onSale, subcategory } = req.query;
    const conditions = [];

    if (categoryId) {
      const catId = parseInt(categoryId as string);
      if (!isNaN(catId)) conditions.push(eq(productsTable.categoryId, catId));
    }
    if (featured === "true") conditions.push(eq(productsTable.isFeatured, true));
    if (onSale === "true") conditions.push(eq(productsTable.isOnSale, true));
    if (typeof subcategory === "string" && subcategory.length > 0) {
      conditions.push(eq(productsTable.subcategory, subcategory));
    }
    const ft = foodTypeCondition(foodType);
    if (ft) conditions.push(ft);
    if (vendorOnlineCondition) conditions.push(vendorOnlineCondition);
    // Search across product name AND vendor store name so a user can find
    // "خبز كيتو" (product) or "أم علي" (restaurant) with the same input.
    if (search) {
      const q = `%${search}%`;
      const matchers = [
        ilike(productsTable.nameAr, q),
        ilike(productsTable.name, q),
        ilike(vendorProfilesTable.storeNameAr, q),
        ilike(vendorProfilesTable.storeName, q),
      ];
      const orExpr = or(...matchers);
      if (orExpr) conditions.push(orExpr);
    }

    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(vendorProfilesTable, eq(productsTable.vendorId, vendorProfilesTable.id))
      .where(conditions.length ? and(...conditions) : undefined);

    res.json(rows.map((r) => buildProductRow(r.p, r.c, r.v)));
  } catch (err) {
    req.log.error({ err }, "Failed to list products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(vendorProfilesTable, eq(productsTable.vendorId, vendorProfilesTable.id))
      .where(eq(productsTable.id, id));

    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(buildProductRow(rows[0].p, rows[0].c, rows[0].v));
  } catch (err) {
    req.log.error({ err }, "Failed to get product");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

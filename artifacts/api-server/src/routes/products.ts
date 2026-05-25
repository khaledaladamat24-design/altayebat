import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";

const router = Router();

function buildProductRow(p: typeof productsTable.$inferSelect, c: typeof categoriesTable.$inferSelect | null) {
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
  };
}

router.get("/products/featured", async (req, res) => {
  try {
    const rows = await db
      .select({ p: productsTable, c: categoriesTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.isFeatured, true));
    res.json(rows.map((r) => buildProductRow(r.p, r.c)));
  } catch (err) {
    req.log.error({ err }, "Failed to list featured products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products/bestsellers", async (req, res) => {
  try {
    const rows = await db
      .select({ p: productsTable, c: categoriesTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.isBestseller, true));
    res.json(rows.map((r) => buildProductRow(r.p, r.c)));
  } catch (err) {
    req.log.error({ err }, "Failed to list bestsellers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products", async (req, res) => {
  try {
    const { categoryId, search, featured } = req.query;
    const conditions = [];

    if (categoryId) {
      const catId = parseInt(categoryId as string);
      if (!isNaN(catId)) conditions.push(eq(productsTable.categoryId, catId));
    }
    if (featured === "true") conditions.push(eq(productsTable.isFeatured, true));
    if (search) conditions.push(ilike(productsTable.nameAr, `%${search}%`));

    const rows = await db
      .select({ p: productsTable, c: categoriesTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(conditions.length ? and(...conditions) : undefined);

    res.json(rows.map((r) => buildProductRow(r.p, r.c)));
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
      .select({ p: productsTable, c: categoriesTable })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(productsTable.id, id));

    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(buildProductRow(rows[0].p, rows[0].c));
  } catch (err) {
    req.log.error({ err }, "Failed to get product");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

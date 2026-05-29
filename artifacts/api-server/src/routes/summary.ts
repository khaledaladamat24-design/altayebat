import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

router.get("/summary", async (req, res) => {
  try {
    const [totals] = await db
      .select({
        totalProducts: sql<number>`COUNT(*)`.mapWith(Number),
        featuredCount:
          sql<number>`SUM(CASE WHEN is_featured THEN 1 ELSE 0 END)`.mapWith(
            Number,
          ),
        bestsellersCount:
          sql<number>`SUM(CASE WHEN is_bestseller THEN 1 ELSE 0 END)`.mapWith(
            Number,
          ),
        ketoCount:
          sql<number>`SUM(CASE WHEN is_keto THEN 1 ELSE 0 END)`.mapWith(Number),
      })
      .from(productsTable);

    const [catTotal] = await db
      .select({ totalCategories: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(categoriesTable);

    const categoryCounts = await db
      .select({
        categoryId: categoriesTable.id,
        categoryName: categoriesTable.name,
        categoryNameAr: categoriesTable.nameAr,
        count: sql<number>`COUNT(products.id)`.mapWith(Number),
      })
      .from(categoriesTable)
      .leftJoin(productsTable, eq(productsTable.categoryId, categoriesTable.id))
      .groupBy(
        categoriesTable.id,
        categoriesTable.name,
        categoriesTable.nameAr,
      );

    res.json({
      totalProducts: totals.totalProducts,
      totalCategories: catTotal.totalCategories,
      featuredCount: totals.featuredCount,
      bestsellersCount: totals.bestsellersCount,
      ketoCount: totals.ketoCount,
      categoryCounts,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get store summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

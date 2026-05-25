import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

router.get("/categories", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        nameAr: categoriesTable.nameAr,
        slug: categoriesTable.slug,
        icon: categoriesTable.icon,
        imageUrl: categoriesTable.imageUrl,
        sortOrder: categoriesTable.sortOrder,
        productCount: sql<number>`(SELECT COUNT(*) FROM products WHERE products.category_id = ${categoriesTable.id})`.mapWith(Number),
      })
      .from(categoriesTable)
      .orderBy(categoriesTable.sortOrder);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/categories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const rows = await db
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        nameAr: categoriesTable.nameAr,
        slug: categoriesTable.slug,
        icon: categoriesTable.icon,
        imageUrl: categoriesTable.imageUrl,
        sortOrder: categoriesTable.sortOrder,
        productCount: sql<number>`(SELECT COUNT(*) FROM products WHERE products.category_id = ${categoriesTable.id})`.mapWith(Number),
      })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id));

    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get category");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
      nameAr,
      name,
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

export default router;

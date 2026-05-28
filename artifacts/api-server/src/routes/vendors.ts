import { Router } from "express";
import { db } from "@workspace/db";
import { vendorProfilesTable, productsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/vendors/by-user/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });
    const [vendor] = await db.select().from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.userId, userId)).limit(1);
    if (!vendor) return res.status(404).json({ error: "No vendor profile" });
    res.json(vendor);
  } catch (err) {
    req.log.error({ err }, "Failed to get vendor by user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vendors/:id/products", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const rows = await db.select().from(productsTable)
      .where(eq(productsTable.vendorId, id))
      .orderBy(desc(productsTable.createdAt));
    res.json(rows.map(p => ({
      ...p,
      price: Number(p.price),
      originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
      protein: p.protein ? Number(p.protein) : null,
      carbs: p.carbs ? Number(p.carbs) : null,
      fats: p.fats ? Number(p.fats) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list vendor products");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Vendor approval is auto-granted on signup, so product CRUD only needs to
// verify the vendor exists (not that admin manually approved it).
async function ensureVendorExists(vendorId: number) {
  const [v] = await db.select().from(vendorProfilesTable)
    .where(eq(vendorProfilesTable.id, vendorId)).limit(1);
  return v || null;
}

router.post("/vendors/:id/products", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    const vendor = await ensureVendorExists(vendorId);
    if (!vendor) return res.status(404).json({ error: "المتجر غير موجود" });
    const { nameAr, name, descriptionAr, description, price, originalPrice,
      categoryId, imageUrl, isKeto, isOrganic, weightOrVolume, inStock,
      calories, protein, carbs, fats } = req.body;
    if (!nameAr || !name || !price || !categoryId) {
      return res.status(400).json({ error: "الاسم والسعر والقسم مطلوبة" });
    }
    const [product] = await db.insert(productsTable).values({
      vendorId, nameAr, name,
      descriptionAr: descriptionAr || null, description: description || null,
      price: String(price),
      originalPrice: originalPrice ? String(originalPrice) : null,
      categoryId: Number(categoryId),
      imageUrl: imageUrl || null,
      isKeto: Boolean(isKeto), isOrganic: Boolean(isOrganic),
      isFeatured: false, isBestseller: false,
      weightOrVolume: weightOrVolume || null,
      inStock: inStock !== false,
      calories: calories ? Number(calories) : null,
      protein: protein ? String(protein) : null,
      carbs: carbs ? String(carbs) : null,
      fats: fats ? String(fats) : null,
    }).returning();
    res.status(201).json({ ...product, price: Number(product.price) });
  } catch (err) {
    req.log.error({ err }, "Failed to create vendor product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/vendors/:vendorId/products/:productId", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const productId = parseInt(req.params.productId);
    const vendor = await ensureVendorExists(vendorId);
    if (!vendor) return res.status(404).json({ error: "المتجر غير موجود" });
    const [existing] = await db.select().from(productsTable)
      .where(eq(productsTable.id, productId)).limit(1);
    if (!existing || existing.vendorId !== vendorId) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }
    const { nameAr, name, descriptionAr, description, price, originalPrice,
      categoryId, imageUrl, isKeto, isOrganic, weightOrVolume, inStock,
      calories, protein, carbs, fats } = req.body;
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
      ...(weightOrVolume !== undefined && { weightOrVolume }),
      ...(inStock !== undefined && { inStock: Boolean(inStock) }),
      ...(calories !== undefined && { calories: calories === "" || calories === null ? null : Number(calories) }),
      ...(protein !== undefined && { protein: protein === "" || protein === null ? null : String(protein) }),
      ...(carbs !== undefined && { carbs: carbs === "" || carbs === null ? null : String(carbs) }),
      ...(fats !== undefined && { fats: fats === "" || fats === null ? null : String(fats) }),
    }).where(eq(productsTable.id, productId)).returning();
    res.json({ ...updated, price: Number(updated.price) });
  } catch (err) {
    req.log.error({ err }, "Failed to update vendor product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/vendors/:vendorId/products/:productId", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const productId = parseInt(req.params.productId);
    const [existing] = await db.select().from(productsTable)
      .where(eq(productsTable.id, productId)).limit(1);
    if (!existing || existing.vendorId !== vendorId) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }
    await db.delete(productsTable).where(eq(productsTable.id, productId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete vendor product");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vendors", async (req, res) => {
  try {
    const vendors = await db.select().from(vendorProfilesTable).orderBy(vendorProfilesTable.createdAt);
    res.json(vendors);
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vendors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [vendor] = await db.select().from(vendorProfilesTable).where(eq(vendorProfilesTable.id, id)).limit(1);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    res.json(vendor);
  } catch (err) {
    req.log.error({ err }, "Failed to get vendor");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/vendors", async (req, res) => {
  try {
    const {
      userId, storeName, storeNameAr, category, description,
      phone, city, cliqAlias, walletNumber, bankAccount,
      deliveryFeeFixed, deliveryZones, freeDeliveryAbove,
    } = req.body;

    if (!userId || !storeName || !category) {
      return res.status(400).json({ error: "userId, storeName, category required" });
    }

    const [existing] = await db.select().from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.userId, Number(userId))).limit(1);

    if (existing) {
      const [updated] = await db.update(vendorProfilesTable).set({
        storeName, storeNameAr: storeNameAr || null, category,
        description: description || null, phone: phone || null, city: city || null,
        cliqAlias: cliqAlias || null, walletNumber: walletNumber || null,
        bankAccount: bankAccount || null,
        deliveryFeeFixed: deliveryFeeFixed || "1.500",
        deliveryZones: deliveryZones ? JSON.stringify(deliveryZones) : null,
        freeDeliveryAbove: freeDeliveryAbove || "20.000",
      }).where(eq(vendorProfilesTable.id, existing.id)).returning();
      return res.json(updated);
    }

    const [vendor] = await db.insert(vendorProfilesTable).values({
      userId: Number(userId), storeName, storeNameAr: storeNameAr || null,
      category, description: description || null, phone: phone || null, city: city || null,
      cliqAlias: cliqAlias || null, walletNumber: walletNumber || null,
      bankAccount: bankAccount || null,
      deliveryFeeFixed: deliveryFeeFixed || "1.500",
      deliveryZones: deliveryZones ? JSON.stringify(deliveryZones) : null,
      freeDeliveryAbove: freeDeliveryAbove || "20.000",
      status: "approved",
    }).returning();

    res.status(201).json(vendor);
  } catch (err) {
    req.log.error({ err }, "Failed to upsert vendor");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Editable vendor profile fields (everything except status / userId / id / createdAt).
// Status changes go through the dedicated /vendors/:id/status admin route.
router.patch("/vendors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { storeName, storeNameAr, category, description, phone, city,
            cliqAlias, walletNumber, bankAccount,
            deliveryFeeFixed, deliveryZones, freeDeliveryAbove } = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (storeName !== undefined) patch.storeName = storeName;
    if (storeNameAr !== undefined) patch.storeNameAr = storeNameAr;
    if (category !== undefined) patch.category = category;
    if (description !== undefined) patch.description = description;
    if (phone !== undefined) patch.phone = phone;
    if (city !== undefined) patch.city = city;
    if (cliqAlias !== undefined) patch.cliqAlias = cliqAlias;
    if (walletNumber !== undefined) patch.walletNumber = walletNumber;
    if (bankAccount !== undefined) patch.bankAccount = bankAccount;
    if (deliveryFeeFixed !== undefined) patch.deliveryFeeFixed = deliveryFeeFixed;
    if (deliveryZones !== undefined) patch.deliveryZones = deliveryZones;
    if (freeDeliveryAbove !== undefined) patch.freeDeliveryAbove = freeDeliveryAbove;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No editable fields provided" });
    }
    const [updated] = await db.update(vendorProfilesTable)
      .set(patch).where(eq(vendorProfilesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update vendor");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/vendors/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!["pending", "approved", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const [updated] = await db.update(vendorProfilesTable)
      .set({ status }).where(eq(vendorProfilesTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update vendor status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/vendors/:id", async (req, res) => {
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

export default router;

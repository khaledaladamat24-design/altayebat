import { Router } from "express";
import { db } from "@workspace/db";
import { vendorProfilesTable, productsTable, ordersTable, orderItemsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireVendorOwner } from "../lib/vendor-auth";
import { checkSaleIntegrity } from "../lib/sale-integrity";

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
      calories, protein, carbs, fats, isOnSale, subcategory, foodType } = req.body;
    if (!nameAr || !name || !price || !categoryId) {
      return res.status(400).json({ error: "الاسم والسعر والقسم مطلوبة" });
    }
    const saleCheck = checkSaleIntegrity({ isOnSale, price, originalPrice });
    if (!saleCheck.ok) return res.status(400).json({ error: saleCheck.error });
    const [product] = await db.insert(productsTable).values({
      vendorId, nameAr, name,
      descriptionAr: descriptionAr || null, description: description || null,
      price: String(price),
      originalPrice: originalPrice ? String(originalPrice) : null,
      categoryId: Number(categoryId),
      imageUrl: imageUrl || null,
      isKeto: Boolean(isKeto), isOrganic: Boolean(isOrganic),
      isFeatured: false, isBestseller: false,
      isOnSale: Boolean(isOnSale),
      weightOrVolume: weightOrVolume || null,
      inStock: inStock !== false,
      calories: calories ? Number(calories) : null,
      protein: protein ? String(protein) : null,
      carbs: carbs ? String(carbs) : null,
      fats: fats ? String(fats) : null,
      foodType: foodType === "regular" ? "regular" : "healthy",
      subcategory: subcategory ? String(subcategory) : null,
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
      calories, protein, carbs, fats, isOnSale, subcategory, foodType } = req.body;

    if (isOnSale !== undefined || originalPrice !== undefined || price !== undefined) {
      const effOnSale = isOnSale !== undefined ? Boolean(isOnSale) : existing.isOnSale;
      const effPrice = price !== undefined ? Number(price) : Number(existing.price);
      const effOrigRaw = originalPrice !== undefined ? originalPrice : existing.originalPrice;
      const saleCheck = checkSaleIntegrity({ isOnSale: effOnSale, price: effPrice, originalPrice: effOrigRaw });
      if (!saleCheck.ok) return res.status(400).json({ error: saleCheck.error });
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
      ...(isOnSale !== undefined && { isOnSale: Boolean(isOnSale) }),
      ...(weightOrVolume !== undefined && { weightOrVolume }),
      ...(inStock !== undefined && { inStock: Boolean(inStock) }),
      ...(calories !== undefined && { calories: calories === "" || calories === null ? null : Number(calories) }),
      ...(protein !== undefined && { protein: protein === "" || protein === null ? null : String(protein) }),
      ...(carbs !== undefined && { carbs: carbs === "" || carbs === null ? null : String(carbs) }),
      ...(fats !== undefined && { fats: fats === "" || fats === null ? null : String(fats) }),
      ...(foodType !== undefined && { foodType: foodType === "regular" ? "regular" : "healthy" }),
      ...(subcategory !== undefined && { subcategory: subcategory ? String(subcategory) : null }),
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

    const trimmedPhone = phone !== undefined && phone !== null ? String(phone).trim() : "";

    // Phone is mandatory when creating a new store. On updates (e.g. editing
    // payout settings, which omit phone) we keep the existing phone instead of
    // requiring or wiping it.
    if (!existing) {
      if (!trimmedPhone) {
        return res.status(400).json({ error: "رقم الهاتف للتواصل مطلوب" });
      }
      if (!/^07\d{8}$/.test(trimmedPhone)) {
        return res.status(400).json({ error: "أدخل رقم هاتف أردني صحيح (07XXXXXXXX)" });
      }
    }

    if (existing) {
      const phoneToSave = trimmedPhone !== "" ? trimmedPhone : existing.phone;
      const [updated] = await db.update(vendorProfilesTable).set({
        storeName, storeNameAr: storeNameAr || null, category,
        description: description || null, phone: phoneToSave, city: city || null,
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
      category, description: description || null, phone: trimmedPhone || null, city: city || null,
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
router.patch("/vendors/:id", requireVendorOwner("id"), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
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
    if (req.body?.isOnline !== undefined) patch.isOnline = Boolean(req.body.isOnline);
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

// List all orders for a vendor's products. Used by the vendor dashboard to
// poll for new "pending" orders and trigger the audio alert.
router.get("/vendors/:id/orders", requireVendorOwner("id"), async (req, res) => {
  try {
    const vendorId = parseInt(String(req.params.id));
    if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid id" });
    const status = typeof req.query.status === "string" ? req.query.status : null;

    const conditions = [eq(ordersTable.vendorId, vendorId)];
    if (status) conditions.push(eq(ordersTable.status, status));

    const orders = await db.select().from(ordersTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(ordersTable.createdAt));

    const orderIds = orders.map((o) => o.id);
    const items = orderIds.length
      ? await db.select({ oi: orderItemsTable, p: productsTable })
          .from(orderItemsTable)
          .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
          .where(inArray(orderItemsTable.orderId, orderIds))
      : [];

    res.json(orders.map((o) => ({
      id: o.id,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      subtotal: Number(o.subtotal),
      deliveryFee: Number(o.deliveryFee),
      total: Number(o.total),
      deliveryAddress: o.deliveryAddress,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      notes: o.notes,
      createdAt: o.createdAt.toISOString(),
      items: items.filter((r) => r.oi.orderId === o.id).map((r) => ({
        id: r.oi.id,
        productName: r.p?.name ?? "",
        productNameAr: r.p?.nameAr ?? "",
        productImageUrl: r.p?.imageUrl ?? null,
        quantity: r.oi.quantity,
        unitPrice: Number(r.oi.unitPrice),
        totalPrice: Number(r.oi.totalPrice),
      })),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list vendor orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

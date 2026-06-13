import { Router } from "express";
import { db } from "@workspace/db";
import {
  vendorProfilesTable,
  productsTable,
  ordersTable,
  orderItemsTable,
  vendorAdsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql, gte, lt } from "drizzle-orm";
import { requireVendorOwner } from "../lib/vendor-auth";
import { requireAdmin } from "../lib/vendor-auth";
import { checkSaleIntegrity } from "../lib/sale-integrity";

const router = Router();

router.get("/vendors/by-user/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });
    const [vendor] = await db
      .select()
      .from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.userId, userId))
      .limit(1);
    if (!vendor) return res.status(404).json({ error: "No vendor profile" });
    return res.json(vendor);
  } catch (err) {
    req.log.error({ err }, "Failed to get vendor by user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vendors/:id/products", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const rows = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.vendorId, id))
      .orderBy(desc(productsTable.createdAt));
    return res.json(
      rows.map((p) => ({
        ...p,
        price: Number(p.price),
        originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
        protein: p.protein ? Number(p.protein) : null,
        carbs: p.carbs ? Number(p.carbs) : null,
        fats: p.fats ? Number(p.fats) : null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list vendor products");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Vendor approval is auto-granted on signup, so product CRUD only needs to
// verify the vendor exists (not that admin manually approved it).
async function ensureVendorExists(vendorId: number) {
  const [v] = await db
    .select()
    .from(vendorProfilesTable)
    .where(eq(vendorProfilesTable.id, vendorId))
    .limit(1);
  return v || null;
}

router.post(
  "/vendors/:id/products",
  requireVendorOwner("id"),
  async (req, res) => {
    try {
      const vendorId = parseInt(String(req.params.id));
      const vendor = await ensureVendorExists(vendorId);
      if (!vendor) return res.status(404).json({ error: "المتجر غير موجود" });
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
        weightOrVolume,
        inStock,
        calories,
        protein,
        carbs,
        fats,
        isOnSale,
        subcategory,
        foodType,
      } = req.body;
      if (!nameAr || !price || !categoryId) {
        return res.status(400).json({ error: "الاسم والسعر والقسم مطلوبة" });
      }
      const saleCheck = checkSaleIntegrity({ isOnSale, price, originalPrice });
      if (!saleCheck.ok)
        return res.status(400).json({ error: saleCheck.error });
      // English name is optional — the column is NOT NULL, so fall back to the
      // Arabic name when the caller leaves it blank.
      const englishName =
        typeof name === "string" && name.trim() ? name.trim() : nameAr;
      const [product] = await db
        .insert(productsTable)
        .values({
          vendorId,
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
          isFeatured: false,
          isBestseller: false,
          isOnSale: Boolean(isOnSale),
          weightOrVolume: weightOrVolume || null,
          inStock: inStock !== false,
          calories: calories ? Number(calories) : null,
          protein: protein ? String(protein) : null,
          carbs: carbs ? String(carbs) : null,
          fats: fats ? String(fats) : null,
          foodType:
            foodType === "regular" || foodType === "grocery"
              ? foodType
              : "healthy",
          subcategory: subcategory ? String(subcategory) : null,
        })
        .returning();
      return res.status(201).json({ ...product, price: Number(product.price) });
    } catch (err) {
      req.log.error({ err }, "Failed to create vendor product");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.patch(
  "/vendors/:vendorId/products/:productId",
  requireVendorOwner("vendorId"),
  async (req, res) => {
    try {
      const vendorId = parseInt(String(req.params.vendorId));
      const productId = parseInt(String(req.params.productId));
      const vendor = await ensureVendorExists(vendorId);
      if (!vendor) return res.status(404).json({ error: "المتجر غير موجود" });
      const [existing] = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);
      if (!existing || existing.vendorId !== vendorId) {
        return res.status(404).json({ error: "المنتج غير موجود" });
      }
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
        weightOrVolume,
        inStock,
        calories,
        protein,
        carbs,
        fats,
        isOnSale,
        subcategory,
        foodType,
      } = req.body;

      if (
        isOnSale !== undefined ||
        originalPrice !== undefined ||
        price !== undefined
      ) {
        const effOnSale =
          isOnSale !== undefined ? Boolean(isOnSale) : existing.isOnSale;
        const effPrice =
          price !== undefined ? Number(price) : Number(existing.price);
        const effOrigRaw =
          originalPrice !== undefined ? originalPrice : existing.originalPrice;
        const saleCheck = checkSaleIntegrity({
          isOnSale: effOnSale,
          price: effPrice,
          originalPrice: effOrigRaw,
        });
        if (!saleCheck.ok)
          return res.status(400).json({ error: saleCheck.error });
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
          ...(isOnSale !== undefined && { isOnSale: Boolean(isOnSale) }),
          ...(weightOrVolume !== undefined && { weightOrVolume }),
          ...(inStock !== undefined && { inStock: Boolean(inStock) }),
          ...(calories !== undefined && {
            calories:
              calories === "" || calories === null ? null : Number(calories),
          }),
          ...(protein !== undefined && {
            protein:
              protein === "" || protein === null ? null : String(protein),
          }),
          ...(carbs !== undefined && {
            carbs: carbs === "" || carbs === null ? null : String(carbs),
          }),
          ...(fats !== undefined && {
            fats: fats === "" || fats === null ? null : String(fats),
          }),
          ...(foodType !== undefined && {
            foodType:
              foodType === "regular" || foodType === "grocery"
                ? foodType
                : "healthy",
          }),
          ...(subcategory !== undefined && {
            subcategory: subcategory ? String(subcategory) : null,
          }),
        })
        .where(eq(productsTable.id, productId))
        .returning();
      return res.json({ ...updated, price: Number(updated.price) });
    } catch (err) {
      req.log.error({ err }, "Failed to update vendor product");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.delete(
  "/vendors/:vendorId/products/:productId",
  requireVendorOwner("vendorId"),
  async (req, res) => {
    try {
      const vendorId = parseInt(String(req.params.vendorId));
      const productId = parseInt(String(req.params.productId));
      const [existing] = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);
      if (!existing || existing.vendorId !== vendorId) {
        return res.status(404).json({ error: "المنتج غير موجود" });
      }
      await db.delete(productsTable).where(eq(productsTable.id, productId));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to delete vendor product");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get("/vendors", async (req, res) => {
  try {
    const vendors = await db
      .select()
      .from(vendorProfilesTable)
      .orderBy(vendorProfilesTable.createdAt);
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
    const [vendor] = await db
      .select()
      .from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.id, id))
      .limit(1);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    return res.json(vendor);
  } catch (err) {
    req.log.error({ err }, "Failed to get vendor");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/vendors", async (req, res) => {
  try {
    const {
      userId,
      storeName,
      storeNameAr,
      category,
      description,
      phone,
      city,
      cliqAlias,
      walletNumber,
      bankAccount,
      deliveryFeeFixed,
      deliveryZones,
      freeDeliveryAbove,
    } = req.body;

    if (!userId || !storeName || !category) {
      return res
        .status(400)
        .json({ error: "userId, storeName, category required" });
    }

    const [existing] = await db
      .select()
      .from(vendorProfilesTable)
      .where(eq(vendorProfilesTable.userId, Number(userId)))
      .limit(1);

    const trimmedPhone =
      phone !== undefined && phone !== null ? String(phone).trim() : "";

    // Phone is mandatory when creating a new store. On updates (e.g. editing
    // payout settings, which omit phone) we keep the existing phone instead of
    // requiring or wiping it.
    if (!existing) {
      if (!trimmedPhone) {
        return res.status(400).json({ error: "رقم الهاتف للتواصل مطلوب" });
      }
      if (!/^07\d{8}$/.test(trimmedPhone)) {
        return res
          .status(400)
          .json({ error: "أدخل رقم هاتف أردني صحيح (07XXXXXXXX)" });
      }
    }

    if (existing) {
      const phoneToSave = trimmedPhone !== "" ? trimmedPhone : existing.phone;
      const [updated] = await db
        .update(vendorProfilesTable)
        .set({
          storeName,
          storeNameAr: storeNameAr || null,
          category,
          description: description || null,
          phone: phoneToSave,
          city: city || null,
          cliqAlias: cliqAlias || null,
          walletNumber: walletNumber || null,
          bankAccount: bankAccount || null,
          deliveryFeeFixed: deliveryFeeFixed || "1.500",
          deliveryZones: deliveryZones ? JSON.stringify(deliveryZones) : null,
          freeDeliveryAbove: freeDeliveryAbove || "20.000",
        })
        .where(eq(vendorProfilesTable.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [vendor] = await db
      .insert(vendorProfilesTable)
      .values({
        userId: Number(userId),
        storeName,
        storeNameAr: storeNameAr || null,
        category,
        description: description || null,
        phone: trimmedPhone || null,
        city: city || null,
        cliqAlias: cliqAlias || null,
        walletNumber: walletNumber || null,
        bankAccount: bankAccount || null,
        deliveryFeeFixed: deliveryFeeFixed || "1.500",
        deliveryZones: deliveryZones ? JSON.stringify(deliveryZones) : null,
        freeDeliveryAbove: freeDeliveryAbove || "20.000",
        status: "approved",
      })
      .returning();

    return res.status(201).json(vendor);
  } catch (err) {
    req.log.error({ err }, "Failed to upsert vendor");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Editable vendor profile fields (everything except status / userId / id / createdAt).
// Status changes go through the dedicated /vendors/:id/status admin route.
router.patch("/vendors/:id", requireVendorOwner("id"), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const {
      storeName,
      storeNameAr,
      category,
      description,
      phone,
      city,
      cliqAlias,
      walletNumber,
      bankAccount,
      deliveryFeeFixed,
      deliveryZones,
      freeDeliveryAbove,
    } = req.body ?? {};
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
    if (deliveryFeeFixed !== undefined)
      patch.deliveryFeeFixed = deliveryFeeFixed;
    if (deliveryZones !== undefined) patch.deliveryZones = deliveryZones;
    if (freeDeliveryAbove !== undefined)
      patch.freeDeliveryAbove = freeDeliveryAbove;
    if (req.body?.isOnline !== undefined)
      patch.isOnline = Boolean(req.body.isOnline);
    if (req.body?.pickupEnabled !== undefined)
      patch.pickupEnabled = Boolean(req.body.pickupEnabled);
    if (req.body?.deliveryEnabled !== undefined)
      patch.deliveryEnabled = Boolean(req.body.deliveryEnabled);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No editable fields provided" });
    }
    const [updated] = await db
      .update(vendorProfilesTable)
      .set(patch)
      .where(eq(vendorProfilesTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update vendor");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/vendors/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { status } = req.body;
    if (!["pending", "approved", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const [updated] = await db
      .update(vendorProfilesTable)
      .set({ status })
      .where(eq(vendorProfilesTable.id, id))
      .returning();
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update vendor status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/vendors/:id", requireVendorOwner("id"), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(vendorProfilesTable).where(eq(vendorProfilesTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete vendor");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const MAX_ADS_PER_VENDOR = 10;

// Ads are image-only. Reject anything that looks like a video (Cloudinary
// video delivery path or a common video file extension).
function looksLikeVideo(url: string): boolean {
  const u = url.toLowerCase();
  if (u.includes("/video/upload/")) return true;
  return /\.(mp4|mov|webm|avi|mkv|m4v|ogv|3gp)(\?|$)/.test(u);
}

// Public: list a vendor's promotional ads (newest first by sort order).
router.get("/vendors/:id/ads", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid id" });
    const ads = await db
      .select()
      .from(vendorAdsTable)
      .where(eq(vendorAdsTable.vendorId, vendorId))
      .orderBy(vendorAdsTable.sortOrder, desc(vendorAdsTable.createdAt));
    return res.json(ads);
  } catch (err) {
    req.log.error({ err }, "Failed to list vendor ads");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Owner/admin: add an ad. Caps each vendor at MAX_ADS_PER_VENDOR and rejects
// non-image media.
router.post("/vendors/:id/ads", requireVendorOwner("id"), async (req, res) => {
  try {
    const vendorId = parseInt(String(req.params.id));
    if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid id" });
    const { imageUrl, title, titleAr, linkUrl, sortOrder } = req.body ?? {};
    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ error: "صورة الإعلان مطلوبة" });
    }
    if (looksLikeVideo(imageUrl)) {
      return res
        .status(400)
        .json({ error: "يُسمح بالصور فقط (لا يمكن رفع فيديو)" });
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(vendorAdsTable)
      .where(eq(vendorAdsTable.vendorId, vendorId));
    if (count >= MAX_ADS_PER_VENDOR) {
      return res.status(400).json({
        error: `الحد الأقصى ${MAX_ADS_PER_VENDOR} إعلانات لكل متجر`,
      });
    }
    const [ad] = await db
      .insert(vendorAdsTable)
      .values({
        vendorId,
        imageUrl,
        title: title || null,
        titleAr: titleAr || null,
        linkUrl: linkUrl || null,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      })
      .returning();
    return res.status(201).json(ad);
  } catch (err) {
    req.log.error({ err }, "Failed to create vendor ad");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Owner/admin: delete an ad (must belong to the vendor in the path).
router.delete(
  "/vendors/:id/ads/:adId",
  requireVendorOwner("id"),
  async (req, res) => {
    try {
      const vendorId = parseInt(String(req.params.id));
      const adId = parseInt(String(req.params.adId));
      if (isNaN(vendorId) || isNaN(adId)) {
        return res.status(400).json({ error: "Invalid id" });
      }
      const [existing] = await db
        .select()
        .from(vendorAdsTable)
        .where(eq(vendorAdsTable.id, adId))
        .limit(1);
      if (!existing || existing.vendorId !== vendorId) {
        return res.status(404).json({ error: "الإعلان غير موجود" });
      }
      await db.delete(vendorAdsTable).where(eq(vendorAdsTable.id, adId));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Failed to delete vendor ad");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// List all orders for a vendor's products. Used by the vendor dashboard to
// poll for new "pending" orders and trigger the audio alert.
router.get(
  "/vendors/:id/orders",
  requireVendorOwner("id"),
  async (req, res) => {
    try {
      const vendorId = parseInt(String(req.params.id));
      if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid id" });

      // Optional `date=YYYY-MM-DD` switches to read-only history mode: return
      // EVERY order placed on that calendar day in Amman (UTC+3, no DST), of any
      // status, ignoring the shift boundary and status filter. Used by the
      // dashboard's date dropdown to review a past day.
      const dateParam =
        typeof req.query.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : null;

      // `status` accepts a single status or a comma-separated list so the
      // dashboard can fetch all active orders (pending,preparing,ready,…) in one call.
      const statuses =
        typeof req.query.status === "string"
          ? req.query.status
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const conditions = [eq(ordersTable.vendorId, vendorId)];

      if (dateParam) {
        // Amman day boundaries → UTC instants (UTC+3 fixed offset).
        const dayStart = new Date(`${dateParam}T00:00:00+03:00`);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        conditions.push(gte(ordersTable.createdAt, dayStart));
        conditions.push(lt(ordersTable.createdAt, dayEnd));
      } else {
        // Live "current shift" view: only orders since the last "تصفير الوردية".
        // close-shift stamps vendor_profiles.shiftResetAt = now(), so past
        // shifts vanish from the screen WITHOUT being deleted/cancelled.
        const [vendor] = await db
          .select({ shiftResetAt: vendorProfilesTable.shiftResetAt })
          .from(vendorProfilesTable)
          .where(eq(vendorProfilesTable.id, vendorId))
          .limit(1);
        if (vendor?.shiftResetAt)
          conditions.push(gte(ordersTable.createdAt, vendor.shiftResetAt));
        if (statuses.length === 1)
          conditions.push(eq(ordersTable.status, statuses[0]));
        else if (statuses.length > 1)
          conditions.push(inArray(ordersTable.status, statuses));
      }

      const orders = await db
        .select()
        .from(ordersTable)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .orderBy(desc(ordersTable.createdAt));

      const orderIds = orders.map((o) => o.id);
      const items = orderIds.length
        ? await db
            .select({ oi: orderItemsTable, p: productsTable })
            .from(orderItemsTable)
            .leftJoin(
              productsTable,
              eq(orderItemsTable.productId, productsTable.id),
            )
            .where(inArray(orderItemsTable.orderId, orderIds))
        : [];

      return res.json(
        orders.map((o) => ({
          id: o.id,
          status: o.status,
          fulfillmentType: o.fulfillmentType,
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
          items: items
            .filter((r) => r.oi.orderId === o.id)
            .map((r) => ({
              id: r.oi.id,
              productName: r.p?.name ?? "",
              productNameAr: r.p?.nameAr ?? "",
              productImageUrl: r.p?.imageUrl ?? null,
              quantity: r.oi.quantity,
              unitPrice: Number(r.oi.unitPrice),
              totalPrice: Number(r.oi.totalPrice),
            })),
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list vendor orders");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// End-of-shift reset ("تصفير الوردية"). The restaurant taps this to start a
// fresh, empty screen for the next shift. Per the accounting requirement we NO
// LONGER cancel or delete anything — every past order stays in the DB forever so
// the sales record can't be lost or tampered with. Instead we stamp
// shiftResetAt = now() on the vendor; the live dashboard query only returns
// orders created at/after that instant, so the finished shift simply disappears
// from the screen while remaining reachable through the date dropdown.
router.post(
  "/vendors/:id/orders/close-shift",
  requireVendorOwner("id"),
  async (req, res) => {
    try {
      const vendorId = parseInt(String(req.params.id));
      if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid id" });
      const now = new Date();
      await db
        .update(vendorProfilesTable)
        .set({ shiftResetAt: now })
        .where(eq(vendorProfilesTable.id, vendorId));
      return res.json({ shiftResetAt: now.toISOString() });
    } catch (err) {
      req.log.error({ err }, "Failed to close vendor shift");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;

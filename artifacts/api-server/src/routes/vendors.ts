import { Router } from "express";
import { db } from "@workspace/db";
import { vendorProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
      status: "pending",
    }).returning();

    res.status(201).json(vendor);
  } catch (err) {
    req.log.error({ err }, "Failed to upsert vendor");
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

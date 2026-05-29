import { Router } from "express";
import { db, deliveryProvidersTable, ordersTable } from "@workspace/db";
import type { DeliveryProvider } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { isAdminReq } from "../lib/admin-auth";
import { getAdapter, listAdapterTypes } from "../delivery/registry";
import { DeliveryNotConfiguredError } from "../delivery/types";

const router = Router();

const PUBLIC_FIELDS = [
  "id", "code", "name", "nameAr", "type", "baseUrl", "enabled", "isDefault",
  "contactPhone", "contactWhatsapp", "settings", "createdAt", "updatedAt",
] as const;

/** Strip credentials before returning a provider to the client. */
function sanitize(p: DeliveryProvider) {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_FIELDS) out[k] = p[k as keyof DeliveryProvider];
  out.hasCredentials = Object.keys(p.credentials ?? {}).length > 0;
  return out;
}

// GET /api/delivery/adapter-types — list of supported provider types + their required credential keys.
// Public so the admin UI can render the right form fields per provider type.
router.get("/delivery/adapter-types", (_req, res) => {
  res.json(listAdapterTypes());
});

// GET /api/delivery/providers — list all configured providers (credentials stripped). Admin only.
router.get("/delivery/providers", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: "Forbidden" });
  try {
    const rows = await db.select().from(deliveryProvidersTable);
    res.json(rows.map(sanitize));
  } catch (err) {
    req.log.error({ err }, "Failed to list delivery providers");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/delivery/providers — create. Admin only.
router.post("/delivery/providers", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: "Forbidden" });
  try {
    const {
      code, name, nameAr, type = "manual", baseUrl,
      enabled = false, isDefault = false,
      contactPhone, contactWhatsapp,
      credentials = {}, settings = {},
    } = req.body ?? {};
    if (!code || !name || !nameAr) {
      return res.status(400).json({ error: "code, name, nameAr are required" });
    }
    if (!getAdapter(type)) {
      return res.status(400).json({ error: `Unknown delivery type: ${type}` });
    }
    if (isDefault) {
      await db.update(deliveryProvidersTable).set({ isDefault: false });
    }
    const [created] = await db.insert(deliveryProvidersTable).values({
      code, name, nameAr, type, baseUrl,
      enabled, isDefault,
      contactPhone, contactWhatsapp,
      credentials, settings,
    }).returning();
    res.status(201).json(sanitize(created));
  } catch (err) {
    req.log.error({ err }, "Failed to create delivery provider");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/providers/:id — update. Admin only.
router.patch("/delivery/providers/:id", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: "Forbidden" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const body = req.body ?? {};
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const editable = [
      "code", "name", "nameAr", "type", "baseUrl", "enabled", "isDefault",
      "contactPhone", "contactWhatsapp", "credentials", "settings",
    ];
    for (const k of editable) if (k in body) patch[k] = body[k];
    if (patch.type && !getAdapter(String(patch.type))) {
      return res.status(400).json({ error: `Unknown delivery type: ${patch.type}` });
    }
    if (patch.isDefault === true) {
      await db.update(deliveryProvidersTable).set({ isDefault: false }).where(sql`${deliveryProvidersTable.id} <> ${id}`);
    }
    const [updated] = await db.update(deliveryProvidersTable).set(patch).where(eq(deliveryProvidersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(sanitize(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update delivery provider");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/delivery/providers/:id — admin only.
router.delete("/delivery/providers/:id", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: "Forbidden" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(deliveryProvidersTable).where(eq(deliveryProvidersTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete delivery provider");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/delivery/orders/:orderId/shipment — create a shipment for an order via the chosen
// (or default) provider. Admin only. Idempotent: if a tracking number already exists, returns it.
router.post("/delivery/orders/:orderId/shipment", async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: "Forbidden" });
  try {
    const orderId = parseInt(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });
    const providerId = req.body?.providerId ? parseInt(req.body.providerId) : null;

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.deliveryTrackingNumber) {
      return res.json({ trackingNumber: order.deliveryTrackingNumber, awbUrl: order.deliveryAwbUrl, status: order.deliveryStatus, alreadyShipped: true });
    }

    let provider: DeliveryProvider | undefined;
    if (providerId) {
      [provider] = await db.select().from(deliveryProvidersTable).where(eq(deliveryProvidersTable.id, providerId)).limit(1);
    } else {
      [provider] = await db.select().from(deliveryProvidersTable).where(eq(deliveryProvidersTable.isDefault, true)).limit(1);
    }
    if (!provider) return res.status(400).json({ error: "No delivery provider available. Configure one in the admin panel first." });
    if (!provider.enabled) return res.status(400).json({ error: `Provider ${provider.nameAr} is disabled.` });

    const adapter = getAdapter(provider.type);
    if (!adapter) return res.status(500).json({ error: `Unknown provider type: ${provider.type}` });

    try {
      const result = await adapter.createShipment(provider, {
        order,
        recipientName: order.customerName ?? "",
        recipientPhone: order.customerPhone ?? "",
        recipientAddress: order.deliveryAddress,
        totalCod: order.paymentMethod === "cod" ? Number(order.total) : 0,
        notes: order.notes,
      });
      await db.update(ordersTable).set({
        deliveryProviderId: provider.id,
        deliveryTrackingNumber: result.trackingNumber,
        deliveryAwbUrl: result.awbUrl ?? null,
        deliveryStatus: result.status ?? "shipped",
        deliveryShippedAt: new Date(),
        status: order.status === "pending" ? "shipped" : order.status,
      }).where(eq(ordersTable.id, orderId));
      res.json(result);
    } catch (err) {
      if (err instanceof DeliveryNotConfiguredError) {
        return res.status(400).json({ error: err.message, notConfigured: true });
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to create shipment");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/delivery/orders/:orderId/track — public tracking by order id. Returns nothing sensitive.
router.get("/delivery/orders/:orderId/track", async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ error: "Invalid orderId" });
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.deliveryTrackingNumber || !order.deliveryProviderId) {
      return res.json({ status: order.status, trackingNumber: null });
    }
    const [provider] = await db.select().from(deliveryProvidersTable).where(eq(deliveryProvidersTable.id, order.deliveryProviderId)).limit(1);
    if (!provider) return res.json({ status: order.deliveryStatus ?? order.status, trackingNumber: order.deliveryTrackingNumber });
    const adapter = getAdapter(provider.type);
    if (!adapter) return res.json({ status: order.deliveryStatus, trackingNumber: order.deliveryTrackingNumber });
    try {
      const track = await adapter.trackShipment(provider, order.deliveryTrackingNumber);
      res.json({
        trackingNumber: order.deliveryTrackingNumber,
        awbUrl: order.deliveryAwbUrl,
        providerName: provider.nameAr,
        providerPhone: provider.contactPhone,
        ...track,
      });
    } catch (err) {
      if (err instanceof DeliveryNotConfiguredError) {
        return res.json({
          trackingNumber: order.deliveryTrackingNumber,
          awbUrl: order.deliveryAwbUrl,
          providerName: provider.nameAr,
          providerPhone: provider.contactPhone,
          status: order.deliveryStatus ?? "shipped",
          notConfigured: true,
        });
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to track shipment");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

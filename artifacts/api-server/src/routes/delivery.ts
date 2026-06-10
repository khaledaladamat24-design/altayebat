import { Router, type Request, type Response } from "express";
import { db, deliveryProvidersTable, ordersTable } from "@workspace/db";
import type { DeliveryProvider } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  GetOrderTrackingResponse,
  CreateOrderShipmentResponse,
  CancelOrderShipmentResponse,
  ListDeliveryProvidersResponse,
  ListDeliveryProvidersResponseItem,
  ListDeliveryAdapterTypesResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/admin-auth";
import { getAdapter, listAdapterTypes } from "../delivery/registry";
import { DeliveryNotConfiguredError } from "../delivery/types";

const router = Router();

// Validate/serialize a tracking payload against the OpenAPI `OrderTracking`
// contract before sending. Delivery adapters can return arbitrary shapes, so
// this strips unknown fields and rejects malformed data — the client can never
// receive an off-contract response, and a bad adapter surfaces as a controlled,
// logged 500 instead of leaking a divergent payload.
function sendTracking(req: Request, res: Response, candidate: unknown) {
  const parsed = GetOrderTrackingResponse.safeParse(candidate);
  if (!parsed.success) {
    req.log.error(
      { err: parsed.error, candidate },
      "Tracking response failed contract validation",
    );
    return res.status(500).json({ error: "Internal server error" });
  }
  return res.json(parsed.data);
}

// Validate/serialize a shipment-creation payload against the OpenAPI
// `ShipmentResult` contract before sending. Delivery adapters can return
// arbitrary shapes, so this strips unknown fields and rejects malformed data
// (e.g. a missing/non-string trackingNumber) — the client can never receive an
// off-contract response, and a bad adapter surfaces as a controlled, logged 500
// instead of leaking a divergent payload.
function sendShipment(req: Request, res: Response, candidate: unknown) {
  const parsed = CreateOrderShipmentResponse.safeParse(candidate);
  if (!parsed.success) {
    req.log.error(
      { err: parsed.error, candidate },
      "Shipment response failed contract validation",
    );
    return res.status(500).json({ error: "Internal server error" });
  }
  return res.json(parsed.data);
}

// Validate/serialize a shipment-cancellation payload against the OpenAPI
// `ShipmentCancelResult` contract before sending, so the client can never
// receive an off-contract response.
function sendCancel(req: Request, res: Response, candidate: unknown) {
  const parsed = CancelOrderShipmentResponse.safeParse(candidate);
  if (!parsed.success) {
    req.log.error(
      { err: parsed.error, candidate },
      "Shipment cancel response failed contract validation",
    );
    return res.status(500).json({ error: "Internal server error" });
  }
  return res.json(parsed.data);
}

/**
 * Strip credentials and build the public shape of a provider. Dates are
 * serialized to ISO strings so the result matches the OpenAPI `DeliveryProvider`
 * contract (which types `createdAt`/`updatedAt` as strings).
 */
function sanitize(p: DeliveryProvider) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    nameAr: p.nameAr,
    type: p.type,
    baseUrl: p.baseUrl,
    enabled: p.enabled,
    isDefault: p.isDefault,
    contactPhone: p.contactPhone,
    contactWhatsapp: p.contactWhatsapp,
    settings: p.settings ?? {},
    hasCredentials: Object.keys(p.credentials ?? {}).length > 0,
    createdAt:
      p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt:
      p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  };
}

// Validate/serialize a single provider payload against the OpenAPI
// `DeliveryProvider` contract before sending. A default Zod object strips
// unknown keys, so credentials (or any other off-contract field) can never leak
// to the admin UI; a malformed row surfaces as a controlled, logged 500.
function sendProvider(
  req: Request,
  res: Response,
  candidate: unknown,
  status = 200,
) {
  const parsed = ListDeliveryProvidersResponseItem.safeParse(candidate);
  if (!parsed.success) {
    req.log.error(
      { err: parsed.error, candidate },
      "Delivery provider response failed contract validation",
    );
    return res.status(500).json({ error: "Internal server error" });
  }
  return res.status(status).json(parsed.data);
}

// Validate/serialize the provider-list payload against the OpenAPI
// `DeliveryProvider` array contract before sending, for the same reasons as
// sendProvider().
function sendProviders(req: Request, res: Response, candidate: unknown) {
  const parsed = ListDeliveryProvidersResponse.safeParse(candidate);
  if (!parsed.success) {
    req.log.error(
      { err: parsed.error, candidate },
      "Delivery providers list response failed contract validation",
    );
    return res.status(500).json({ error: "Internal server error" });
  }
  return res.json(parsed.data);
}

// Validate/serialize the adapter-types payload against the OpenAPI `AdapterType`
// array contract before sending. listAdapterTypes() aggregates per-adapter
// requiredCredentials() output, so a drift there (renamed field, missing
// credential-key metadata) is caught here as a controlled, logged 500 instead of
// silently breaking the admin form, for the same reasons as sendProvider().
function sendAdapterTypes(req: Request, res: Response, candidate: unknown) {
  const parsed = ListDeliveryAdapterTypesResponse.safeParse(candidate);
  if (!parsed.success) {
    req.log.error(
      { err: parsed.error, candidate },
      "Delivery adapter-types response failed contract validation",
    );
    return res.status(500).json({ error: "Internal server error" });
  }
  return res.json(parsed.data);
}

// GET /api/delivery/adapter-types — list of supported provider types + their required credential keys.
// Public so the admin UI can render the right form fields per provider type.
router.get("/delivery/adapter-types", (req, res) => {
  return sendAdapterTypes(req, res, listAdapterTypes());
});

// GET /api/delivery/providers — list all configured providers (credentials stripped). Admin only.
router.get("/delivery/providers", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(deliveryProvidersTable);
    return sendProviders(req, res, rows.map(sanitize));
  } catch (err) {
    req.log.error({ err }, "Failed to list delivery providers");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/delivery/providers — create. Admin only.
router.post("/delivery/providers", requireAdmin, async (req, res) => {
  try {
    const {
      code,
      name,
      nameAr,
      type = "manual",
      baseUrl,
      enabled = false,
      isDefault = false,
      contactPhone,
      contactWhatsapp,
      credentials = {},
      settings = {},
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
    const [created] = await db
      .insert(deliveryProvidersTable)
      .values({
        code,
        name,
        nameAr,
        type,
        baseUrl,
        enabled,
        isDefault,
        contactPhone,
        contactWhatsapp,
        credentials,
        settings,
      })
      .returning();
    return sendProvider(req, res, sanitize(created), 201);
  } catch (err) {
    req.log.error({ err }, "Failed to create delivery provider");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/providers/:id — update. Admin only.
router.patch("/delivery/providers/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const body = req.body ?? {};
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const editable = [
      "code",
      "name",
      "nameAr",
      "type",
      "baseUrl",
      "enabled",
      "isDefault",
      "contactPhone",
      "contactWhatsapp",
      "credentials",
      "settings",
    ];
    for (const k of editable) if (k in body) patch[k] = body[k];
    if (patch.type && !getAdapter(String(patch.type))) {
      return res
        .status(400)
        .json({ error: `Unknown delivery type: ${patch.type}` });
    }
    if (patch.isDefault === true) {
      await db
        .update(deliveryProvidersTable)
        .set({ isDefault: false })
        .where(sql`${deliveryProvidersTable.id} <> ${id}`);
    }
    const [updated] = await db
      .update(deliveryProvidersTable)
      .set(patch)
      .where(eq(deliveryProvidersTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return sendProvider(req, res, sanitize(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update delivery provider");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/delivery/providers/:id — admin only.
router.delete("/delivery/providers/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db
      .delete(deliveryProvidersTable)
      .where(eq(deliveryProvidersTable.id, id));
    return res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete delivery provider");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/delivery/orders/:orderId/shipment — create a shipment for an order via the chosen
// (or default) provider. Admin only. Idempotent: if a tracking number already exists, returns it.
router.post(
  "/delivery/orders/:orderId/shipment",
  requireAdmin,
  async (req, res) => {
    try {
      const orderId = parseInt(String(req.params.orderId));
      if (isNaN(orderId))
        return res.status(400).json({ error: "Invalid orderId" });
      const providerId = req.body?.providerId
        ? parseInt(req.body.providerId)
        : null;

      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.deliveryTrackingNumber) {
        return sendShipment(req, res, {
          trackingNumber: order.deliveryTrackingNumber,
          awbUrl: order.deliveryAwbUrl,
          status: order.deliveryStatus,
          alreadyShipped: true,
        });
      }

      let provider: DeliveryProvider | undefined;
      if (providerId) {
        [provider] = await db
          .select()
          .from(deliveryProvidersTable)
          .where(eq(deliveryProvidersTable.id, providerId))
          .limit(1);
      } else {
        [provider] = await db
          .select()
          .from(deliveryProvidersTable)
          .where(eq(deliveryProvidersTable.isDefault, true))
          .limit(1);
      }
      if (!provider)
        return res.status(400).json({
          error:
            "No delivery provider available. Configure one in the admin panel first.",
        });
      if (!provider.enabled)
        return res
          .status(400)
          .json({ error: `Provider ${provider.nameAr} is disabled.` });

      const adapter = getAdapter(provider.type);
      if (!adapter)
        return res
          .status(500)
          .json({ error: `Unknown provider type: ${provider.type}` });

      try {
        const result = await adapter.createShipment(provider, {
          order,
          recipientName: order.customerName ?? "",
          recipientPhone: order.customerPhone ?? "",
          recipientAddress: order.deliveryAddress,
          totalCod: order.paymentMethod === "cod" ? Number(order.total) : 0,
          notes: order.notes,
        });
        // Validate the adapter result against the contract BEFORE persisting,
        // so a malformed result can never write off-contract values onto the
        // order row. On failure this returns a controlled, logged 500 and the
        // order is left untouched.
        const parsed = CreateOrderShipmentResponse.safeParse(result);
        if (!parsed.success) {
          req.log.error(
            { err: parsed.error, candidate: result },
            "Shipment response failed contract validation",
          );
          return res.status(500).json({ error: "Internal server error" });
        }
        await db
          .update(ordersTable)
          .set({
            deliveryProviderId: provider.id,
            deliveryTrackingNumber: parsed.data.trackingNumber,
            deliveryAwbUrl: parsed.data.awbUrl ?? null,
            deliveryStatus: parsed.data.status ?? "shipped",
            deliveryShippedAt: new Date(),
            status: order.status === "pending" ? "shipped" : order.status,
          })
          .where(eq(ordersTable.id, orderId));
        return res.json(parsed.data);
      } catch (err) {
        if (err instanceof DeliveryNotConfiguredError) {
          return res
            .status(400)
            .json({ error: err.message, notConfigured: true });
        }
        throw err;
      }
    } catch (err) {
      req.log.error({ err }, "Failed to create shipment");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/delivery/orders/:orderId/shipment/cancel — cancel/void an existing shipment. Admin only.
// Calls the provider's cancelShipment adapter method when present, then clears the order's
// delivery_* tracking columns and resets the order status. If the adapter doesn't implement
// cancelShipment, the shipment is voided locally only (notImplemented: true).
router.post(
  "/delivery/orders/:orderId/shipment/cancel",
  requireAdmin,
  async (req, res) => {
    try {
      const orderId = parseInt(String(req.params.orderId));
      if (isNaN(orderId))
        return res.status(400).json({ error: "Invalid orderId" });

      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (!order.deliveryTrackingNumber) {
        return res
          .status(400)
          .json({ error: "Order has no shipment to cancel" });
      }

      // Resolve the provider/adapter the shipment was created with, if any.
      let provider: DeliveryProvider | undefined;
      if (order.deliveryProviderId) {
        [provider] = await db
          .select()
          .from(deliveryProvidersTable)
          .where(eq(deliveryProvidersTable.id, order.deliveryProviderId))
          .limit(1);
      }
      const adapter = provider ? getAdapter(provider.type) : null;

      // Clears all delivery tracking columns and resets a "shipped" order back to
      // "pending". Returns the persisted payload validated against the contract.
      const voidShipmentLocally = async (notImplemented: boolean) => {
        const nextStatus =
          order.status === "shipped" ? "pending" : order.status;
        await db
          .update(ordersTable)
          .set({
            deliveryProviderId: null,
            deliveryTrackingNumber: null,
            deliveryAwbUrl: null,
            deliveryStatus: null,
            deliveryShippedAt: null,
            status: nextStatus,
          })
          .where(eq(ordersTable.id, orderId));
        return sendCancel(req, res, {
          cancelled: true,
          status: nextStatus,
          ...(notImplemented ? { notImplemented: true } : {}),
        });
      };

      // No usable adapter, or the adapter can't cancel with the carrier:
      // void the shipment locally so the admin isn't stuck.
      if (!adapter || typeof adapter.cancelShipment !== "function") {
        return voidShipmentLocally(true);
      }

      try {
        await adapter.cancelShipment(
          provider as DeliveryProvider,
          order.deliveryTrackingNumber,
        );
      } catch (err) {
        if (err instanceof DeliveryNotConfiguredError) {
          // Carrier couldn't be reached — leave the order untouched.
          return res
            .status(400)
            .json({ error: err.message, notConfigured: true });
        }
        throw err;
      }

      return voidShipmentLocally(false);
    } catch (err) {
      req.log.error({ err }, "Failed to cancel shipment");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/delivery/orders/:orderId/track — public tracking by order id. Returns nothing sensitive.
router.get("/delivery/orders/:orderId/track", async (req, res) => {
  try {
    const orderId = parseInt(String(req.params.orderId));
    if (isNaN(orderId))
      return res.status(400).json({ error: "Invalid orderId" });
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!order.deliveryTrackingNumber || !order.deliveryProviderId) {
      return sendTracking(req, res, {
        status: order.status,
        trackingNumber: null,
      });
    }
    const [provider] = await db
      .select()
      .from(deliveryProvidersTable)
      .where(eq(deliveryProvidersTable.id, order.deliveryProviderId))
      .limit(1);
    if (!provider)
      return sendTracking(req, res, {
        status: order.deliveryStatus ?? order.status,
        trackingNumber: order.deliveryTrackingNumber,
      });
    const adapter = getAdapter(provider.type);
    if (!adapter)
      return sendTracking(req, res, {
        status: order.deliveryStatus,
        trackingNumber: order.deliveryTrackingNumber,
      });
    try {
      const track = await adapter.trackShipment(
        provider,
        order.deliveryTrackingNumber,
      );
      return sendTracking(req, res, {
        trackingNumber: order.deliveryTrackingNumber,
        awbUrl: order.deliveryAwbUrl,
        providerName: provider.nameAr,
        providerPhone: provider.contactPhone,
        ...track,
      });
    } catch (err) {
      if (err instanceof DeliveryNotConfiguredError) {
        return sendTracking(req, res, {
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

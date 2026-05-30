import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, deliveryProvidersTable, ordersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { DeliveryNotConfiguredError } from "../../delivery/types";
import { SUPER_ADMIN_EMAIL } from "../../lib/admin-auth";

// Inject a fake delivery adapter so we control exactly what createShipment
// returns (a valid ShipmentResult, or a thrown DeliveryNotConfiguredError).
// listAdapterTypes is kept real.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("../../delivery/registry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../delivery/registry")>();
  return {
    ...actual,
    getAdapter: () => ({
      type: "manual",
      isConfigured: () => true,
      requiredCredentials: () => [],
      createShipment: mockCreate,
      trackShipment: vi.fn(),
    }),
  };
});

import deliveryRouter from "../delivery";

const logError = vi.fn();

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: unknown }).log = {
      error: logError,
      info() {},
      warn() {},
    };
    next();
  });
  app.use("/api", deliveryRouter);
  return app;
}

const app = makeApp();
// Authenticate every request as the super-admin so requireAdmin passes.
const asAdmin = (r: request.Test) => r.set("x-admin-email", SUPER_ADMIN_EMAIL);
const tag = Date.now();
const providerIds: number[] = [];
const orderIds: number[] = [];

let enabledProviderId = 0;
let disabledProviderId = 0;
let pendingOrderId = 0;
let alreadyShippedOrderId = 0;
let notConfiguredOrderId = 0;
let disabledCaseOrderId = 0;
let noProviderOrderId = 0;

async function seedOrder(
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  const [order] = await db
    .insert(ordersTable)
    .values({
      sessionId: `ship-${suffix}-${tag}`,
      status: "pending",
      paymentMethod: "cod",
      subtotal: "10.000",
      total: "11.500",
      deliveryAddress: "Amman, Jordan",
      customerName: "Ship Customer",
      customerPhone: "0791234567",
      ...overrides,
    })
    .returning();
  orderIds.push(order.id);
  return order.id;
}

beforeAll(async () => {
  const [enabled] = await db
    .insert(deliveryProvidersTable)
    .values({
      code: `ship-enabled-${tag}`,
      name: "Ship Provider",
      nameAr: "مزود الشحن",
      type: "manual",
      enabled: true,
      isDefault: false,
      contactPhone: "0791112222",
    })
    .returning();
  enabledProviderId = enabled.id;
  providerIds.push(enabled.id);

  const [disabled] = await db
    .insert(deliveryProvidersTable)
    .values({
      code: `ship-disabled-${tag}`,
      name: "Disabled Provider",
      nameAr: "مزود معطل",
      type: "manual",
      enabled: false,
      isDefault: false,
      contactPhone: "0793334444",
    })
    .returning();
  disabledProviderId = disabled.id;
  providerIds.push(disabled.id);

  pendingOrderId = await seedOrder("pending");
  alreadyShippedOrderId = await seedOrder("already", {
    status: "shipped",
    deliveryProviderId: enabled.id,
    deliveryTrackingNumber: "EXISTING-999",
    deliveryAwbUrl: "https://awb.example.com/EXISTING-999",
    deliveryStatus: "shipped",
  });
  notConfiguredOrderId = await seedOrder("notcfg");
  disabledCaseOrderId = await seedOrder("disabledcase");
  noProviderOrderId = await seedOrder("noprovider");
});

afterAll(async () => {
  if (orderIds.length)
    await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  if (providerIds.length)
    await db
      .delete(deliveryProvidersTable)
      .where(inArray(deliveryProvidersTable.id, providerIds));
});

describe("POST /api/delivery/orders/:orderId/shipment", () => {
  it("creates a shipment: persists the adapter's tracking details and flips status to shipped", async () => {
    mockCreate.mockClear();
    mockCreate.mockResolvedValueOnce({
      trackingNumber: "TRK-NEW-1",
      awbUrl: "https://awb.example.com/TRK-NEW-1",
      status: "shipped",
    });

    const before = new Date();
    const res = await asAdmin(
      request(app).post(`/api/delivery/orders/${pendingOrderId}/shipment`),
    ).send({ providerId: enabledProviderId });

    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe("TRK-NEW-1");
    expect(res.body.awbUrl).toBe("https://awb.example.com/TRK-NEW-1");
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // The order row must reflect the adapter result.
    const [row] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, pendingOrderId))
      .limit(1);
    expect(row.deliveryProviderId).toBe(enabledProviderId);
    expect(row.deliveryTrackingNumber).toBe("TRK-NEW-1");
    expect(row.deliveryAwbUrl).toBe("https://awb.example.com/TRK-NEW-1");
    expect(row.deliveryStatus).toBe("shipped");
    expect(row.status).toBe("shipped");
    expect(row.deliveryShippedAt).toBeTruthy();
    expect(
      new Date(row.deliveryShippedAt as Date).getTime(),
    ).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it("defaults status to 'shipped' when the adapter omits a status", async () => {
    mockCreate.mockClear();
    mockCreate.mockResolvedValueOnce({ trackingNumber: "TRK-NOSTATUS" });

    const orderId = await seedOrder("nostatus");
    const res = await asAdmin(
      request(app).post(`/api/delivery/orders/${orderId}/shipment`),
    ).send({ providerId: enabledProviderId });

    expect(res.status).toBe(200);
    const [row] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    expect(row.deliveryStatus).toBe("shipped");
    expect(row.deliveryTrackingNumber).toBe("TRK-NOSTATUS");
  });

  it("is idempotent: an already-shipped order returns the existing tracking without re-calling the adapter", async () => {
    mockCreate.mockClear();

    const res = await asAdmin(
      request(app).post(
        `/api/delivery/orders/${alreadyShippedOrderId}/shipment`,
      ),
    ).send({ providerId: enabledProviderId });

    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe("EXISTING-999");
    expect(res.body.awbUrl).toBe("https://awb.example.com/EXISTING-999");
    expect(res.body.alreadyShipped).toBe(true);
    // The adapter must not be invoked for an already-shipped order.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when no provider is available (unknown providerId, no default)", async () => {
    mockCreate.mockClear();

    const res = await asAdmin(
      request(app).post(`/api/delivery/orders/${noProviderOrderId}/shipment`),
    ).send({ providerId: 999999999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No delivery provider available/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the chosen provider is disabled", async () => {
    mockCreate.mockClear();

    const res = await asAdmin(
      request(app).post(`/api/delivery/orders/${disabledCaseOrderId}/shipment`),
    ).send({ providerId: disabledProviderId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/disabled/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maps DeliveryNotConfiguredError to 400 { notConfigured: true } and leaves the order untouched", async () => {
    mockCreate.mockClear();
    mockCreate.mockRejectedValueOnce(
      new DeliveryNotConfiguredError("مزود الشحن"),
    );

    const res = await asAdmin(
      request(app).post(
        `/api/delivery/orders/${notConfiguredOrderId}/shipment`,
      ),
    ).send({ providerId: enabledProviderId });

    expect(res.status).toBe(400);
    expect(res.body.notConfigured).toBe(true);
    expect(res.body.error).toBeTruthy();

    // No tracking should have been written on the failed attempt.
    const [row] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, notConfiguredOrderId))
      .limit(1);
    expect(row.deliveryTrackingNumber).toBeNull();
    expect(row.status).toBe("pending");
  });

  it("returns a controlled 500 (not off-contract data) when the adapter returns a malformed result", async () => {
    mockCreate.mockClear();
    logError.mockClear();
    // Adapter returns a malformed result: trackingNumber is missing/non-string.
    mockCreate.mockResolvedValueOnce({
      trackingNumber: 12345,
      awbUrl: "https://awb.example.com/bad",
    });

    const orderId = await seedOrder("malformed");
    const res = await asAdmin(
      request(app).post(`/api/delivery/orders/${orderId}/shipment`),
    ).send({ providerId: enabledProviderId });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    // The off-contract field must never leak to the client.
    expect(res.body.trackingNumber).toBeUndefined();
    expect(logError).toHaveBeenCalled();

    // The malformed result must NOT have been persisted to the order row.
    const [row] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    expect(row.deliveryTrackingNumber).toBeNull();
    expect(row.deliveryStatus).toBeNull();
    expect(row.status).toBe("pending");
  });

  it("rejects non-admin callers with 403", async () => {
    mockCreate.mockClear();
    const res = await request(app)
      .post(`/api/delivery/orders/${pendingOrderId}/shipment`)
      .send({ providerId: enabledProviderId });
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

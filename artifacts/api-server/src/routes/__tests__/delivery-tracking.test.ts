import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, deliveryProvidersTable, ordersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { DeliveryNotConfiguredError } from "../../delivery/types";

// Inject a fake delivery adapter so we control exactly what trackShipment
// returns (valid, malformed, or extra fields). listAdapterTypes is kept real.
const { mockTrack } = vi.hoisted(() => ({ mockTrack: vi.fn() }));
vi.mock("../../delivery/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../delivery/registry")>();
  return {
    ...actual,
    getAdapter: () => ({
      type: "manual",
      isConfigured: () => true,
      requiredCredentials: () => [],
      createShipment: vi.fn(),
      trackShipment: mockTrack,
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
const tag = Date.now();
const providerIds: number[] = [];
const orderIds: number[] = [];
let shippedOrderId = 0;
let unshippedOrderId = 0;

beforeAll(async () => {
  const [provider] = await db
    .insert(deliveryProvidersTable)
    .values({
      code: `track-${tag}`,
      name: "Track Provider",
      nameAr: "مزود التتبع",
      type: "manual",
      enabled: true,
      isDefault: false,
      contactPhone: "0791112222",
    })
    .returning();
  providerIds.push(provider.id);

  const [shipped] = await db
    .insert(ordersTable)
    .values({
      sessionId: `track-shipped-${tag}`,
      status: "shipped",
      paymentMethod: "cod",
      subtotal: "10.000",
      total: "11.500",
      deliveryAddress: "Amman, Jordan",
      customerName: "Track Customer",
      customerPhone: "0791234567",
      deliveryProviderId: provider.id,
      deliveryTrackingNumber: "TRK-123",
      deliveryAwbUrl: "https://awb.example.com/TRK-123",
      deliveryStatus: "shipped",
    })
    .returning();
  shippedOrderId = shipped.id;
  orderIds.push(shipped.id);

  const [unshipped] = await db
    .insert(ordersTable)
    .values({
      sessionId: `track-unshipped-${tag}`,
      status: "pending",
      paymentMethod: "cod",
      subtotal: "10.000",
      total: "11.500",
      deliveryAddress: "Amman, Jordan",
      customerName: "Track Customer 2",
      customerPhone: "0791234568",
    })
    .returning();
  unshippedOrderId = unshipped.id;
  orderIds.push(unshipped.id);
});

afterAll(async () => {
  if (orderIds.length)
    await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  if (providerIds.length)
    await db
      .delete(deliveryProvidersTable)
      .where(inArray(deliveryProvidersTable.id, providerIds));
});

describe("GET /api/delivery/orders/:orderId/track — contract serialization", () => {
  it("returns trackingNumber:null for an order that hasn't shipped yet", async () => {
    const res = await request(app).get(
      `/api/delivery/orders/${unshippedOrderId}/track`,
    );
    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBeNull();
    expect(typeof res.body.status).toBe("string");
  });

  it("maps a shipped order's delivery columns into the full OrderTracking shape", async () => {
    mockTrack.mockResolvedValueOnce({
      status: "in_transit",
      statusAr: "قيد التوصيل",
    });
    const res = await request(app).get(
      `/api/delivery/orders/${shippedOrderId}/track`,
    );
    expect(res.status).toBe(200);
    // Columns sourced from the order row.
    expect(res.body.trackingNumber).toBe("TRK-123");
    expect(res.body.awbUrl).toBe("https://awb.example.com/TRK-123");
    // Columns sourced from the provider row.
    expect(res.body.providerName).toBe("مزود التتبع");
    expect(res.body.providerPhone).toBe("0791112222");
    // Status fields sourced from the adapter.
    expect(res.body.status).toBe("in_transit");
    expect(res.body.statusAr).toBe("قيد التوصيل");
  });

  it("strips adapter-only fields (history/raw) not in the OrderTracking contract", async () => {
    mockTrack.mockResolvedValueOnce({
      status: "in_transit",
      statusAr: "قيد التوصيل",
      history: [{ at: "2026-05-30T10:00:00Z", label: "Picked up" }],
      raw: { providerInternal: "secret-ish" },
    });
    const res = await request(app).get(
      `/api/delivery/orders/${shippedOrderId}/track`,
    );
    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe("TRK-123");
    expect(res.body.status).toBe("in_transit");
    expect(res.body.statusAr).toBe("قيد التوصيل");
    expect(res.body.providerName).toBe("مزود التتبع");
    // Fields outside the contract must not leak to the client.
    expect(res.body).not.toHaveProperty("history");
    expect(res.body).not.toHaveProperty("raw");
  });

  it("returns a controlled 500 (no off-contract payload) when the adapter returns a malformed shape", async () => {
    logError.mockClear();
    mockTrack.mockResolvedValueOnce({
      // status must be a string per the contract; a number is malformed.
      status: 123,
    } as unknown as { status: string });
    const res = await request(app).get(
      `/api/delivery/orders/${shippedOrderId}/track`,
    );
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    // The divergent payload must NOT be sent through.
    expect(res.body).not.toHaveProperty("trackingNumber");
    expect(res.body.status).not.toBe(123);
    // The contract violation must be logged for observability.
    expect(logError).toHaveBeenCalled();
  });

  it("surfaces notConfigured:true (still on-contract) when the adapter is not configured", async () => {
    mockTrack.mockRejectedValueOnce(
      new DeliveryNotConfiguredError("مزود التتبع"),
    );
    const res = await request(app).get(
      `/api/delivery/orders/${shippedOrderId}/track`,
    );
    expect(res.status).toBe(200);
    expect(res.body.notConfigured).toBe(true);
    expect(res.body.trackingNumber).toBe("TRK-123");
    expect(res.body.providerName).toBe("مزود التتبع");
    expect(typeof res.body.status).toBe("string");
  });
});

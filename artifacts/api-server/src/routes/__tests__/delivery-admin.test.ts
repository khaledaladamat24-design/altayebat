import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, deliveryProvidersTable, ordersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import deliveryRouter from "../delivery";

// The delivery-provider endpoints gate access via isAdminReq. We authenticate
// with the admin-key secret path (x-admin-key === ADMIN_PASSWORD); no Clerk
// session involved.
const ADMIN_KEY = process.env.ADMIN_PASSWORD || "tayebat2024";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: unknown }).log = {
      error() {},
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

async function createProvider(overrides: Record<string, unknown> = {}) {
  const [p] = await db
    .insert(deliveryProvidersTable)
    .values({
      code: `test-${tag}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Test Provider",
      nameAr: "مزود اختبار",
      type: "manual",
      enabled: true,
      isDefault: true,
      credentials: { apiKey: "super-secret-token" },
      ...overrides,
    })
    .returning();
  providerIds.push(p.id);
  return p;
}

beforeAll(async () => {
  const [order] = await db
    .insert(ordersTable)
    .values({
      sessionId: `delivery-admin-${tag}`,
      status: "pending",
      paymentMethod: "cod",
      subtotal: "10.000",
      total: "11.500",
      deliveryAddress: "Amman, Jordan",
      customerName: "Test Customer",
      customerPhone: "0791234567",
    })
    .returning();
  orderIds.push(order.id);
});

afterAll(async () => {
  if (orderIds.length)
    await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  if (providerIds.length)
    await db
      .delete(deliveryProvidersTable)
      .where(inArray(deliveryProvidersTable.id, providerIds));
});

describe("GET /api/delivery/providers — admin authz", () => {
  it("rejects a caller with no admin header (403)", async () => {
    const res = await request(app).get("/api/delivery/providers");
    expect(res.status).toBe(403);
  });

  it("rejects a caller with a wrong admin key (403)", async () => {
    const res = await request(app)
      .get("/api/delivery/providers")
      .set("x-admin-key", "definitely-wrong-key");
    expect(res.status).toBe(403);
  });

  it("accepts the super-admin email and strips credentials", async () => {
    await createProvider();
    const res = await request(app)
      .get("/api/delivery/providers")
      .set("x-admin-key", ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const row of res.body) {
      expect(row).not.toHaveProperty("credentials");
      expect(row).toHaveProperty("hasCredentials");
    }
  });

  it("accepts the admin key", async () => {
    const res = await request(app)
      .get("/api/delivery/providers")
      .set("x-admin-key", ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /api/delivery/providers — admin authz", () => {
  it("rejects a caller with no admin header (403) and creates nothing", async () => {
    const code = `unauth-${tag}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await request(app)
      .post("/api/delivery/providers")
      .send({ code, name: "X", nameAr: "س", type: "manual" });
    expect(res.status).toBe(403);

    const rows = await db
      .select()
      .from(deliveryProvidersTable)
      .where(eq(deliveryProvidersTable.code, code));
    expect(rows.length).toBe(0);
  });

  it("rejects a caller with a wrong admin key (403)", async () => {
    const res = await request(app)
      .post("/api/delivery/providers")
      .set("x-admin-key", "definitely-wrong-key")
      .send({ code: `wrong-${tag}`, name: "X", nameAr: "س" });
    expect(res.status).toBe(403);
  });

  it("creates a provider with a valid admin key and strips credentials in the response", async () => {
    const code = `create-${tag}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await request(app)
      .post("/api/delivery/providers")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        code,
        name: "Created Provider",
        nameAr: "مزود منشأ",
        type: "manual",
        credentials: { apiKey: "another-secret" },
      });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("credentials");
    expect(res.body.hasCredentials).toBe(true);
    if (res.body.id) providerIds.push(res.body.id);
  });
});

describe("PATCH /api/delivery/providers/:id — admin authz", () => {
  it("rejects a caller with no admin header (403) and leaves the row untouched", async () => {
    const p = await createProvider({ name: "Before", isDefault: false });
    const res = await request(app)
      .patch(`/api/delivery/providers/${p.id}`)
      .send({ name: "After" });
    expect(res.status).toBe(403);

    const [after] = await db
      .select()
      .from(deliveryProvidersTable)
      .where(eq(deliveryProvidersTable.id, p.id))
      .limit(1);
    expect(after.name).toBe("Before");
  });

  it("rejects a caller with a wrong admin key (403)", async () => {
    const p = await createProvider({ isDefault: false });
    const res = await request(app)
      .patch(`/api/delivery/providers/${p.id}`)
      .set("x-admin-key", "definitely-wrong-key")
      .send({ name: "After" });
    expect(res.status).toBe(403);
  });

  it("updates with a valid super-admin email and strips credentials", async () => {
    const p = await createProvider({ isDefault: false });
    const res = await request(app)
      .patch(`/api/delivery/providers/${p.id}`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ name: "Updated Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Name");
    expect(res.body).not.toHaveProperty("credentials");
    expect(res.body).toHaveProperty("hasCredentials");
  });
});

describe("DELETE /api/delivery/providers/:id — admin authz", () => {
  it("rejects a caller with no admin header (403) and leaves the row intact", async () => {
    const p = await createProvider({ isDefault: false });
    const res = await request(app).delete(`/api/delivery/providers/${p.id}`);
    expect(res.status).toBe(403);

    const rows = await db
      .select()
      .from(deliveryProvidersTable)
      .where(eq(deliveryProvidersTable.id, p.id));
    expect(rows.length).toBe(1);
  });

  it("rejects a caller with a wrong admin key (403)", async () => {
    const p = await createProvider({ isDefault: false });
    const res = await request(app)
      .delete(`/api/delivery/providers/${p.id}`)
      .set("x-admin-key", "definitely-wrong-key");
    expect(res.status).toBe(403);
  });

  it("deletes with a valid admin key", async () => {
    const p = await createProvider({ isDefault: false });
    const res = await request(app)
      .delete(`/api/delivery/providers/${p.id}`)
      .set("x-admin-key", ADMIN_KEY);
    expect(res.status).toBe(204);

    const rows = await db
      .select()
      .from(deliveryProvidersTable)
      .where(eq(deliveryProvidersTable.id, p.id));
    expect(rows.length).toBe(0);
  });
});

describe("POST /api/delivery/orders/:orderId/shipment — admin authz", () => {
  it("rejects a caller with no admin header (403)", async () => {
    const res = await request(app)
      .post(`/api/delivery/orders/${orderIds[0]}/shipment`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects a caller with a wrong admin key (403)", async () => {
    const res = await request(app)
      .post(`/api/delivery/orders/${orderIds[0]}/shipment`)
      .set("x-admin-key", "definitely-wrong-key")
      .send({});
    expect(res.status).toBe(403);
  });

  it("creates a shipment with a valid admin header (default manual provider)", async () => {
    await createProvider({ type: "manual", enabled: true, isDefault: true });
    const res = await request(app)
      .post(`/api/delivery/orders/${orderIds[0]}/shipment`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBeTruthy();
  });
});

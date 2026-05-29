import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// Simulate Clerk: getAuth() reads the signed-in user id from a test header so
// each request can act as a specific vendor, an admin, or a signed-out caller.
vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({
    userId: (req.headers["x-test-clerk-id"] as string | undefined) ?? null,
  }),
}));

const { db, usersTable, vendorProfilesTable, ordersTable } =
  await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { requireVendorOwner, requireOrderVendorOwner } =
  await import("../../lib/vendor-auth");

const ADMIN_EMAIL = "khaledaladamat24@gmail.com";

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
  // Mount the real guards on representative routes with a trivial "allowed"
  // handler so a 200 means the guard called next().
  app.get("/api/vendors/:id/orders", requireVendorOwner(), (_req, res) => {
    res.json({ ok: true });
  });
  app.patch(
    "/api/orders/:id/status",
    requireOrderVendorOwner(),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  return app;
}

const app = makeApp();
const tag = Date.now();

let userAClerk: string;
let userBClerk: string;
let vendorAId: number;
let vendorBId: number;
let orderOwnedId: number;
let orderNullVendorId: number;
const userIds: number[] = [];
const vendorIds: number[] = [];
const orderIds: number[] = [];

beforeAll(async () => {
  userAClerk = `clerk-A-${tag}`;
  userBClerk = `clerk-B-${tag}`;

  const [userA] = await db
    .insert(usersTable)
    .values({ clerkId: userAClerk })
    .returning();
  const [userB] = await db
    .insert(usersTable)
    .values({ clerkId: userBClerk })
    .returning();
  userIds.push(userA.id, userB.id);

  const [vendorA] = await db
    .insert(vendorProfilesTable)
    .values({
      userId: userA.id,
      storeName: "Store A",
      category: "test",
      phone: "0790000001",
      status: "approved",
      isOnline: true,
    })
    .returning();
  const [vendorB] = await db
    .insert(vendorProfilesTable)
    .values({
      userId: userB.id,
      storeName: "Store B",
      category: "test",
      phone: "0790000002",
      status: "approved",
      isOnline: true,
    })
    .returning();
  vendorAId = vendorA.id;
  vendorBId = vendorB.id;
  vendorIds.push(vendorA.id, vendorB.id);

  const [orderOwned] = await db
    .insert(ordersTable)
    .values({
      sessionId: `auth-owned-${tag}`,
      status: "pending",
      vendorId: vendorAId,
      subtotal: "10.000",
      deliveryFee: "1.500",
      total: "11.500",
      deliveryAddress: "Addr",
    })
    .returning();
  const [orderNull] = await db
    .insert(ordersTable)
    .values({
      sessionId: `auth-null-${tag}`,
      status: "pending",
      vendorId: null,
      subtotal: "10.000",
      deliveryFee: "1.500",
      total: "11.500",
      deliveryAddress: "Addr",
    })
    .returning();
  orderOwnedId = orderOwned.id;
  orderNullVendorId = orderNull.id;
  orderIds.push(orderOwned.id, orderNull.id);
});

afterAll(async () => {
  try {
    if (orderIds.length)
      await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  } finally {
    try {
      if (vendorIds.length)
        await db
          .delete(vendorProfilesTable)
          .where(inArray(vendorProfilesTable.id, vendorIds));
    } finally {
      if (userIds.length)
        await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    }
  }
});

describe("requireVendorOwner — GET /api/vendors/:id/orders", () => {
  it("allows the owning vendor", async () => {
    const res = await request(app)
      .get(`/api/vendors/${vendorAId}/orders`)
      .set("x-test-clerk-id", userAClerk);
    expect(res.status).toBe(200);
  });

  it("forbids a different vendor (403)", async () => {
    const res = await request(app)
      .get(`/api/vendors/${vendorAId}/orders`)
      .set("x-test-clerk-id", userBClerk);
    expect(res.status).toBe(403);
  });

  it("rejects a signed-out caller (401)", async () => {
    const res = await request(app).get(`/api/vendors/${vendorAId}/orders`);
    expect(res.status).toBe(401);
  });

  it("lets the super-admin email bypass ownership", async () => {
    const res = await request(app)
      .get(`/api/vendors/${vendorAId}/orders`)
      .set("x-admin-email", ADMIN_EMAIL);
    expect(res.status).toBe(200);
  });

  it("lets the admin key bypass ownership", async () => {
    const res = await request(app)
      .get(`/api/vendors/${vendorAId}/orders`)
      .set("x-admin-key", process.env.ADMIN_PASSWORD || "tayebat2024");
    expect(res.status).toBe(200);
  });

  it("returns 404 for a non-existent vendor", async () => {
    const res = await request(app)
      .get(`/api/vendors/999999999/orders`)
      .set("x-test-clerk-id", userAClerk);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric vendor id", async () => {
    const res = await request(app)
      .get(`/api/vendors/not-a-number/orders`)
      .set("x-test-clerk-id", userAClerk);
    expect(res.status).toBe(400);
  });
});

describe("requireOrderVendorOwner — PATCH /api/orders/:id/status", () => {
  it("allows the vendor that owns the order", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderOwnedId}/status`)
      .set("x-test-clerk-id", userAClerk)
      .send({});
    expect(res.status).toBe(200);
  });

  it("forbids a different vendor (403)", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderOwnedId}/status`)
      .set("x-test-clerk-id", userBClerk)
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects a signed-out caller (401)", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderOwnedId}/status`)
      .send({});
    expect(res.status).toBe(401);
  });

  it("lets the super-admin email bypass ownership", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderOwnedId}/status`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({});
    expect(res.status).toBe(200);
  });

  it("treats a NULL-vendor order as admin-only — forbids vendors (403)", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderNullVendorId}/status`)
      .set("x-test-clerk-id", userAClerk)
      .send({});
    expect(res.status).toBe(403);
  });

  it("lets an admin act on a NULL-vendor order", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderNullVendorId}/status`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({});
    expect(res.status).toBe(200);
  });

  it("returns 404 for a non-existent order", async () => {
    const res = await request(app)
      .patch(`/api/orders/999999999/status`)
      .set("x-test-clerk-id", userAClerk)
      .send({});
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric order id", async () => {
    const res = await request(app)
      .patch(`/api/orders/not-a-number/status`)
      .set("x-test-clerk-id", userAClerk)
      .send({});
    expect(res.status).toBe(400);
  });
});

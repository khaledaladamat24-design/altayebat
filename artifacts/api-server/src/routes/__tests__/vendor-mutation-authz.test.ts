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

const { db, usersTable, vendorProfilesTable } = await import("@workspace/db");
const { inArray } = await import("drizzle-orm");
const vendorsRouter = (await import("../vendors")).default;

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
  app.use("/api", vendorsRouter);
  return app;
}

const app = makeApp();
const tag = Date.now();

let userAClerk: string;
let userBClerk: string;
let vendorAId: number;
const userIds: number[] = [];
const vendorIds: number[] = [];

beforeAll(async () => {
  userAClerk = `clerk-mut-A-${tag}`;
  userBClerk = `clerk-mut-B-${tag}`;

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
      storeName: "Mut Store A",
      category: "test",
      phone: "0790000011",
      status: "approved",
      isOnline: true,
    })
    .returning();
  vendorAId = vendorA.id;
  vendorIds.push(vendorA.id);
});

afterAll(async () => {
  try {
    if (vendorIds.length)
      await db
        .delete(vendorProfilesTable)
        .where(inArray(vendorProfilesTable.id, vendorIds));
  } finally {
    if (userIds.length)
      await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});

// These assert the guard rejects BEFORE the handler runs (no DB mutation),
// so a non-owner/non-admin/signed-out caller can never mutate another vendor.
describe("vendor mutation endpoints reject unauthorized callers", () => {
  it("POST /vendors/:id/products — 403 for a different vendor", async () => {
    const res = await request(app)
      .post(`/api/vendors/${vendorAId}/products`)
      .set("x-test-clerk-id", userBClerk)
      .send({ nameAr: "x", name: "x", price: 1, categoryId: 1 });
    expect(res.status).toBe(403);
  });

  it("POST /vendors/:id/products — 401 when signed out", async () => {
    const res = await request(app)
      .post(`/api/vendors/${vendorAId}/products`)
      .send({ nameAr: "x", name: "x", price: 1, categoryId: 1 });
    expect(res.status).toBe(401);
  });

  it("PATCH /vendors/:vendorId/products/:productId — 403 for a different vendor", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorAId}/products/123`)
      .set("x-test-clerk-id", userBClerk)
      .send({ price: 9 });
    expect(res.status).toBe(403);
  });

  it("DELETE /vendors/:vendorId/products/:productId — 403 for a different vendor", async () => {
    const res = await request(app)
      .delete(`/api/vendors/${vendorAId}/products/123`)
      .set("x-test-clerk-id", userBClerk);
    expect(res.status).toBe(403);
  });

  it("DELETE /vendors/:id — 403 for a different vendor", async () => {
    const res = await request(app)
      .delete(`/api/vendors/${vendorAId}`)
      .set("x-test-clerk-id", userBClerk);
    expect(res.status).toBe(403);
  });

  it("DELETE /vendors/:id — 401 when signed out", async () => {
    const res = await request(app).delete(`/api/vendors/${vendorAId}`);
    expect(res.status).toBe(401);
  });

  it("PATCH /vendors/:id/status — 403 for a non-admin (even the owner)", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorAId}/status`)
      .set("x-test-clerk-id", userAClerk)
      .send({ status: "approved" });
    expect(res.status).toBe(403);
  });

  it("PATCH /vendors/:id/status — allows the super-admin", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorAId}/status`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({ status: "approved" });
    expect(res.status).toBe(200);
  });
});

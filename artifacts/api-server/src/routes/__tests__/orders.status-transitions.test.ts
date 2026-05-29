import { describe, it, expect, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, ordersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import ordersRouter from "../orders";

// The PATCH /orders/:id/status route is gated by requireOrderVendorOwner, which
// lets a super-admin email bypass ownership checks. We send that header so the
// tests exercise the transition logic itself, not the auth layer.
const ADMIN_HEADER = { "x-admin-email": "khaledaladamat24@gmail.com" };

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
  app.use("/api", ordersRouter);
  return app;
}

const app = makeApp();
const createdOrderIds: number[] = [];

async function makeOrder(status: string): Promise<number> {
  const [row] = await db
    .insert(ordersTable)
    .values({
      sessionId: `test-status-${Date.now()}-${Math.random()}`,
      status,
      subtotal: "10.000",
      deliveryFee: "1.500",
      total: "11.500",
      deliveryAddress: "Test Address",
    })
    .returning();
  createdOrderIds.push(row.id);
  return row.id;
}

async function statusOf(id: number): Promise<string> {
  const [row] = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);
  return row.status;
}

afterAll(async () => {
  if (createdOrderIds.length)
    await db
      .delete(ordersTable)
      .where(inArray(ordersTable.id, createdOrderIds));
});

describe("PATCH /api/orders/:id/status — valid transitions", () => {
  const cases: Array<[string, string]> = [
    ["pending", "preparing"],
    ["preparing", "ready"],
    ["ready", "out_for_delivery"],
    ["out_for_delivery", "delivered"],
    ["pending", "cancelled"],
    ["preparing", "cancelled"],
  ];

  for (const [from, to] of cases) {
    it(`allows ${from} → ${to}`, async () => {
      const id = await makeOrder(from);
      const res = await request(app)
        .patch(`/api/orders/${id}/status`)
        .set(ADMIN_HEADER)
        .send({ status: to });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(to);
      expect(await statusOf(id)).toBe(to);
    });
  }
});

describe("PATCH /api/orders/:id/status — invalid / stale transitions", () => {
  it("returns 409 for a stale accept on a delivered order and leaves it delivered", async () => {
    const id = await makeOrder("delivered");
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(ADMIN_HEADER)
      .send({ status: "preparing" });
    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe("delivered");
  });

  it("returns 409 when skipping states (pending → ready) and leaves it pending", async () => {
    const id = await makeOrder("pending");
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(ADMIN_HEADER)
      .send({ status: "ready" });
    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe("pending");
  });

  it("returns 409 when cancelling an already out_for_delivery order", async () => {
    const id = await makeOrder("out_for_delivery");
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(ADMIN_HEADER)
      .send({ status: "cancelled" });
    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe("out_for_delivery");
  });

  it("returns 400 for an unknown status value and leaves the order unchanged", async () => {
    const id = await makeOrder("pending");
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(ADMIN_HEADER)
      .send({ status: "bogus" });
    expect(res.status).toBe(400);
    expect(await statusOf(id)).toBe("pending");
  });

  it("returns 400 for a missing status value", async () => {
    const id = await makeOrder("pending");
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(ADMIN_HEADER)
      .send({});
    expect(res.status).toBe(400);
    expect(await statusOf(id)).toBe("pending");
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app)
      .patch(`/api/orders/not-a-number/status`)
      .set(ADMIN_HEADER)
      .send({ status: "preparing" });
    expect(res.status).toBe(400);
  });
});

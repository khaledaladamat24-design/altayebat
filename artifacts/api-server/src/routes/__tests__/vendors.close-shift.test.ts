import { describe, it, expect, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, ordersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import vendorsRouter from "../vendors";

// POST /vendors/:id/orders/close-shift is gated by requireVendorOwner, which
// lets a super-admin email bypass ownership. We send that header so the test
// exercises the bulk-cancel logic itself, not the auth layer.
const ADMIN_HEADER = { "x-admin-email": "khaledaladamat24@gmail.com" };

// A vendor id unlikely to collide with seeded data; the admin bypass means the
// vendor row need not exist for the bulk update to run against its orders.
const TEST_VENDOR_ID = 990001;

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
const createdOrderIds: number[] = [];

async function makeOrder(status: string): Promise<number> {
  const [row] = await db
    .insert(ordersTable)
    .values({
      sessionId: `close-shift-${Date.now()}-${Math.random()}`,
      vendorId: TEST_VENDOR_ID,
      status,
      fulfillmentType: "delivery",
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

describe("POST /api/vendors/:id/orders/close-shift", () => {
  it("cancels every active order and leaves final ones untouched", async () => {
    const pending = await makeOrder("pending");
    const confirmed = await makeOrder("confirmed");
    const preparing = await makeOrder("preparing");
    const ready = await makeOrder("ready");
    const outForDelivery = await makeOrder("out_for_delivery");
    const delivered = await makeOrder("delivered");
    const alreadyCancelled = await makeOrder("cancelled");

    const res = await request(app)
      .post(`/api/vendors/${TEST_VENDOR_ID}/orders/close-shift`)
      .set(ADMIN_HEADER)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(5);

    expect(await statusOf(pending)).toBe("cancelled");
    expect(await statusOf(confirmed)).toBe("cancelled");
    expect(await statusOf(preparing)).toBe("cancelled");
    expect(await statusOf(ready)).toBe("cancelled");
    expect(await statusOf(outForDelivery)).toBe("cancelled");
    // Final states are never reopened or recategorized.
    expect(await statusOf(delivered)).toBe("delivered");
    expect(await statusOf(alreadyCancelled)).toBe("cancelled");
  });

  it("returns 0 when there are no active orders to clear", async () => {
    const res = await request(app)
      .post(`/api/vendors/${TEST_VENDOR_ID}/orders/close-shift`)
      .set(ADMIN_HEADER)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(0);
  });
});

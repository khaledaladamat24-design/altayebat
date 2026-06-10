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

// POST /orders/:id/received is the customer-driven delivery confirmation. It is
// public (no vendor/admin auth) but proves ownership by matching the order's
// sessionId — the same session that placed the order.

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

async function makeOrder(
  status: string,
  sessionId: string,
  fulfillmentType: "delivery" | "pickup" = "delivery",
): Promise<number> {
  const [row] = await db
    .insert(ordersTable)
    .values({
      sessionId,
      status,
      fulfillmentType,
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

describe("POST /api/orders/:id/received — customer confirmation", () => {
  it("confirms an out_for_delivery order owned by the session → delivered", async () => {
    const sid = `recv-${Date.now()}-${Math.random()}`;
    const id = await makeOrder("out_for_delivery", sid);
    const res = await request(app)
      .post(`/api/orders/${id}/received`)
      .send({ sessionId: sid });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("delivered");
    expect(await statusOf(id)).toBe("delivered");
  });

  it("confirms a ready pickup order owned by the session → delivered", async () => {
    const sid = `recv-${Date.now()}-${Math.random()}`;
    const id = await makeOrder("ready", sid, "pickup");
    const res = await request(app)
      .post(`/api/orders/${id}/received`)
      .send({ sessionId: sid });
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe("delivered");
  });

  it("rejects confirmation from a different session (409, unchanged)", async () => {
    const sid = `recv-${Date.now()}-${Math.random()}`;
    const id = await makeOrder("out_for_delivery", sid);
    const res = await request(app)
      .post(`/api/orders/${id}/received`)
      .send({ sessionId: "someone-else" });
    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe("out_for_delivery");
  });

  it("rejects confirmation when the order isn't out yet (pending, 409)", async () => {
    const sid = `recv-${Date.now()}-${Math.random()}`;
    const id = await makeOrder("pending", sid);
    const res = await request(app)
      .post(`/api/orders/${id}/received`)
      .send({ sessionId: sid });
    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe("pending");
  });

  it("rejects a ready delivery order (must pass through out_for_delivery first)", async () => {
    const sid = `recv-${Date.now()}-${Math.random()}`;
    const id = await makeOrder("ready", sid, "delivery");
    const res = await request(app)
      .post(`/api/orders/${id}/received`)
      .send({ sessionId: sid });
    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe("ready");
  });

  it("requires a sessionId (400)", async () => {
    const sid = `recv-${Date.now()}-${Math.random()}`;
    const id = await makeOrder("out_for_delivery", sid);
    const res = await request(app).post(`/api/orders/${id}/received`).send({});
    expect(res.status).toBe(400);
  });
});

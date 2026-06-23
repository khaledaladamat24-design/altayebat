import { describe, it, expect, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, ordersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import adminRouter from "../admin";
import { getAdminPassword } from "../../lib/admin-auth";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: unknown }).log = {
      error() {},
      info() {},
      warn() {},
    };
    req.headers["x-admin-key"] = getAdminPassword();
    next();
  });
  app.use("/api", adminRouter);
  return app;
}

const app = makeApp();
const createdOrderIds: number[] = [];

async function makeOrder(status: string): Promise<number> {
  const [row] = await db
    .insert(ordersTable)
    .values({
      sessionId: `test-admin-status-${Date.now()}-${Math.random()}`,
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

describe("PATCH /api/admin/orders/:id — status allowlist", () => {
  it("rejects an off-contract status and leaves the order unchanged", async () => {
    const id = await makeOrder("awaiting_admin");
    const res = await request(app)
      .patch(`/api/admin/orders/${id}`)
      .send({ status: "processing" });
    expect(res.status).toBe(400);
    expect(await statusOf(id)).toBe("awaiting_admin");
  });

  it("accepts a valid contract status", async () => {
    const id = await makeOrder("awaiting_admin");
    const res = await request(app)
      .patch(`/api/admin/orders/${id}`)
      .send({ status: "preparing" });
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe("preparing");
  });
});

import { describe, it, expect, afterAll } from "vitest";
import { db, ordersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { runOnce } from "../../lib/order-expiry";

const createdOrderIds: number[] = [];
const OLD = new Date(Date.now() - 25 * 60_000); // 25 min ago — past the 20m cutoff
const RECENT = new Date(Date.now() - 5 * 60_000); // 5 min ago — within window

async function makeOrder(opts: {
  status: string;
  paymentMethod: string;
  createdAt: Date;
}): Promise<number> {
  const [row] = await db
    .insert(ordersTable)
    .values({
      sessionId: `test-expiry-${Date.now()}-${Math.random()}`,
      status: opts.status,
      paymentMethod: opts.paymentMethod,
      fulfillmentType: "delivery",
      subtotal: "10.000",
      deliveryFee: "1.500",
      total: "11.500",
      deliveryAddress: "Test Address",
      createdAt: opts.createdAt,
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

describe("order expiry sweep (runOnce)", () => {
  it("auto-cancels a stale pending COD order", async () => {
    const id = await makeOrder({
      status: "pending",
      paymentMethod: "cod",
      createdAt: OLD,
    });
    await runOnce();
    expect(await statusOf(id)).toBe("cancelled");
  });

  it("flags a stale pending prepaid order as awaiting_admin (not cancelled)", async () => {
    for (const method of ["cliq", "iban", "ewallet"]) {
      const id = await makeOrder({
        status: "pending",
        paymentMethod: method,
        createdAt: OLD,
      });
      await runOnce();
      expect(await statusOf(id)).toBe("awaiting_admin");
    }
  });

  it("leaves a recent pending order untouched", async () => {
    const cod = await makeOrder({
      status: "pending",
      paymentMethod: "cod",
      createdAt: RECENT,
    });
    const cliq = await makeOrder({
      status: "pending",
      paymentMethod: "cliq",
      createdAt: RECENT,
    });
    await runOnce();
    expect(await statusOf(cod)).toBe("pending");
    expect(await statusOf(cliq)).toBe("pending");
  });

  it("never touches an already-accepted order, even if old", async () => {
    const id = await makeOrder({
      status: "preparing",
      paymentMethod: "cod",
      createdAt: OLD,
    });
    await runOnce();
    expect(await statusOf(id)).toBe("preparing");
  });
});

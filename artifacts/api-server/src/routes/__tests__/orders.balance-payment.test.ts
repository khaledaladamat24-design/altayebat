import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// Simulate Clerk: getAuth() reads the signed-in user id from a test header so
// each request can act as a specific user or a signed-out caller.
vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({
    userId: (req.headers["x-test-clerk-id"] as string | undefined) ?? null,
  }),
}));

const {
  db,
  usersTable,
  productsTable,
  cartItemsTable,
  ordersTable,
  orderItemsTable,
  walletsTable,
  walletTransactionsTable,
  categoriesTable,
} = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const ordersRouter = (await import("../orders")).default;

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
const tag = Date.now();
const clerkId = `clerk_bal_${tag}`;
let userId: number;
let categoryId: number;
let productId: number;
const sessionId = `sess_bal_${tag}`;

async function setBalance(balance: string) {
  await db
    .insert(walletsTable)
    .values({ userId, balance })
    .onConflictDoUpdate({ target: walletsTable.userId, set: { balance } });
}

async function balanceOf(): Promise<number> {
  const [row] = await db
    .select({ balance: walletsTable.balance })
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .limit(1);
  return Number(row.balance);
}

async function seedCart() {
  // 2 units @ 12.5 = 25 subtotal → free delivery (>= 20) → total 25
  await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));
  await db.insert(cartItemsTable).values({
    sessionId,
    productId,
    quantity: 2,
    unitPrice: "12.500",
  });
}

async function clearOrders() {
  const orders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.sessionId, sessionId));
  for (const o of orders) {
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, o.id));
  }
  await db.delete(ordersTable).where(eq(ordersTable.sessionId, sessionId));
  await db
    .delete(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, userId));
}

beforeEach(async () => {
  if (userId) await clearOrders();
});

beforeAll(async () => {
  const [u] = await db
    .insert(usersTable)
    .values({ clerkId, name: "Balance Tester" })
    .returning();
  userId = u.id;

  const [c] = await db
    .insert(categoriesTable)
    .values({
      name: "BalTest",
      nameAr: "اختبار",
      slug: `baltest-${tag}`,
      icon: "x",
    })
    .returning();
  categoryId = c.id;

  const [p] = await db
    .insert(productsTable)
    .values({
      name: "Bal Product",
      nameAr: "منتج",
      price: "12.500",
      categoryId,
    })
    .returning();
  productId = p.id;
});

afterAll(async () => {
  // Clean up any orders + items created for this session.
  const orders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.sessionId, sessionId));
  for (const o of orders) {
    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, o.id));
  }
  await db.delete(ordersTable).where(eq(ordersTable.sessionId, sessionId));
  await db.delete(cartItemsTable).where(eq(cartItemsTable.sessionId, sessionId));
  await db
    .delete(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, userId));
  await db.delete(walletsTable).where(eq(walletsTable.userId, userId));
  await db.delete(productsTable).where(eq(productsTable.id, productId));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("POST /api/orders — wallet balance payment", () => {
  it("charges the wallet atomically when creating a balance order", async () => {
    await setBalance("50.000");
    await seedCart();

    const res = await request(app)
      .post("/api/orders")
      .set("x-test-clerk-id", clerkId)
      .send({
        sessionId,
        paymentMethod: "balance",
        deliveryAddress: "Amman, Test St, Building 1",
        customerName: "Tester",
        customerPhone: "0791234567",
      });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(25);
    // Balance deducted exactly once: 50 - 25 = 25.
    expect(await balanceOf()).toBeCloseTo(25, 3);

    const txns = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.orderId, res.body.id));
    expect(txns).toHaveLength(1);
    expect(txns[0].type).toBe("payment");
    expect(txns[0].status).toBe("approved");

    // Cart was cleared as part of the same transaction.
    const remaining = await db
      .select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.sessionId, sessionId));
    expect(remaining).toHaveLength(0);
  });

  it("rejects (no order, no charge) when balance is insufficient", async () => {
    await setBalance("10.000");
    await seedCart();

    const res = await request(app)
      .post("/api/orders")
      .set("x-test-clerk-id", clerkId)
      .send({
        sessionId,
        paymentMethod: "balance",
        deliveryAddress: "Amman, Test St, Building 1",
        customerName: "Tester",
        customerPhone: "0791234567",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("الرصيد غير كافٍ");
    // Balance untouched.
    expect(await balanceOf()).toBeCloseTo(10, 3);

    // No order row was created (transaction rolled back).
    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.sessionId, sessionId));
    expect(orders).toHaveLength(0);

    // Cart preserved so the user can retry / top up.
    const remaining = await db
      .select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.sessionId, sessionId));
    expect(remaining).toHaveLength(1);
  });

  it("rejects with 401 when no signed-in user for a balance order", async () => {
    await setBalance("50.000");
    await seedCart();

    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "balance",
      deliveryAddress: "Amman, Test St, Building 1",
      customerName: "Tester",
      customerPhone: "0791234567",
    });

    expect(res.status).toBe(401);
    // Nothing charged.
    expect(await balanceOf()).toBeCloseTo(50, 3);
    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.sessionId, sessionId));
    expect(orders).toHaveLength(0);
  });
});

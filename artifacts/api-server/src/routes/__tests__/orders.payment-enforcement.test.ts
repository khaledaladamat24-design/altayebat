import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import {
  db,
  usersTable,
  productsTable,
  cartItemsTable,
  ordersTable,
  orderItemsTable,
  categoriesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import ordersRouter from "../orders";

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
const registeredPhone = "0795551111";
let userId: number;
let categoryId: number;
let productId: number;
const sessionId = `sess_pay_${tag}`;

async function seedCart() {
  await db
    .delete(cartItemsTable)
    .where(eq(cartItemsTable.sessionId, sessionId));
  await db.insert(cartItemsTable).values({
    sessionId,
    productId,
    quantity: 1,
    unitPrice: "5.000",
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
}

beforeEach(async () => {
  await clearOrders();
  await seedCart();
});

beforeAll(async () => {
  const [u] = await db
    .insert(usersTable)
    .values({ name: "Pay Tester", phone: registeredPhone })
    .returning();
  userId = u.id;

  const [c] = await db
    .insert(categoriesTable)
    .values({
      name: "PayTest",
      nameAr: "دفع",
      slug: `paytest-${tag}`,
      icon: "x",
    })
    .returning();
  categoryId = c.id;

  const [p] = await db
    .insert(productsTable)
    .values({
      name: "Pay Product",
      nameAr: "منتج",
      price: "5.000",
      categoryId,
    })
    .returning();
  productId = p.id;
});

afterAll(async () => {
  await clearOrders();
  await db
    .delete(cartItemsTable)
    .where(eq(cartItemsTable.sessionId, sessionId));
  await db.delete(productsTable).where(eq(productsTable.id, productId));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("POST /api/orders — payment-method + receipt enforcement", () => {
  it("rejects (400) an unknown payment method", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "balance",
      deliveryAddress: "Amman, Test St",
      customerName: "Tester",
      customerPhone: registeredPhone,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PAYMENT_METHOD");
  });

  it("rejects (400) a manual-transfer order without a receipt", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "cliq",
      deliveryAddress: "Amman, Test St",
      customerName: "Tester",
      customerPhone: registeredPhone,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RECEIPT_REQUIRED");

    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.sessionId, sessionId));
    expect(orders).toHaveLength(0);
  });

  it("creates an IBAN order with a receipt and marks payment pending", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "iban",
      paymentScreenshotUrl: "data:image/png;base64,AAAA",
      deliveryAddress: "Amman, Test St",
      customerName: "Tester",
      customerPhone: registeredPhone,
    });
    expect(res.status).toBe(201);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.sessionId, sessionId));
    expect(order.paymentMethod).toBe("iban");
    expect(order.paymentStatus).toBe("pending");
  });

  it("creates a COD order with paymentStatus cod and no receipt", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "cod",
      deliveryAddress: "Amman, Test St",
      customerName: "Tester",
      customerPhone: registeredPhone,
    });
    expect(res.status).toBe(201);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.sessionId, sessionId));
    expect(order.paymentMethod).toBe("cod");
    expect(order.paymentStatus).toBe("cod");
  });
});

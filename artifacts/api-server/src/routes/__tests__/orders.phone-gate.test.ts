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
// A registered Jordanian mobile (canonical 07XXXXXXXX form).
const registeredPhone = "0795550000";
let userId: number;
let categoryId: number;
let productId: number;
const sessionId = `sess_gate_${tag}`;

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
    .values({ name: "Gate Tester", phone: registeredPhone })
    .returning();
  userId = u.id;

  const [c] = await db
    .insert(categoriesTable)
    .values({
      name: "GateTest",
      nameAr: "بوابة",
      slug: `gatetest-${tag}`,
      icon: "x",
    })
    .returning();
  categoryId = c.id;

  const [p] = await db
    .insert(productsTable)
    .values({
      name: "Gate Product",
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

describe("POST /api/orders — registered-phone anti-fraud gate", () => {
  it("creates a COD order when the phone is already registered", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "cod",
      deliveryAddress: "Amman, Test St",
      customerName: "Tester",
      customerPhone: registeredPhone,
    });
    expect(res.status).toBe(201);
  });

  it("accepts a non-canonical variant of a registered phone (+962…)", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "cod",
      deliveryAddress: "Amman, Test St",
      customerName: "Tester",
      customerPhone: "+962795550000",
    });
    expect(res.status).toBe(201);
  });

  it("accepts the 00962… variant of a registered phone", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "cod",
      deliveryAddress: "Amman, Test St",
      customerName: "Tester",
      customerPhone: "00962795550000",
    });
    expect(res.status).toBe(201);
  });

  it("rejects (403) a COD order from an unregistered phone — no order created", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "cod",
      deliveryAddress: "Amman, Test St",
      customerName: "Ghost",
      customerPhone: "0799990001",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PHONE_NOT_REGISTERED");

    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.sessionId, sessionId));
    expect(orders).toHaveLength(0);
  });

  it("rejects (400) an invalid phone number", async () => {
    const res = await request(app).post("/api/orders").send({
      sessionId,
      paymentMethod: "cod",
      deliveryAddress: "Amman, Test St",
      customerName: "Tester",
      customerPhone: "12345",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PHONE");
  });
});

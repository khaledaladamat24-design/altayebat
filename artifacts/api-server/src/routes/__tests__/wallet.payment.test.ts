import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, walletsTable, walletTransactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import walletRouter from "../wallet";

// POST /wallet/:userId/pay is gated by requireWalletOwner, which lets a
// super-admin email bypass the Clerk ownership check. We send that header so
// the tests exercise the deduction/idempotency logic itself, not the auth layer.
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
  app.use("/api", walletRouter);
  return app;
}

const app = makeApp();
// A user id unlikely to collide with real data (wallets.user_id is UNIQUE).
const userId = 900_000_000 + Math.floor(Math.random() * 90_000_000);

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

beforeEach(async () => {
  // Reset to a known balance and clear any payment txns from a prior test.
  await db
    .delete(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, userId));
  await setBalance("50.000");
});

afterAll(async () => {
  await db
    .delete(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, userId));
  await db.delete(walletsTable).where(eq(walletsTable.userId, userId));
});

describe("POST /api/wallet/:userId/pay — deduction", () => {
  it("deducts exactly the order total once on a successful payment", async () => {
    const orderId = Math.floor(Math.random() * 1_000_000_000);
    const res = await request(app)
      .post(`/api/wallet/${userId}/pay`)
      .set(ADMIN_HEADER)
      .send({ amount: 11.5, orderId });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("payment");
    expect(res.body.status).toBe("approved");
    expect(res.body.amount).toBe(11.5);
    expect(res.body.idempotent).toBeUndefined();
    expect(await balanceOf()).toBeCloseTo(38.5, 3);

    // Exactly one approved payment txn recorded for this orderId.
    const txns = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.orderId, orderId));
    expect(txns).toHaveLength(1);
  });
});

describe("POST /api/wallet/:userId/pay — idempotency", () => {
  it("does NOT deduct twice when the same orderId is submitted again", async () => {
    const orderId = Math.floor(Math.random() * 1_000_000_000);

    const first = await request(app)
      .post(`/api/wallet/${userId}/pay`)
      .set(ADMIN_HEADER)
      .send({ amount: 11.5, orderId });
    expect(first.status).toBe(200);
    expect(await balanceOf()).toBeCloseTo(38.5, 3);

    const second = await request(app)
      .post(`/api/wallet/${userId}/pay`)
      .set(ADMIN_HEADER)
      .send({ amount: 11.5, orderId });
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    // Balance unchanged — no double-charge.
    expect(await balanceOf()).toBeCloseTo(38.5, 3);

    // Still only one approved payment txn for this orderId.
    const txns = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.orderId, orderId));
    expect(txns).toHaveLength(1);
  });

  it("does not deduct twice even under concurrent submits of the same orderId", async () => {
    const orderId = Math.floor(Math.random() * 1_000_000_000);

    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/wallet/${userId}/pay`)
        .set(ADMIN_HEADER)
        .send({ amount: 11.5, orderId }),
      request(app)
        .post(`/api/wallet/${userId}/pay`)
        .set(ADMIN_HEADER)
        .send({ amount: 11.5, orderId }),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // At most one deduction of 11.5 from the starting 50 → never below 38.5.
    expect(await balanceOf()).toBeGreaterThanOrEqual(38.5 - 1e-6);
  });
});

describe("POST /api/wallet/:userId/pay — insufficient balance", () => {
  it("rejects with 400 and leaves balance untouched when balance < total", async () => {
    const orderId = Math.floor(Math.random() * 1_000_000_000);
    const res = await request(app)
      .post(`/api/wallet/${userId}/pay`)
      .set(ADMIN_HEADER)
      .send({ amount: 100, orderId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("الرصيد غير كافٍ");
    // No deduction → balance unchanged, never negative.
    expect(await balanceOf()).toBeCloseTo(50, 3);

    const txns = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.orderId, orderId));
    expect(txns).toHaveLength(0);
  });

  it("rejects a payment for the exact-over-balance amount", async () => {
    const orderId = Math.floor(Math.random() * 1_000_000_000);
    const res = await request(app)
      .post(`/api/wallet/${userId}/pay`)
      .set(ADMIN_HEADER)
      .send({ amount: 50.001, orderId });

    expect(res.status).toBe(400);
    expect(await balanceOf()).toBeCloseTo(50, 3);
  });
});

describe("POST /api/wallet/:userId/pay — input validation", () => {
  it("rejects a missing/invalid amount", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userId}/pay`)
      .set(ADMIN_HEADER)
      .send({ orderId: 123 });
    expect(res.status).toBe(400);
    expect(await balanceOf()).toBeCloseTo(50, 3);
  });

  it("rejects a missing orderId", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userId}/pay`)
      .set(ADMIN_HEADER)
      .send({ amount: 5 });
    expect(res.status).toBe(400);
    expect(await balanceOf()).toBeCloseTo(50, 3);
  });
});

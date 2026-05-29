import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import {
  db,
  usersTable,
  walletsTable,
  walletTransactionsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import walletRouter from "../wallet";

// The admin-only endpoints gate access via isAdminReq (x-admin-email super-admin
// OR x-admin-key === ADMIN_PASSWORD). They do not use Clerk, so no mock needed.
const ADMIN_EMAIL = "khaledaladamat24@gmail.com";
const ADMIN_KEY = process.env.ADMIN_PASSWORD || "tayebat2024";

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
const tag = Date.now();

let userId: number;
const userIds: number[] = [];

beforeAll(async () => {
  const [u] = await db
    .insert(usersTable)
    .values({ clerkId: `wallet-admin-${tag}` })
    .returning();
  userId = u.id;
  userIds.push(u.id);
  await db.insert(walletsTable).values({ userId, balance: "0.000" });
});

afterAll(async () => {
  try {
    if (userIds.length) {
      await db
        .delete(walletTransactionsTable)
        .where(inArray(walletTransactionsTable.userId, userIds));
      await db
        .delete(walletsTable)
        .where(inArray(walletsTable.userId, userIds));
    }
  } finally {
    if (userIds.length)
      await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});

async function createPendingTopup(amount: string) {
  const [tx] = await db
    .insert(walletTransactionsTable)
    .values({
      userId,
      type: "topup",
      amount,
      status: "pending",
      description: "test top-up",
      paymentMethod: "cliq",
      screenshotUrl: "https://example.com/receipt.png",
    })
    .returning();
  return tx;
}

async function balanceOf(): Promise<number> {
  const [row] = await db
    .select({ balance: walletsTable.balance })
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId))
    .limit(1);
  return Number(row.balance);
}

describe("GET /api/admin/wallet/transactions — admin authz", () => {
  it("rejects a caller with no admin header (403)", async () => {
    const res = await request(app).get("/api/admin/wallet/transactions");
    expect(res.status).toBe(403);
  });

  it("rejects a caller with a wrong admin key (403)", async () => {
    const res = await request(app)
      .get("/api/admin/wallet/transactions")
      .set("x-admin-key", "definitely-wrong-key");
    expect(res.status).toBe(403);
  });

  it("accepts the super-admin email", async () => {
    const res = await request(app)
      .get("/api/admin/wallet/transactions")
      .set("x-admin-email", ADMIN_EMAIL);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("accepts the admin key", async () => {
    const res = await request(app)
      .get("/api/admin/wallet/transactions")
      .set("x-admin-key", ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("PATCH /api/admin/wallet/transactions/:id — admin authz", () => {
  it("rejects a caller with no admin header (403)", async () => {
    const tx = await createPendingTopup("10.000");
    const res = await request(app)
      .patch(`/api/admin/wallet/transactions/${tx.id}`)
      .send({ status: "approved" });
    expect(res.status).toBe(403);

    // The transaction must remain untouched by the rejected caller.
    const [after] = await db
      .select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.id, tx.id))
      .limit(1);
    expect(after.status).toBe("pending");
  });

  it("rejects a caller with a wrong admin key (403)", async () => {
    const tx = await createPendingTopup("10.000");
    const res = await request(app)
      .patch(`/api/admin/wallet/transactions/${tx.id}`)
      .set("x-admin-key", "definitely-wrong-key")
      .send({ status: "approved" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/wallet/transactions/:id — approve/reject state machine", () => {
  beforeEach(async () => {
    await db
      .update(walletsTable)
      .set({ balance: "0.000" })
      .where(eq(walletsTable.userId, userId));
  });

  it("approves a pending top-up and credits the wallet balance", async () => {
    const tx = await createPendingTopup("15.000");
    const res = await request(app)
      .patch(`/api/admin/wallet/transactions/${tx.id}`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({ status: "approved" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.reviewedAt).toBeTruthy();
    expect(await balanceOf()).toBeCloseTo(15, 3);
  });

  it("rejects a pending top-up without crediting the balance", async () => {
    const tx = await createPendingTopup("25.000");
    const res = await request(app)
      .patch(`/api/admin/wallet/transactions/${tx.id}`)
      .set("x-admin-key", ADMIN_KEY)
      .send({ status: "rejected" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(await balanceOf()).toBeCloseTo(0, 3);
  });

  it("returns 400 when re-processing an already-processed transaction", async () => {
    const tx = await createPendingTopup("30.000");
    const first = await request(app)
      .patch(`/api/admin/wallet/transactions/${tx.id}`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({ status: "approved" });
    expect(first.status).toBe(200);
    expect(await balanceOf()).toBeCloseTo(30, 3);

    const second = await request(app)
      .patch(`/api/admin/wallet/transactions/${tx.id}`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({ status: "approved" });
    expect(second.status).toBe(400);
    // No double-credit on the second (rejected) approval.
    expect(await balanceOf()).toBeCloseTo(30, 3);
  });

  it("returns 404 for a non-existent transaction id", async () => {
    const res = await request(app)
      .patch(`/api/admin/wallet/transactions/2000000000`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({ status: "approved" });
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid status value", async () => {
    const tx = await createPendingTopup("5.000");
    const res = await request(app)
      .patch(`/api/admin/wallet/transactions/${tx.id}`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({ status: "bogus" });
    expect(res.status).toBe(400);
  });
});

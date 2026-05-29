import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// Simulate Clerk: getAuth() reads the signed-in user id from a test header so
// each request can act as a specific user, an admin, or a signed-out caller.
vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => ({
    userId: (req.headers["x-test-clerk-id"] as string | undefined) ?? null,
  }),
}));

const { db, usersTable, walletsTable, walletTransactionsTable } =
  await import("@workspace/db");
const { inArray } = await import("drizzle-orm");
// Import the real router AFTER the mock so its requireWalletOwner uses the stub.
const walletRouter = (await import("../wallet")).default;

const ADMIN_EMAIL = "khaledaladamat24@gmail.com";

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

let userAClerk: string;
let userBClerk: string;
let userAId: number;
const userIds: number[] = [];

beforeAll(async () => {
  userAClerk = `wallet-clerk-A-${tag}`;
  userBClerk = `wallet-clerk-B-${tag}`;

  const [userA] = await db
    .insert(usersTable)
    .values({ clerkId: userAClerk })
    .returning();
  const [userB] = await db
    .insert(usersTable)
    .values({ clerkId: userBClerk })
    .returning();
  userAId = userA.id;
  userIds.push(userA.id, userB.id);
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

describe("requireWalletOwner — GET /api/wallet/:userId (balance + history)", () => {
  it("allows the owner to read their own wallet", async () => {
    const res = await request(app)
      .get(`/api/wallet/${userAId}`)
      .set("x-test-clerk-id", userAClerk);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("balance");
    expect(res.body).toHaveProperty("transactions");
  });

  it("forbids a different signed-in user (403)", async () => {
    const res = await request(app)
      .get(`/api/wallet/${userAId}`)
      .set("x-test-clerk-id", userBClerk);
    expect(res.status).toBe(403);
  });

  it("rejects a signed-out caller (401)", async () => {
    const res = await request(app).get(`/api/wallet/${userAId}`);
    expect(res.status).toBe(401);
  });

  it("lets the super-admin email bypass ownership", async () => {
    const res = await request(app)
      .get(`/api/wallet/${userAId}`)
      .set("x-admin-email", ADMIN_EMAIL);
    expect(res.status).toBe(200);
  });

  it("lets the admin key bypass ownership", async () => {
    const res = await request(app)
      .get(`/api/wallet/${userAId}`)
      .set("x-admin-key", process.env.ADMIN_PASSWORD || "tayebat2024");
    expect(res.status).toBe(200);
  });

  it("returns 400 for a non-numeric user id", async () => {
    const res = await request(app)
      .get(`/api/wallet/not-a-number`)
      .set("x-test-clerk-id", userAClerk);
    expect(res.status).toBe(400);
  });
});

describe("requireWalletOwner — POST /api/wallet/:userId/topup", () => {
  const body = { amount: 10, paymentMethod: "cash" };

  it("allows the owner to request a top-up", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userAId}/topup`)
      .set("x-test-clerk-id", userAClerk)
      .send(body);
    expect(res.status).toBe(201);
  });

  it("forbids a different signed-in user (403)", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userAId}/topup`)
      .set("x-test-clerk-id", userBClerk)
      .send(body);
    expect(res.status).toBe(403);
  });

  it("rejects a signed-out caller (401)", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userAId}/topup`)
      .send(body);
    expect(res.status).toBe(401);
  });

  it("lets the super-admin email bypass ownership", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userAId}/topup`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send(body);
    expect(res.status).toBe(201);
  });
});

describe("requireWalletOwner — POST /api/wallet/:userId/pay (spending)", () => {
  async function setBalance(userId: number, balance: string) {
    await db
      .insert(walletsTable)
      .values({ userId, balance })
      .onConflictDoUpdate({ target: walletsTable.userId, set: { balance } });
  }

  beforeAll(async () => {
    await setBalance(userAId, "100.000");
  });

  it("allows the owner to spend from their own wallet", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userAId}/pay`)
      .set("x-test-clerk-id", userAClerk)
      .send({ amount: 5, orderId: Math.floor(Math.random() * 1_000_000_000) });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("payment");
  });

  it("forbids a different signed-in user from spending someone else's balance (403)", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userAId}/pay`)
      .set("x-test-clerk-id", userBClerk)
      .send({ amount: 5, orderId: Math.floor(Math.random() * 1_000_000_000) });
    expect(res.status).toBe(403);
  });

  it("rejects a signed-out caller (401)", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userAId}/pay`)
      .send({ amount: 5, orderId: Math.floor(Math.random() * 1_000_000_000) });
    expect(res.status).toBe(401);
  });

  it("lets the super-admin email bypass ownership", async () => {
    const res = await request(app)
      .post(`/api/wallet/${userAId}/pay`)
      .set("x-admin-email", ADMIN_EMAIL)
      .send({ amount: 5, orderId: Math.floor(Math.random() * 1_000_000_000) });
    expect(res.status).toBe(200);
  });
});

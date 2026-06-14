import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

const { db, usersTable } = await import("@workspace/db");
const { inArray, eq } = await import("drizzle-orm");
const usersRouter = (await import("../users")).default;

// The vendor/order/admin guards resolve a caller's identity by matching the DB
// row's clerkId (Clerk session OR the forwarded x-clerk-user-id header). An
// email account created before clerkId existed has a null clerkId, so every
// owner/admin call 403s ("Not authorized") until it is backfilled. POST
// /api/users/profile must find the row by email and backfill clerkId — but
// only ONCE, never overwriting an existing one (which would allow takeover).
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
  app.use("/api", usersRouter);
  return app;
}

const app = makeApp();
const tag = Date.now();
const userIds: number[] = [];
let email: string;

beforeAll(async () => {
  email = `clerk-backfill-${tag}@example.com`;
  // Seed an email-only row WITHOUT a clerkId (the broken pre-fix state).
  const [user] = await db
    .insert(usersTable)
    .values({ email, name: "Backfill Test" })
    .returning();
  userIds.push(user.id);
});

afterAll(async () => {
  if (userIds.length)
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
});

async function rowClerkId(id: number): Promise<string | null> {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return row?.clerkId ?? null;
}

describe("POST /api/users/profile backfills clerkId by email", () => {
  it("finds the existing row by email (no duplicate) and backfills a null clerkId", async () => {
    const clerkId = `clerk-backfill-id-${tag}`;
    const res = await request(app)
      .post("/api/users/profile")
      .send({ email, clerkId, role: "consumer" });

    expect([200, 201]).toContain(res.status);
    // Same row updated, not a new insert.
    expect(res.body.id).toBe(userIds[0]);
    // Backfilled in the DB (response itself never exposes clerkId).
    expect(await rowClerkId(userIds[0])).toBe(clerkId);

    // Exactly one row for this email — no duplicate was created.
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    expect(rows).toHaveLength(1);
  });

  it("never overwrites an already-populated clerkId (anti-takeover)", async () => {
    const original = await rowClerkId(userIds[0]);
    expect(original).toBeTruthy();

    const res = await request(app)
      .post("/api/users/profile")
      .send({ email, clerkId: `attacker-${tag}`, role: "consumer" });

    expect([200, 201]).toContain(res.status);
    expect(res.body.id).toBe(userIds[0]);
    // The clerkId is locked to the first (legitimate) value.
    expect(await rowClerkId(userIds[0])).toBe(original);
  });

  it("concurrent first-claims: exactly one clerkId wins, never both", async () => {
    // Fresh row with a null clerkId so both requests race to backfill it.
    const raceEmail = `clerk-race-${tag}@example.com`;
    const [raceUser] = await db
      .insert(usersTable)
      .values({ email: raceEmail, name: "Race Test" })
      .returning();
    userIds.push(raceUser.id);

    const a = `race-a-${tag}`;
    const b = `race-b-${tag}`;
    await Promise.all([
      request(app)
        .post("/api/users/profile")
        .send({ email: raceEmail, clerkId: a, role: "consumer" }),
      request(app)
        .post("/api/users/profile")
        .send({ email: raceEmail, clerkId: b, role: "consumer" }),
    ]);

    // The isNull-guarded update means the second claim is a no-op: the stored
    // value must be one of the two, and it must stay locked thereafter.
    const winner = await rowClerkId(raceUser.id);
    expect([a, b]).toContain(winner);

    const res = await request(app)
      .post("/api/users/profile")
      .send({ email: raceEmail, clerkId: `late-${tag}`, role: "consumer" });
    expect([200, 201]).toContain(res.status);
    expect(await rowClerkId(raceUser.id)).toBe(winner);
  });
});

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

// Mirror of the clerkId backfill, for Google sign-in: the identity guards
// resolve a caller by matching the DB row's firebaseUid (the x-firebase-uid
// header). A Google sign-in whose email already has a row matches by email but
// leaves firebase_uid null, so owner-gated routes (e.g. POST /auth/location)
// 403 "Not authorized" forever. POST /api/users/profile must backfill the
// firebaseUid by email — but only ONCE, never overwriting an existing one.
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
  email = `fb-backfill-${tag}@example.com`;
  // Seed an email-only row WITHOUT a firebaseUid (the broken pre-fix state).
  const [user] = await db
    .insert(usersTable)
    .values({ email, name: "FB Backfill Test" })
    .returning();
  userIds.push(user.id);
});

afterAll(async () => {
  if (userIds.length)
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
});

async function rowFirebaseUid(id: number): Promise<string | null> {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return row?.firebaseUid ?? null;
}

describe("POST /api/users/profile backfills firebaseUid by email", () => {
  it("finds the existing row by email (no duplicate) and backfills a null firebaseUid", async () => {
    const firebaseUid = `fb-backfill-uid-${tag}`;
    const res = await request(app)
      .post("/api/users/profile")
      .send({ email, firebaseUid, role: "consumer" });

    expect([200, 201]).toContain(res.status);
    // Same row updated, not a new insert.
    expect(res.body.id).toBe(userIds[0]);
    // Backfilled in the DB (response itself never exposes firebaseUid).
    expect(await rowFirebaseUid(userIds[0])).toBe(firebaseUid);

    // Exactly one row for this email — no duplicate was created.
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    expect(rows).toHaveLength(1);
  });

  it("never overwrites an already-populated firebaseUid (anti-takeover)", async () => {
    const original = await rowFirebaseUid(userIds[0]);
    expect(original).toBeTruthy();

    const res = await request(app)
      .post("/api/users/profile")
      .send({ email, firebaseUid: `attacker-${tag}`, role: "consumer" });

    expect([200, 201]).toContain(res.status);
    expect(res.body.id).toBe(userIds[0]);
    // The firebaseUid is locked to the first (legitimate) value.
    expect(await rowFirebaseUid(userIds[0])).toBe(original);
  });

  it("concurrent first-claims: exactly one firebaseUid wins, never both", async () => {
    const raceEmail = `fb-race-${tag}@example.com`;
    const [raceUser] = await db
      .insert(usersTable)
      .values({ email: raceEmail, name: "FB Race Test" })
      .returning();
    userIds.push(raceUser.id);

    const a = `fb-race-a-${tag}`;
    const b = `fb-race-b-${tag}`;
    await Promise.all([
      request(app)
        .post("/api/users/profile")
        .send({ email: raceEmail, firebaseUid: a, role: "consumer" }),
      request(app)
        .post("/api/users/profile")
        .send({ email: raceEmail, firebaseUid: b, role: "consumer" }),
    ]);

    const winner = await rowFirebaseUid(raceUser.id);
    expect([a, b]).toContain(winner);

    const res = await request(app)
      .post("/api/users/profile")
      .send({ email: raceEmail, firebaseUid: `late-${tag}`, role: "consumer" });
    expect([200, 201]).toContain(res.status);
    expect(await rowFirebaseUid(raceUser.id)).toBe(winner);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

const { db, usersTable } = await import("@workspace/db");
const { inArray } = await import("drizzle-orm");
const usersRouter = (await import("../users")).default;

// The vendor/order/admin guards trust the opaque x-firebase-uid and
// x-clerk-user-id headers as a fallback identity. If either id were exposed on
// these public, unauthenticated, enumerable endpoints, anyone could read a
// target's (incl. the super-admin's) id and forge that header to impersonate
// them. These regression tests assert neither id ever leaves publicUser().
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
let phone: string;
let clerkId: string;
let firebaseUid: string;

beforeAll(async () => {
  email = `leak-test-${tag}@example.com`;
  phone = `0791${String(tag).slice(-6)}`;
  clerkId = `clerk-leak-${tag}`;
  firebaseUid = `fb-leak-${tag}`;

  const [user] = await db
    .insert(usersTable)
    .values({ email, phone, clerkId, firebaseUid, name: "Leak Test" })
    .returning();
  userIds.push(user.id);
});

afterAll(async () => {
  if (userIds.length)
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
});

describe("users routes never leak trusted identity headers", () => {
  it("GET /api/users omits clerkId and firebaseUid", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    const mine = (res.body as Array<Record<string, unknown>>).find(
      (u) => u.email === email,
    );
    expect(mine).toBeDefined();
    expect(mine).not.toHaveProperty("clerkId");
    expect(mine).not.toHaveProperty("firebaseUid");
    expect(mine).not.toHaveProperty("passwordHash");
  });

  it("GET /api/users/profile (by email) omits clerkId and firebaseUid", async () => {
    const res = await request(app).get("/api/users/profile").query({ email });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("clerkId");
    expect(res.body).not.toHaveProperty("firebaseUid");
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body.email).toBe(email);
  });

  it("POST /api/users/profile (upsert) omits clerkId and firebaseUid", async () => {
    const res = await request(app)
      .post("/api/users/profile")
      .send({ email, name: "Leak Test Updated" });
    expect([200, 201]).toContain(res.status);
    expect(res.body).not.toHaveProperty("clerkId");
    expect(res.body).not.toHaveProperty("firebaseUid");
    expect(res.body).not.toHaveProperty("passwordHash");
  });
});

import { describe, it, expect, vi } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// Some sibling routers call getAuth(); stub it so importing the composed
// router never touches a real Clerk context. The routes asserted here don't
// use it, but the mock keeps the import side-effect-free.
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: null }),
}));

// Import the REAL composed router (all sub-routers mounted in order).
const router = (await import("../index")).default;

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
  app.use("/api", router);
  return app;
}

const app = makeApp();

// Regression guard: a PATH-LESS `router.use(requireAdmin)` inside admin.ts used
// to leak the admin guard onto every public route mounted after it (auth/check,
// users/profile, vendors/by-user, wallet), 403-ing them in production. The guard
// is now scoped to `/admin`. These tests fail if that leak ever returns.
describe("router composition — admin guard must not leak onto public routes", () => {
  it("does NOT 403 GET /api/auth/check (public)", async () => {
    const res = await request(app).get("/api/auth/check?phone=0778844708");
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it("does NOT 403 GET /api/users/profile for an unknown user (404, not 403)", async () => {
    const res = await request(app).get(
      "/api/users/profile?phone=0000000000000",
    );
    expect(res.status).not.toBe(403);
  });

  it("still protects /api/admin/* without credentials (403)", async () => {
    const res = await request(app).get("/api/admin/orders");
    expect(res.status).toBe(403);
  });

  it("allows /api/admin/* with the super-admin email", async () => {
    const res = await request(app)
      .get("/api/admin/orders")
      .set("x-admin-email", ADMIN_EMAIL);
    expect(res.status).toBe(200);
  });
});

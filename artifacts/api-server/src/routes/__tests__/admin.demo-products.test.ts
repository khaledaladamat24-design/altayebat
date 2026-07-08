import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, productsTable, categoriesTable } from "@workspace/db";
import { eq, and, like } from "drizzle-orm";
import adminRouter from "../admin";
import { getAdminPassword } from "../../lib/admin-auth";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: unknown }).log = {
      error() {},
      info() {},
      warn() {},
    };
    req.headers["x-admin-key"] = getAdminPassword();
    next();
  });
  app.use("/api", adminRouter);
  return app;
}

const app = makeApp();
const slug = `test-admin-demo-${Date.now()}`;
const demoName = `__demo_test_${Date.now()}`;
let categoryId: number;
let demoProductId: number;
let normalProductId: number;
// The bulk-delete endpoint is global — snapshot any pre-existing demo rows
// (e.g. the startup seed) so we can restore them after the test run.
let otherDemoRows: Array<Omit<typeof productsTable.$inferSelect, "id">> = [];

beforeAll(async () => {
  const existing = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.isDemo, true));
  otherDemoRows = existing.map(({ id: _id, ...rest }) => rest);
  const [cat] = await db
    .insert(categoriesTable)
    .values({
      name: "Demo Test",
      nameAr: "اختبار تجريبي",
      slug,
      foodType: "healthy",
    })
    .returning();
  categoryId = cat.id;

  const [demo] = await db
    .insert(productsTable)
    .values({
      name: `${demoName}_demo`,
      nameAr: "منتج تجريبي",
      price: "1.000",
      categoryId,
      isDemo: true,
    })
    .returning();
  demoProductId = demo.id;

  const [normal] = await db
    .insert(productsTable)
    .values({
      name: `${demoName}_normal`,
      nameAr: "منتج عادي",
      price: "2.000",
      categoryId,
      isDemo: false,
    })
    .returning();
  normalProductId = normal.id;
});

afterAll(async () => {
  try {
    await db
      .delete(productsTable)
      .where(eq(productsTable.categoryId, categoryId));
    // Restore the snapshotted pre-existing demo rows (new ids are fine).
    if (otherDemoRows.length > 0)
      await db.insert(productsTable).values(otherDemoRows);
  } finally {
    if (categoryId)
      await db
        .delete(categoriesTable)
        .where(eq(categoriesTable.id, categoryId));
  }
});

describe("admin demo products", () => {
  it("GET /admin/products includes the isDemo field", async () => {
    const res = await request(app).get("/api/admin/products");
    expect(res.status).toBe(200);
    const demo = res.body.find(
      (p: { id: number }) => p.id === demoProductId,
    ) as { isDemo?: boolean } | undefined;
    const normal = res.body.find(
      (p: { id: number }) => p.id === normalProductId,
    ) as { isDemo?: boolean } | undefined;
    expect(demo?.isDemo).toBe(true);
    expect(normal?.isDemo).toBe(false);
  });

  it("DELETE /admin/products/demo removes only demo products", async () => {
    const res = await request(app).delete("/api/admin/products/demo");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toBeGreaterThanOrEqual(1);

    const remaining = await db
      .select({ id: productsTable.id, isDemo: productsTable.isDemo })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.categoryId, categoryId),
          like(productsTable.name, `${demoName}%`),
        ),
      );
    expect(remaining.map((r) => r.id)).toEqual([normalProductId]);
  });
});

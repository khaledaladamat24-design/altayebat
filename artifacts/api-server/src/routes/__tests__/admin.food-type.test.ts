import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, productsTable, categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
const slug = `test-admin-foodtype-${Date.now()}`;
let categoryId: number;

function baseProduct(extra: Record<string, unknown> = {}) {
  return { nameAr: "منتج", name: "Product", price: 5, categoryId, ...extra };
}

beforeAll(async () => {
  const [cat] = await db
    .insert(categoriesTable)
    .values({
      name: "Grocery Test",
      nameAr: "اختبار البقالة",
      slug,
      foodType: "grocery",
    })
    .returning();
  categoryId = cat.id;
});

afterAll(async () => {
  try {
    if (categoryId)
      await db
        .delete(productsTable)
        .where(eq(productsTable.categoryId, categoryId));
  } finally {
    if (categoryId)
      await db
        .delete(categoriesTable)
        .where(eq(categoriesTable.id, categoryId));
  }
});

describe("admin product foodType persistence", () => {
  it("persists foodType=grocery on create", async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ foodType: "grocery" }));
    expect(res.status).toBe(201);
    expect(res.body.foodType).toBe("grocery");
  });

  it("persists foodType=regular on create", async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ foodType: "regular" }));
    expect(res.status).toBe(201);
    expect(res.body.foodType).toBe("regular");
  });

  it("defaults invalid foodType to healthy on create", async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ foodType: "bogus" }));
    expect(res.status).toBe(201);
    expect(res.body.foodType).toBe("healthy");
  });

  it("persists foodType=grocery on update", async () => {
    const created = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ foodType: "healthy" }));
    const id = created.body.id;
    const res = await request(app)
      .put(`/api/admin/products/${id}`)
      .send({ foodType: "grocery" });
    expect(res.status).toBe(200);
    expect(res.body.foodType).toBe("grocery");
  });
});

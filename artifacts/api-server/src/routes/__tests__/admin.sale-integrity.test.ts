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
    // These tests exercise sale-integrity validation, not admin auth — present
    // the super-admin identity so the requireAdmin guard lets them through.
    req.headers["x-admin-key"] = getAdminPassword();
    next();
  });
  app.use("/api", adminRouter);
  return app;
}

const app = makeApp();
const slug = `test-admin-sale-${Date.now()}`;
let categoryId: number;

function baseProduct(extra: Record<string, unknown> = {}) {
  return { nameAr: "منتج", name: "Product", price: 5, categoryId, ...extra };
}

beforeAll(async () => {
  const [cat] = await db
    .insert(categoriesTable)
    .values({
      name: "Admin Test",
      nameAr: "اختبار المشرف",
      slug,
      foodType: "regular",
    })
    .returning();
  categoryId = cat.id;
});

afterAll(async () => {
  // Guard each delete so a failure mid-setup can't leave orphan fixtures.
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

describe("POST /api/admin/products sale-integrity", () => {
  it("creates a regular (non-sale) product", async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct());
    expect(res.status).toBe(201);
  });

  it("rejects isOnSale without an originalPrice", async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ isOnSale: true }));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("سعر أصلي");
  });

  it("rejects isOnSale when originalPrice is not higher than price", async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ isOnSale: true, originalPrice: 4 }));
    expect(res.status).toBe(400);
  });

  it("accepts a valid sale (originalPrice strictly higher)", async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ isOnSale: true, originalPrice: 8 }));
    expect(res.status).toBe(201);
    expect(res.body.isOnSale).toBe(true);
  });
});

describe("PUT /api/admin/products/:id sale-integrity", () => {
  let productId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ price: 6 }));
    productId = res.body.id;
  });

  it("rejects flipping isOnSale on without a higher originalPrice", async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .send({ isOnSale: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("سعر أصلي");
  });

  it("accepts the sale when a higher originalPrice is supplied", async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .send({ isOnSale: true, originalPrice: 10 });
    expect(res.status).toBe(200);
    expect(res.body.isOnSale).toBe(true);
  });
});

// Locks the "effective values from the existing row" contract on partial PUTs:
// omitted fields must be re-read from the stored product before validating.
describe("PUT /api/admin/products/:id effective-value recomputation on an already-on-sale product", () => {
  let productId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/admin/products")
      .send(baseProduct({ price: 5, originalPrice: 10, isOnSale: true }));
    productId = res.body.id;
  });

  it("rejects a price-only PUT that raises price above the existing originalPrice", async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .send({ price: 12 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("سعر أصلي");
  });

  it("rejects an originalPrice-only PUT that drops below the existing price", async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .send({ originalPrice: 4 });
    expect(res.status).toBe(400);
  });

  it("accepts a price-only PUT that stays below the existing originalPrice", async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .send({ price: 8 });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe(8);
  });
});

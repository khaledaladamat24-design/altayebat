import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import {
  db,
  vendorProfilesTable,
  productsTable,
  categoriesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import vendorsRouter from "../vendors";
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
    // These tests exercise sale-integrity validation, not vendor-owner authz —
    // present the super-admin identity so the ownership guards let them through.
    req.headers["x-admin-key"] = getAdminPassword();
    next();
  });
  app.use("/api", vendorsRouter);
  return app;
}

const app = makeApp();
const slug = `test-vendor-sale-${Date.now()}`;
const userId = Math.floor(Math.random() * 1_000_000_000);
let vendorId: number;
let categoryId: number;
const createdProductIds: number[] = [];

function baseProduct(extra: Record<string, unknown> = {}) {
  return { nameAr: "منتج", name: "Product", price: 5, categoryId, ...extra };
}

beforeAll(async () => {
  const [cat] = await db
    .insert(categoriesTable)
    .values({
      name: "Vendor Test",
      nameAr: "اختبار متجر",
      slug,
      foodType: "regular",
    })
    .returning();
  categoryId = cat.id;

  const [vendor] = await db
    .insert(vendorProfilesTable)
    .values({
      userId,
      storeName: "Test Store",
      category: "test",
      phone: "0790000000",
      status: "approved",
      isOnline: true,
    })
    .returning();
  vendorId = vendor.id;
});

afterAll(async () => {
  // Guard each delete so a failure mid-setup can't leave orphan fixtures: run
  // every cleanup step regardless of whether an earlier one threw.
  try {
    if (vendorId)
      await db
        .delete(productsTable)
        .where(eq(productsTable.vendorId, vendorId));
  } finally {
    try {
      if (vendorId)
        await db
          .delete(vendorProfilesTable)
          .where(eq(vendorProfilesTable.id, vendorId));
    } finally {
      if (categoryId)
        await db
          .delete(categoriesTable)
          .where(eq(categoriesTable.id, categoryId));
    }
  }
});

describe("POST /api/vendors/:id/products sale-integrity", () => {
  it("creates a regular (non-sale) product", async () => {
    const res = await request(app)
      .post(`/api/vendors/${vendorId}/products`)
      .send(baseProduct());
    expect(res.status).toBe(201);
    createdProductIds.push(res.body.id);
  });

  it("rejects isOnSale without an originalPrice", async () => {
    const res = await request(app)
      .post(`/api/vendors/${vendorId}/products`)
      .send(baseProduct({ isOnSale: true }));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("سعر أصلي");
  });

  it("rejects isOnSale when originalPrice is not higher than price", async () => {
    const res = await request(app)
      .post(`/api/vendors/${vendorId}/products`)
      .send(baseProduct({ isOnSale: true, originalPrice: 4 }));
    expect(res.status).toBe(400);
  });

  it("accepts a valid sale (originalPrice strictly higher)", async () => {
    const res = await request(app)
      .post(`/api/vendors/${vendorId}/products`)
      .send(baseProduct({ isOnSale: true, originalPrice: 8 }));
    expect(res.status).toBe(201);
    expect(res.body.isOnSale).toBe(true);
    createdProductIds.push(res.body.id);
  });
});

describe("PATCH /api/vendors/:vendorId/products/:productId sale-integrity", () => {
  let productId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post(`/api/vendors/${vendorId}/products`)
      .send(baseProduct({ price: 6 }));
    productId = res.body.id;
    createdProductIds.push(productId);
  });

  it("rejects flipping isOnSale on without a higher originalPrice", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/products/${productId}`)
      .send({ isOnSale: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("سعر أصلي");
  });

  it("accepts the sale when a higher originalPrice is supplied", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/products/${productId}`)
      .send({ isOnSale: true, originalPrice: 10 });
    expect(res.status).toBe(200);
    expect(res.body.isOnSale).toBe(true);
  });
});

// Locks the "effective values from the existing row" contract: on a partial
// PATCH, the rule must re-validate using whatever fields are omitted, read back
// from the stored product.
describe("PATCH effective-value recomputation on an already-on-sale product", () => {
  let productId: number;

  beforeAll(async () => {
    const res = await request(app)
      .post(`/api/vendors/${vendorId}/products`)
      .send(baseProduct({ price: 5, originalPrice: 10, isOnSale: true }));
    productId = res.body.id;
    createdProductIds.push(productId);
  });

  it("rejects a price-only PATCH that raises price above the existing originalPrice", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/products/${productId}`)
      .send({ price: 12 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("سعر أصلي");
  });

  it("rejects an originalPrice-only PATCH that drops below the existing price", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/products/${productId}`)
      .send({ originalPrice: 4 });
    expect(res.status).toBe(400);
  });

  it("accepts a price-only PATCH that stays below the existing originalPrice", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${vendorId}/products/${productId}`)
      .send({ price: 8 });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe(8);
  });
});

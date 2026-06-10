import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import {
  db,
  productsTable,
  categoriesTable,
  vendorProfilesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import productsRouter from "../products";

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
  app.use("/api", productsRouter);
  return app;
}

const app = makeApp();
const slug = `test-city-${Date.now()}`;
const ammanUserId = Math.floor(Math.random() * 1_000_000_000);
const irbidUserId = Math.floor(Math.random() * 1_000_000_000);
let categoryId: number;
let ammanVendorId: number;
let irbidVendorId: number;
const productIds: number[] = [];

beforeAll(async () => {
  const [cat] = await db
    .insert(categoriesTable)
    .values({
      name: "City Test",
      nameAr: "اختبار مدينة",
      slug,
      foodType: "regular",
    })
    .returning();
  categoryId = cat.id;

  // One vendor stored with a tashkeel (shadda) variant of Amman, one in Irbid,
  // to prove the canonical filter value "عمان" matches the legacy "عمّان".
  const [ammanVendor] = await db
    .insert(vendorProfilesTable)
    .values({
      userId: ammanUserId,
      storeName: "Amman Store",
      category: "test",
      city: "عمّان",
      status: "approved",
      isOnline: true,
    })
    .returning();
  ammanVendorId = ammanVendor.id;

  const [irbidVendor] = await db
    .insert(vendorProfilesTable)
    .values({
      userId: irbidUserId,
      storeName: "Irbid Store",
      category: "test",
      city: "إربد",
      status: "approved",
      isOnline: true,
    })
    .returning();
  irbidVendorId = irbidVendor.id;

  const rows = await db
    .insert(productsTable)
    .values([
      {
        name: "Amman P1",
        nameAr: "منتج عمان",
        price: "5.000",
        categoryId,
        foodType: "regular",
        vendorId: ammanVendorId,
        isOnSale: false,
      },
      {
        name: "Irbid P1",
        nameAr: "منتج إربد",
        price: "5.000",
        categoryId,
        foodType: "regular",
        vendorId: irbidVendorId,
        isOnSale: false,
      },
    ])
    .returning();
  productIds.push(...rows.map((r) => r.id));
});

afterAll(async () => {
  if (productIds.length)
    await db.delete(productsTable).where(inArray(productsTable.id, productIds));
  if (categoryId)
    await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  if (ammanVendorId)
    await db
      .delete(vendorProfilesTable)
      .where(eq(vendorProfilesTable.id, ammanVendorId));
  if (irbidVendorId)
    await db
      .delete(vendorProfilesTable)
      .where(eq(vendorProfilesTable.id, irbidVendorId));
});

describe("GET /api/products ?city= province filter", () => {
  it("returns both vendors' products when no city is given", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("filters to one province by canonical city value", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&city=إربد`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].vendorId).toBe(irbidVendorId);
  });

  it("matches diacritic-free canonical 'عمان' against stored 'عمّان'", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&city=${encodeURIComponent("عمان")}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].vendorId).toBe(ammanVendorId);
  });

  it("returns nothing for a province with no vendors", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&city=${encodeURIComponent("العقبة")}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { db, productsTable, categoriesTable } from "@workspace/db";
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
const slug = `test-subcat-${Date.now()}`;
let categoryId: number;
const productIds: number[] = [];

beforeAll(async () => {
  const [cat] = await db
    .insert(categoriesTable)
    .values({
      name: "Test Zone",
      nameAr: "منطقة اختبار",
      slug,
      foodType: "regular",
    })
    .returning();
  categoryId = cat.id;

  const rows = await db
    .insert(productsTable)
    .values([
      {
        name: "P1",
        nameAr: "P1",
        price: "5.000",
        categoryId,
        foodType: "regular",
        subcategory: "sandwiches",
        isOnSale: false,
      },
      {
        name: "P2",
        nameAr: "P2",
        price: "5.000",
        originalPrice: "8.000",
        categoryId,
        foodType: "regular",
        subcategory: "sandwiches",
        isOnSale: true,
      },
      {
        name: "P3",
        nameAr: "P3",
        price: "5.000",
        categoryId,
        foodType: "regular",
        subcategory: "pizza",
        isOnSale: false,
      },
      {
        name: "P4",
        nameAr: "P4",
        price: "5.000",
        categoryId,
        foodType: "healthy",
        subcategory: null,
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
});

describe("GET /api/products subcategory + foodType + onSale filtering", () => {
  it("returns every product in the category when no filter is applied", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });

  it("filters by ?subcategory=", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&subcategory=sandwiches`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(
      res.body.every(
        (p: { subcategory: string }) => p.subcategory === "sandwiches",
      ),
    ).toBe(true);
  });

  it("returns nothing for an unknown subcategory", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&subcategory=does-not-exist`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("combines ?subcategory= with ?onSale=true", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&subcategory=sandwiches&onSale=true`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].subcategory).toBe("sandwiches");
    expect(res.body[0].isOnSale).toBe(true);
  });

  it("excludes the other zone when ?foodType=regular is set", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&foodType=regular`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(
      res.body.every((p: { foodType: string }) => p.foodType === "regular"),
    ).toBe(true);
  });

  it("combines ?foodType= with ?subcategory=", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&foodType=regular&subcategory=sandwiches`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("ignores an invalid foodType value (returns all)", async () => {
    const res = await request(app).get(
      `/api/products?categoryId=${categoryId}&foodType=bogus`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });
});

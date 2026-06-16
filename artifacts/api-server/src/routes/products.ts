import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable,
  categoriesTable,
  vendorProfilesTable,
  ordersTable,
  orderItemsTable,
  productRatingsTable,
  usersTable,
} from "@workspace/db";
import {
  eq,
  and,
  or,
  ilike,
  isNull,
  ne,
  sql,
  inArray,
  count,
  avg,
} from "drizzle-orm";
import { getActingDbUserId } from "../lib/vendor-auth";
import { phoneVariants, normalizePhone } from "../lib/phone";

// Products without a vendor (admin-uploaded) stay visible. Products linked to
// a vendor only appear when that vendor is marked online AND not suspended by
// the admin — flipping "Online" off lets a vendor pause orders, while an admin
// "suspend" hides the whole store regardless of its online switch.
const vendorVisibleCondition = or(
  isNull(productsTable.vendorId),
  and(
    eq(vendorProfilesTable.isOnline, true),
    ne(vendorProfilesTable.status, "suspended"),
  ),
);

const router = Router();

type VendorLite = Pick<
  typeof vendorProfilesTable.$inferSelect,
  "id" | "storeName" | "storeNameAr"
> | null;

function buildProductRow(
  p: typeof productsTable.$inferSelect,
  c: typeof categoriesTable.$inferSelect | null,
  v: VendorLite = null,
) {
  return {
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    description: p.description ?? null,
    descriptionAr: p.descriptionAr ?? null,
    price: Number(p.price),
    originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
    imageUrl: p.imageUrl ?? null,
    categoryId: p.categoryId,
    categoryName: c?.name ?? null,
    categoryNameAr: c?.nameAr ?? null,
    inStock: p.inStock,
    isFeatured: p.isFeatured,
    isBestseller: p.isBestseller,
    isKeto: p.isKeto,
    isOrganic: p.isOrganic,
    weightOrVolume: p.weightOrVolume ?? null,
    rating: p.rating ? Number(p.rating) : null,
    reviewCount: p.reviewCount,
    calories: p.calories ?? null,
    protein: p.protein ? Number(p.protein) : null,
    carbs: p.carbs ? Number(p.carbs) : null,
    fats: p.fats ? Number(p.fats) : null,
    vendorId: p.vendorId ?? null,
    vendorName: v?.storeName ?? null,
    vendorNameAr: v?.storeNameAr ?? null,
    foodType: p.foodType,
    isOnSale: p.isOnSale,
    subcategory: p.subcategory ?? null,
  };
}

function foodTypeCondition(raw: unknown) {
  if (raw === "healthy" || raw === "regular" || raw === "grocery") {
    return eq(productsTable.foodType, raw);
  }
  return undefined;
}

router.get("/products/featured", async (req, res) => {
  try {
    const ft = foodTypeCondition(req.query.foodType);
    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id),
      )
      .leftJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .where(
        and(eq(productsTable.isFeatured, true), vendorVisibleCondition, ft),
      );
    res.json(rows.map((r) => buildProductRow(r.p, r.c, r.v)));
  } catch (err) {
    req.log.error({ err }, "Failed to list featured products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products/bestsellers", async (req, res) => {
  try {
    const ft = foodTypeCondition(req.query.foodType);
    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id),
      )
      .leftJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .where(
        and(eq(productsTable.isBestseller, true), vendorVisibleCondition, ft),
      );
    res.json(rows.map((r) => buildProductRow(r.p, r.c, r.v)));
  } catch (err) {
    req.log.error({ err }, "Failed to list bestsellers");
    res.status(500).json({ error: "Internal server error" });
  }
});

// A customer may rate a product only after a delivered order containing it.
// Match the order to the user by the linked user_id (set on new orders) OR by
// the canonical phone variants (covers older orders that predate the user_id
// link, whose customerPhone is stored as typed).
async function hasDeliveredOrder(
  userId: number,
  productId: number,
): Promise<boolean> {
  const [u] = await db
    .select({ phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const variants = u?.phone ? phoneVariants(u.phone) : [];
  const ownerMatch = variants.length
    ? or(
        eq(ordersTable.userId, userId),
        inArray(ordersTable.customerPhone, variants),
      )
    : eq(ordersTable.userId, userId);
  const [row] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .innerJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.status, "delivered"),
        eq(orderItemsTable.productId, productId),
        ownerMatch,
      ),
    )
    .limit(1);
  return !!row;
}

// Resolve the registered user a guest session may rate as. Customers browse and
// order as guests (sessionId in localStorage), so eligibility can't rely on a
// login. The checkout gate guarantees every order's customerPhone maps to a
// users row, so we find a delivered order for this session containing the
// product and resolve its owning user (order.userId, else by canonical phone).
async function deliveredOrderUserIdBySession(
  sessionId: string,
  productId: number,
): Promise<number | null> {
  const [row] = await db
    .select({
      userId: ordersTable.userId,
      phone: ordersTable.customerPhone,
    })
    .from(ordersTable)
    .innerJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.status, "delivered"),
        eq(orderItemsTable.productId, productId),
        eq(ordersTable.sessionId, sessionId),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.userId) return row.userId;
  const canonical = normalizePhone(row.phone);
  if (!canonical) return null;
  const [u] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.phone, phoneVariants(canonical)))
    .limit(1);
  return u?.id ?? null;
}

// The registered user the caller is allowed to rate as for this product, or
// null. Prefers an authenticated identity, then falls back to the guest session.
async function resolveRaterUserId(
  req: Parameters<typeof getActingDbUserId>[0],
  productId: number,
  sessionId: string | undefined,
): Promise<number | null> {
  const authUserId = await getActingDbUserId(req);
  if (authUserId && (await hasDeliveredOrder(authUserId, productId))) {
    return authUserId;
  }
  if (sessionId) {
    const sid = await deliveredOrderUserIdBySession(sessionId, productId);
    if (sid) return sid;
  }
  return null;
}

// Whether the caller may rate this product, plus their current rating (if any).
router.get("/products/:id/rating/me", async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) return res.status(400).json({ error: "Invalid id" });
    const sessionId =
      typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const userId = await resolveRaterUserId(req, productId, sessionId);
    if (!userId) return res.json({ canRate: false, myStars: null });
    const [r] = await db
      .select({ stars: productRatingsTable.stars })
      .from(productRatingsTable)
      .where(
        and(
          eq(productRatingsTable.productId, productId),
          eq(productRatingsTable.userId, userId),
        ),
      )
      .limit(1);
    return res.json({ canRate: true, myStars: r?.stars ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to get my product rating");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Submit/replace the caller's 1-5 star rating for a product. Gated to customers
// with a delivered order containing it; recomputes the cached aggregate that
// products.rating / reviewCount mirror.
router.post("/products/:id/rating", async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) return res.status(400).json({ error: "Invalid id" });
    const stars = Number(req.body?.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({
        error: "التقييم يجب أن يكون من 1 إلى 5 نجوم",
        code: "INVALID_STARS",
      });
    }
    const sessionId =
      typeof req.body?.sessionId === "string" ? req.body.sessionId : undefined;
    const userId = await resolveRaterUserId(req, productId, sessionId);
    if (!userId) {
      return res.status(403).json({
        error: "يمكنك تقييم المنتج فقط بعد استلام طلب يحتوي عليه",
        code: "NOT_ELIGIBLE",
      });
    }

    const result = await db.transaction(async (tx) => {
      await tx
        .insert(productRatingsTable)
        .values({ productId, userId, stars })
        .onConflictDoUpdate({
          target: [productRatingsTable.productId, productRatingsTable.userId],
          set: { stars, updatedAt: new Date() },
        });
      const [agg] = await tx
        .select({ average: avg(productRatingsTable.stars), cnt: count() })
        .from(productRatingsTable)
        .where(eq(productRatingsTable.productId, productId));
      const average = agg?.average != null ? Number(agg.average) : null;
      const cnt = Number(agg?.cnt ?? 0);
      await tx
        .update(productsTable)
        .set({
          rating: average != null ? average.toFixed(2) : null,
          reviewCount: cnt,
        })
        .where(eq(productsTable.id, productId));
      return { average, count: cnt };
    });

    return res.json({
      average: result.average,
      count: result.count,
      myStars: stars,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to rate product");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products", async (req, res) => {
  try {
    const {
      categoryId,
      search,
      featured,
      foodType,
      onSale,
      subcategory,
      city,
      vendorId,
    } = req.query;
    const conditions = [];

    if (categoryId) {
      const catId = parseInt(categoryId as string);
      if (!isNaN(catId)) conditions.push(eq(productsTable.categoryId, catId));
    }
    if (featured === "true")
      conditions.push(eq(productsTable.isFeatured, true));
    if (onSale === "true") conditions.push(eq(productsTable.isOnSale, true));
    if (typeof subcategory === "string" && subcategory.length > 0) {
      conditions.push(eq(productsTable.subcategory, subcategory));
    }
    if (vendorId) {
      const vId = parseInt(vendorId as string);
      if (!isNaN(vId)) conditions.push(eq(productsTable.vendorId, vId));
    }
    // Province/city filter: match against the selling vendor's saved city.
    // Strip Arabic diacritics (tashkeel) + tatweel on BOTH the stored value and
    // the search term so canonical forms match legacy free-text variants
    // (e.g. "عمان" matches a stored "عمّان"). The picker and vendor form share
    // one canonical list, so this is a safety net for older/free-text data.
    if (typeof city === "string" && city.trim().length > 0) {
      const TASHKEEL = /[\u064B-\u0652\u0640]/g;
      const normalizedCity = city.trim().replace(TASHKEEL, "");
      if (normalizedCity.length > 0) {
        conditions.push(
          sql`regexp_replace(${vendorProfilesTable.city}, '[\u064B-\u0652\u0640]', '', 'g') ILIKE ${`%${normalizedCity}%`}`,
        );
      }
    }
    const ft = foodTypeCondition(foodType);
    if (ft) conditions.push(ft);
    if (vendorVisibleCondition) conditions.push(vendorVisibleCondition);
    // Search across product name AND vendor store name so a user can find
    // "خبز كيتو" (product) or "أم علي" (restaurant) with the same input.
    if (search) {
      const q = `%${search}%`;
      const matchers = [
        ilike(productsTable.nameAr, q),
        ilike(productsTable.name, q),
        ilike(vendorProfilesTable.storeNameAr, q),
        ilike(vendorProfilesTable.storeName, q),
      ];
      const orExpr = or(...matchers);
      if (orExpr) conditions.push(orExpr);
    }

    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id),
      )
      .leftJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .where(conditions.length ? and(...conditions) : undefined);

    res.json(rows.map((r) => buildProductRow(r.p, r.c, r.v)));
  } catch (err) {
    req.log.error({ err }, "Failed to list products");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const rows = await db
      .select({ p: productsTable, c: categoriesTable, v: vendorProfilesTable })
      .from(productsTable)
      .leftJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id),
      )
      .leftJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .where(eq(productsTable.id, id));

    if (!rows.length) return res.status(404).json({ error: "Not found" });
    return res.json(buildProductRow(rows[0].p, rows[0].c, rows[0].v));
  } catch (err) {
    req.log.error({ err }, "Failed to get product");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

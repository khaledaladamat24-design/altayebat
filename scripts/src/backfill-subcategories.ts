import { db, pool, productsTable, categoriesTable } from "@workspace/db";
import { and, eq, isNull, or, inArray, sql } from "drizzle-orm";

/**
 * One-off, idempotent backfill that tags Regular-zone products with a
 * `subcategory` value so the zone-aware filter chips (category page + the
 * /offers/regular page) surface populated grids instead of empty ones.
 *
 * Safe to run repeatedly against dev or production: it only fills products
 * whose `subcategory` is currently NULL/empty, so it never clobbers values an
 * admin/kitchen has set by hand. Re-running is a no-op once everything is tagged.
 *
 * The subcategory is chosen from the canonical Regular-zone mapping keyed by the
 * parent category slug (mirrors artifacts/al-tayebat/src/lib/subcategories.ts —
 * kept in sync manually because the `scripts` leaf package can't import app code).
 * Within a category we apply light name-keyword heuristics (AR + EN) to pick the
 * most fitting sub-type, falling back to a sensible default for that category.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/scripts run backfill:subcategories
 */

type Rule = {
  /** Persisted value (must match subcategories.ts) */
  value: string;
  /** Lowercased substrings (AR/EN) that, if present in the name, select this rule. */
  match: string[];
};

/**
 * Ordered rules per category slug — first matching rule wins; the final rule in
 * each list has an empty `match` array and acts as the default.
 */
const RULES_BY_SLUG: Record<string, Rule[]> = {
  feasts: [
    {
      value: "individual-meals",
      match: ["فردي", "للفرد", "individual", "single"],
    },
    { value: "family-feasts", match: [] },
  ],
  fastfood: [
    {
      value: "sandwiches",
      match: [
        "ساندوي",
        "سندوي",
        "شطيرة",
        "شاورما",
        "برجر",
        "برغر",
        "sandwich",
        "burger",
        "shawarma",
        "wrap",
      ],
    },
    { value: "meals-combos", match: [] },
  ],
  pastries: [
    { value: "pizza", match: ["بيتزا", "pizza"] },
    {
      value: "by-dozen",
      match: [
        "درزن",
        "دزن",
        "كيلو",
        "علبة",
        "صينية",
        "كمية",
        "dozen",
        "box",
        "tray",
        "bulk",
        "kilo",
      ],
    },
    { value: "single-pieces", match: [] },
  ],
  "sweets-cakes": [
    {
      value: "whole-cakes",
      match: [
        "قالب",
        "تورتة",
        "كيكة",
        "كاتو",
        "تشيز",
        "cake",
        "cheesecake",
        "gateau",
        "tart",
        "تورته",
      ],
    },
    { value: "slices-sweets", match: [] },
  ],
  appetizers: [
    {
      value: "cook-prep",
      match: [
        "مفرز",
        "تجهيز",
        "للطهي",
        "للقلي",
        "نيء",
        "نية",
        "مجمد",
        "cook",
        "prep",
        "frozen",
        "raw",
      ],
    },
    { value: "ready-to-eat", match: [] },
  ],
};

function pickSubcategory(
  slug: string,
  nameAr: string,
  name: string,
): string | null {
  const rules = RULES_BY_SLUG[slug];
  if (!rules || rules.length === 0) return null;
  const haystack = `${nameAr ?? ""} ${name ?? ""}`.toLowerCase();
  for (const rule of rules) {
    if (rule.match.length === 0) return rule.value; // default
    if (rule.match.some((kw) => haystack.includes(kw.toLowerCase())))
      return rule.value;
  }
  return rules[rules.length - 1]?.value ?? null;
}

async function main() {
  const regularSlugs = Object.keys(RULES_BY_SLUG);

  // Products that live in a Regular-zone category (by slug) and have no
  // subcategory yet. We key off the category slug rather than the product's own
  // food_type so intentional cross-zone "drift" products in a regular category
  // still get tagged (the chips are driven by the category's slug/zone).
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      nameAr: productsTable.nameAr,
      slug: categoriesTable.slug,
    })
    .from(productsTable)
    .innerJoin(
      categoriesTable,
      eq(productsTable.categoryId, categoriesTable.id),
    )
    .where(
      and(
        inArray(categoriesTable.slug, regularSlugs),
        or(
          isNull(productsTable.subcategory),
          eq(productsTable.subcategory, ""),
        ),
      ),
    );

  if (rows.length === 0) {
    console.log(
      "No untagged Regular-zone products found — nothing to backfill. " +
        "(The filter chips will populate automatically once Regular-zone products are added and tagged.)",
    );
    await pool.end();
    return;
  }

  const perValue = new Map<string, number>();
  let updated = 0;

  for (const r of rows) {
    const sub = pickSubcategory(r.slug, r.nameAr, r.name);
    if (!sub) continue;
    await db
      .update(productsTable)
      .set({ subcategory: sub })
      .where(eq(productsTable.id, r.id));
    updated += 1;
    perValue.set(sub, (perValue.get(sub) ?? 0) + 1);
  }

  const breakdown = [...perValue.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `  ${v}: ${n}`)
    .join("\n");

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(productsTable)
    .innerJoin(
      categoriesTable,
      eq(productsTable.categoryId, categoriesTable.id),
    )
    .where(
      and(
        inArray(categoriesTable.slug, regularSlugs),
        or(
          isNull(productsTable.subcategory),
          eq(productsTable.subcategory, ""),
        ),
      ),
    );

  console.log(
    `Backfilled ${updated} Regular-zone product(s) with a subcategory:`,
  );
  console.log(breakdown);
  console.log(`Remaining untagged Regular-zone products: ${remaining}.`);

  await pool.end();
}

main().catch((err) => {
  console.error("Failed to backfill subcategories:", err);
  process.exit(1);
});

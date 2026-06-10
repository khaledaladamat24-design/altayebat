import { db, pool, categoriesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Idempotent seed for the bilingual (AR/EN) Healthy + Regular zone categories.
 * Safe to run against dev or production: upserts by unique `slug`, so re-running
 * only updates names/icons/sort order and never duplicates rows.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/scripts run seed:categories
 */
type SeedCategory = {
  slug: string;
  nameAr: string;
  name: string;
  icon: string;
  foodType: "healthy" | "regular" | "grocery";
  sortOrder: number;
};

const CATEGORIES: SeedCategory[] = [
  // Healthy zone
  {
    slug: "keto",
    nameAr: "منتجات الكيتو",
    name: "Keto Products",
    icon: "🥑",
    foodType: "healthy",
    sortOrder: 1,
  },
  {
    slug: "vegetables",
    nameAr: "خضروات عضوية",
    name: "Organic Vegetables",
    icon: "🥦",
    foodType: "healthy",
    sortOrder: 2,
  },
  {
    slug: "pantry",
    nameAr: "مؤونة صحية",
    name: "Healthy Pantry",
    icon: "🫙",
    foodType: "healthy",
    sortOrder: 3,
  },
  {
    slug: "drinks",
    nameAr: "مشروبات صحية",
    name: "Healthy Drinks",
    icon: "🥤",
    foodType: "healthy",
    sortOrder: 4,
  },
  {
    slug: "dairy",
    nameAr: "ألبان وبيض",
    name: "Dairy & Eggs",
    icon: "🥛",
    foodType: "healthy",
    sortOrder: 5,
  },
  {
    slug: "nuts",
    nameAr: "مكسرات وبذور",
    name: "Nuts & Seeds",
    icon: "🌰",
    foodType: "healthy",
    sortOrder: 6,
  },
  {
    slug: "sweets",
    nameAr: "حلويات طبيعية",
    name: "Natural Sweets",
    icon: "🍯",
    foodType: "healthy",
    sortOrder: 7,
  },
  {
    slug: "meat",
    nameAr: "لحوم طازجة",
    name: "Fresh Meat",
    icon: "🥩",
    foodType: "healthy",
    sortOrder: 8,
  },
  // Regular zone — the 5 required categories
  {
    slug: "feasts",
    nameAr: "عزائم ووجبات",
    name: "Feasts & Meals",
    icon: "🍲",
    foodType: "regular",
    sortOrder: 1,
  },
  {
    slug: "fastfood",
    nameAr: "وجبات سريعة",
    name: "Fast Food",
    icon: "🍔",
    foodType: "regular",
    sortOrder: 2,
  },
  {
    slug: "pastries",
    nameAr: "معجنات",
    name: "Pastries",
    icon: "🥐",
    foodType: "regular",
    sortOrder: 3,
  },
  {
    slug: "sweets-cakes",
    nameAr: "حلويات وكيك",
    name: "Sweets & Cakes",
    icon: "🍰",
    foodType: "regular",
    sortOrder: 4,
  },
  {
    slug: "appetizers",
    nameAr: "مقبلات وتجهيز مسبق",
    name: "Appetizers & Pre-made",
    icon: "🥗",
    foodType: "regular",
    sortOrder: 5,
  },
  // Grocery (بقالة) zone — "عروض" is the virtual Offers pill, not a DB category
  {
    slug: "grocery-supplies",
    nameAr: "تموين",
    name: "Grocery Supplies",
    icon: "🛒",
    foodType: "grocery",
    sortOrder: 1,
  },
  {
    slug: "grocery-produce",
    nameAr: "خضار وفواكة",
    name: "Fruits & Vegetables",
    icon: "🥬",
    foodType: "grocery",
    sortOrder: 2,
  },
  {
    slug: "grocery-meat-fish",
    nameAr: "لحوم وأسماك",
    name: "Meat & Fish",
    icon: "🍖",
    foodType: "grocery",
    sortOrder: 3,
  },
  {
    slug: "grocery-dairy",
    nameAr: "ألبان وأجبان",
    name: "Dairy & Cheese",
    icon: "🧀",
    foodType: "grocery",
    sortOrder: 4,
  },
  {
    slug: "grocery-canned",
    nameAr: "معلبات",
    name: "Canned Goods",
    icon: "🥫",
    foodType: "grocery",
    sortOrder: 5,
  },
  {
    slug: "grocery-bakery-sweets",
    nameAr: "مخبوزات وحلويات",
    name: "Bakery & Sweets",
    icon: "🍞",
    foodType: "grocery",
    sortOrder: 6,
  },
  {
    slug: "grocery-frozen",
    nameAr: "مجمّدات",
    name: "Frozen",
    icon: "🧊",
    foodType: "grocery",
    sortOrder: 7,
  },
  {
    slug: "grocery-drinks",
    nameAr: "مشروبات ومياه",
    name: "Drinks & Water",
    icon: "🥤",
    foodType: "grocery",
    sortOrder: 8,
  },
  {
    slug: "grocery-snacks",
    nameAr: "تسالي وسكاكر",
    name: "Snacks & Candy",
    icon: "🍬",
    foodType: "grocery",
    sortOrder: 9,
  },
  {
    slug: "grocery-cleaning",
    nameAr: "مواد تنظيف وعناية منزلية",
    name: "Cleaning & Home Care",
    icon: "🧼",
    foodType: "grocery",
    sortOrder: 10,
  },
  {
    slug: "grocery-personal-care",
    nameAr: "عناية شخصية",
    name: "Personal Care",
    icon: "🧴",
    foodType: "grocery",
    sortOrder: 11,
  },
];

async function main() {
  let upserted = 0;
  for (const c of CATEGORIES) {
    await db
      .insert(categoriesTable)
      .values(c)
      .onConflictDoUpdate({
        target: categoriesTable.slug,
        set: {
          nameAr: c.nameAr,
          name: c.name,
          icon: c.icon,
          foodType: c.foodType,
          sortOrder: c.sortOrder,
        },
      });
    upserted += 1;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categoriesTable);

  console.log(`Seeded ${upserted} categories. Total categories now: ${count}.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to seed categories:", err);
  process.exit(1);
});

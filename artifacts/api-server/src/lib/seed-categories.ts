import { db, categoriesTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Canonical bilingual (AR/EN) category list for both zones.
 * Source of truth for the Healthy and Regular zone category rails.
 */
const CATEGORIES = [
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
  {
    slug: "drinks-juices",
    nameAr: "عصائر ومشروبات",
    name: "Juices & Drinks",
    icon: "🧃",
    foodType: "regular",
    sortOrder: 6,
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
] as const;

/**
 * Idempotently ensures the canonical categories exist. Insert-if-missing
 * (keyed on the unique `slug`) so it never duplicates rows and never clobbers
 * existing rows that an operator may have customized. Runs at server startup so
 * production (where row data is not copied on publish) always has both zones.
 */
export async function ensureCategoriesSeeded(): Promise<void> {
  try {
    const result = await db
      .insert(categoriesTable)
      .values(CATEGORIES.map((c) => ({ ...c })))
      .onConflictDoNothing({ target: categoriesTable.slug });
    logger.info(
      { inserted: result.rowCount ?? 0 },
      "Category seed ensured (insert-if-missing)",
    );
  } catch (err) {
    // Never block server startup on a seed failure.
    logger.error({ err }, "Failed to ensure category seed");
  }
}

import {
  db,
  categoriesTable,
  productsTable,
  appFlagsTable,
} from "@workspace/db";
import { logger } from "./logger";

/**
 * One-time seed of TEMPORARY demo products (2 per category, all zones) so the
 * app never looks empty at launch. Gated by an `app_flags` marker: it runs
 * exactly once per database — after the admin bulk-deletes the demo products
 * (DELETE /api/admin/products/demo) a restart will NOT re-insert them.
 * All rows carry is_demo = true and vendor_id = NULL (always visible).
 */
const SEED_FLAG = "demo_products_seeded_v1";

const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`;

type DemoProduct = {
  nameAr: string;
  name: string;
  price: string;
  imageUrl: string;
  isKeto?: boolean;
  isOrganic?: boolean;
  weightOrVolume?: string;
};

// Keyed by category slug (never by ID — IDs differ between dev and prod).
const DEMO_PRODUCTS: Record<string, DemoProduct[]> = {
  // ── Healthy zone ──
  keto: [
    {
      nameAr: "خبز كيتو باللوز",
      name: "Keto Almond Bread",
      price: "3.500",
      imageUrl: img("photo-1509440159596-0249088772ff"),
      isKeto: true,
      weightOrVolume: "400 غم",
    },
    {
      nameAr: "جرانولا كيتو بالمكسرات",
      name: "Keto Nut Granola",
      price: "4.250",
      imageUrl: img("photo-1517093602195-b40af9688b46"),
      isKeto: true,
      weightOrVolume: "300 غم",
    },
  ],
  vegetables: [
    {
      nameAr: "سلة خضار عضوية مشكلة",
      name: "Mixed Organic Veggie Box",
      price: "6.000",
      imageUrl: img("photo-1540420773420-3366772f4999"),
      isOrganic: true,
      weightOrVolume: "3 كغم",
    },
    {
      nameAr: "أفوكادو عضوي",
      name: "Organic Avocado",
      price: "2.750",
      imageUrl: img("photo-1523049673857-eb18f1d7b578"),
      isOrganic: true,
      isKeto: true,
      weightOrVolume: "2 حبة",
    },
  ],
  pantry: [
    {
      nameAr: "زيت زيتون بلدي بكر",
      name: "Local Extra Virgin Olive Oil",
      price: "9.500",
      imageUrl: img("photo-1474979266404-7eaacbcd87c5"),
      isOrganic: true,
      weightOrVolume: "1 لتر",
    },
    {
      nameAr: "طحينة بلدية",
      name: "Artisan Tahini",
      price: "3.250",
      imageUrl: img("photo-1542838132-92c53300491e"),
      weightOrVolume: "500 غم",
    },
  ],
  drinks: [
    {
      nameAr: "سموذي أخضر ديتوكس",
      name: "Green Detox Smoothie",
      price: "2.500",
      imageUrl: img("photo-1544145945-f90425340c7e"),
      weightOrVolume: "400 مل",
    },
    {
      nameAr: "كمبوتشا طبيعية",
      name: "Natural Kombucha",
      price: "3.000",
      imageUrl: img("photo-1595981267035-7b04ca84a82d"),
      weightOrVolume: "330 مل",
    },
  ],
  dairy: [
    {
      nameAr: "لبن بلدي طازج",
      name: "Fresh Local Yogurt",
      price: "1.750",
      imageUrl: img("photo-1550583724-b2692b85b150"),
      weightOrVolume: "1 كغم",
    },
    {
      nameAr: "بيض بلدي حر",
      name: "Free-Range Local Eggs",
      price: "3.500",
      imageUrl: img("photo-1506976785307-8732e854ad03"),
      isOrganic: true,
      weightOrVolume: "30 بيضة",
    },
  ],
  nuts: [
    {
      nameAr: "مكسرات مشكلة نيئة",
      name: "Raw Mixed Nuts",
      price: "5.500",
      imageUrl: img("photo-1508061253366-f7da158b6d46"),
      isKeto: true,
      weightOrVolume: "500 غم",
    },
    {
      nameAr: "بذور شيا",
      name: "Chia Seeds",
      price: "3.750",
      imageUrl: img("photo-1514537099923-4c0fc7c73161"),
      isKeto: true,
      weightOrVolume: "250 غم",
    },
  ],
  sweets: [
    {
      nameAr: "عسل بلدي طبيعي",
      name: "Natural Local Honey",
      price: "12.000",
      imageUrl: img("photo-1587049352846-4a222e784d38"),
      isOrganic: true,
      weightOrVolume: "1 كغم",
    },
    {
      nameAr: "كرات التمر بالمكسرات",
      name: "Date & Nut Energy Balls",
      price: "3.250",
      imageUrl: img("photo-1603048297172-c92544798d5a"),
      weightOrVolume: "12 حبة",
    },
  ],
  meat: [
    {
      nameAr: "لحم عجل بلدي طازج",
      name: "Fresh Local Veal",
      price: "11.500",
      imageUrl: img("photo-1603360946369-dc9bb6258143"),
      weightOrVolume: "1 كغم",
    },
    {
      nameAr: "صدر دجاج بلدي",
      name: "Local Chicken Breast",
      price: "5.250",
      imageUrl: img("photo-1604503468506-a8da13d82791"),
      weightOrVolume: "1 كغم",
    },
  ],
  // ── Regular zone ──
  feasts: [
    {
      nameAr: "منسف أردني (يخدم 4 أشخاص)",
      name: "Jordanian Mansaf (serves 4)",
      price: "25.000",
      imageUrl: img("photo-1547592180-85f173990554"),
    },
    {
      nameAr: "مقلوبة دجاج عائلية",
      name: "Family Chicken Maqluba",
      price: "18.000",
      imageUrl: img("photo-1512058564366-18510be2db19"),
    },
  ],
  fastfood: [
    {
      nameAr: "برجر لحم أنجوس",
      name: "Angus Beef Burger",
      price: "4.500",
      imageUrl: img("photo-1568901346375-23c9450c58cd"),
    },
    {
      nameAr: "شاورما دجاج عربي",
      name: "Chicken Shawarma Wrap",
      price: "2.750",
      imageUrl: img("photo-1561651823-34feb02250e4"),
    },
  ],
  pastries: [
    {
      nameAr: "مناقيش زعتر (6 قطع)",
      name: "Zaatar Manakish (6 pcs)",
      price: "3.000",
      imageUrl: img("photo-1573140247632-f8fd74997d5c"),
    },
    {
      nameAr: "فطائر سبانخ (12 قطعة)",
      name: "Spinach Fatayer (12 pcs)",
      price: "4.500",
      imageUrl: img("photo-1509365465985-25d11c17e812"),
    },
  ],
  "sweets-cakes": [
    {
      nameAr: "كنافة نابلسية",
      name: "Nabulsi Knafeh",
      price: "6.500",
      imageUrl: img("photo-1579372786545-d24232daf58c"),
      weightOrVolume: "1 كغم",
    },
    {
      nameAr: "كيكة شوكولاتة فاخرة",
      name: "Premium Chocolate Cake",
      price: "12.000",
      imageUrl: img("photo-1578985545062-69928b1d9587"),
    },
  ],
  appetizers: [
    {
      nameAr: "حمص بلدي بالطحينة",
      name: "Classic Hummus",
      price: "1.500",
      imageUrl: img("photo-1577805947697-89e18249d767"),
      weightOrVolume: "500 غم",
    },
    {
      nameAr: "ورق عنب محشي",
      name: "Stuffed Vine Leaves",
      price: "5.000",
      imageUrl: img("photo-1546069901-ba9599a7e63c"),
      weightOrVolume: "1 كغم",
    },
  ],
  "drinks-juices": [
    {
      nameAr: "عصير برتقال طازج",
      name: "Fresh Orange Juice",
      price: "2.000",
      imageUrl: img("photo-1600271886742-f049cd451bba"),
      weightOrVolume: "500 مل",
    },
    {
      nameAr: "ليمون بالنعنع",
      name: "Mint Lemonade",
      price: "1.750",
      imageUrl: img("photo-1556679343-c7306c1976bc"),
      weightOrVolume: "500 مل",
    },
  ],
  // ── Grocery (بقالة) zone ──
  "grocery-supplies": [
    {
      nameAr: "أرز بسمتي فاخر",
      name: "Premium Basmati Rice",
      price: "8.500",
      imageUrl: img("photo-1586201375761-83865001e31c"),
      weightOrVolume: "5 كغم",
    },
    {
      nameAr: "سكر ناعم",
      name: "Fine Sugar",
      price: "2.250",
      imageUrl: img("photo-1581441363689-1f3c3c414635"),
      weightOrVolume: "2 كغم",
    },
  ],
  "grocery-produce": [
    {
      nameAr: "موز طازج",
      name: "Fresh Bananas",
      price: "1.250",
      imageUrl: img("photo-1571771894821-ce9b6c11b08e"),
      weightOrVolume: "1 كغم",
    },
    {
      nameAr: "بندورة بلدية",
      name: "Local Tomatoes",
      price: "0.950",
      imageUrl: img("photo-1592924357228-91a4daadcfea"),
      weightOrVolume: "1 كغم",
    },
  ],
  "grocery-meat-fish": [
    {
      nameAr: "فيليه سلمون",
      name: "Salmon Fillet",
      price: "9.750",
      imageUrl: img("photo-1519708227418-c8fd9a32b7a2"),
      weightOrVolume: "500 غم",
    },
    {
      nameAr: "لحم مفروم طازج",
      name: "Fresh Ground Beef",
      price: "7.500",
      imageUrl: img("photo-1602470520998-f4a52199a3d6"),
      weightOrVolume: "1 كغم",
    },
  ],
  "grocery-dairy": [
    {
      nameAr: "جبنة نابلسية",
      name: "Nabulsi Cheese",
      price: "6.000",
      imageUrl: img("photo-1486297678162-eb2a19b0a32d"),
      weightOrVolume: "1 كغم",
    },
    {
      nameAr: "حليب طازج كامل الدسم",
      name: "Fresh Full-Fat Milk",
      price: "1.350",
      imageUrl: img("photo-1563636619-e9143da7973b"),
      weightOrVolume: "2 لتر",
    },
  ],
  "grocery-canned": [
    {
      nameAr: "تونة قطع بزيت الزيتون",
      name: "Tuna Chunks in Olive Oil",
      price: "1.850",
      imageUrl: img("photo-1534483509719-3feaee7c30da"),
      weightOrVolume: "160 غم",
    },
    {
      nameAr: "فول مدمس معلب",
      name: "Canned Fava Beans",
      price: "0.650",
      imageUrl: img("photo-1610725664285-7c57e6eeac3f"),
      weightOrVolume: "400 غم",
    },
  ],
  "grocery-bakery-sweets": [
    {
      nameAr: "خبز عربي كبير",
      name: "Large Arabic Bread",
      price: "0.500",
      imageUrl: img("photo-1549931319-a545dcf3bc73"),
      weightOrVolume: "8 أرغفة",
    },
    {
      nameAr: "بقلاوة مشكلة",
      name: "Assorted Baklava",
      price: "8.500",
      imageUrl: img("photo-1519676867240-f03562e64548"),
      weightOrVolume: "500 غم",
    },
  ],
  "grocery-frozen": [
    {
      nameAr: "خضار مشكلة مجمدة",
      name: "Frozen Mixed Vegetables",
      price: "2.500",
      imageUrl: img("photo-1476718406336-bb5a9690ee2a"),
      weightOrVolume: "900 غم",
    },
    {
      nameAr: "بطاطا مجمدة للقلي",
      name: "Frozen French Fries",
      price: "2.250",
      imageUrl: img("photo-1518013431117-eb1465fa5752"),
      weightOrVolume: "1 كغم",
    },
  ],
  "grocery-drinks": [
    {
      nameAr: "مياه معدنية (12 عبوة)",
      name: "Mineral Water (12-pack)",
      price: "2.750",
      imageUrl: img("photo-1560023907-5f339617ea30"),
      weightOrVolume: "12 × 500 مل",
    },
    {
      nameAr: "مشروبات غازية مشكلة",
      name: "Assorted Soft Drinks",
      price: "4.500",
      imageUrl: img("photo-1554866585-cd94860890b7"),
      weightOrVolume: "6 عبوات",
    },
  ],
  "grocery-snacks": [
    {
      nameAr: "شيبس مشكل عائلي",
      name: "Family Chips Pack",
      price: "3.250",
      imageUrl: img("photo-1566478989037-eec170784d0b"),
      weightOrVolume: "10 أكياس",
    },
    {
      nameAr: "شوكولاتة وسكاكر مشكلة",
      name: "Assorted Chocolate & Candy",
      price: "5.000",
      imageUrl: img("photo-1599490659213-e2b9527bd087"),
      weightOrVolume: "750 غم",
    },
  ],
  "grocery-cleaning": [
    {
      nameAr: "سائل جلي ليمون",
      name: "Lemon Dish Soap",
      price: "1.750",
      imageUrl: img("photo-1585421514738-01798e348b17"),
      weightOrVolume: "1 لتر",
    },
    {
      nameAr: "مسحوق غسيل",
      name: "Laundry Detergent",
      price: "6.500",
      imageUrl: img("photo-1610557892470-55d9e80c0bce"),
      weightOrVolume: "3 كغم",
    },
  ],
  "grocery-personal-care": [
    {
      nameAr: "شامبو بزيت الأرغان",
      name: "Argan Oil Shampoo",
      price: "4.250",
      imageUrl: img("photo-1556228578-8c89e6adf883"),
      weightOrVolume: "400 مل",
    },
    {
      nameAr: "صابون زيت زيتون بلدي",
      name: "Local Olive Oil Soap",
      price: "2.000",
      imageUrl: img("photo-1600857544200-b2f666a9a2ec"),
      weightOrVolume: "4 قطع",
    },
  ],
};

export async function ensureDemoProductsSeeded(): Promise<void> {
  try {
    const categories = await db
      .select({
        id: categoriesTable.id,
        slug: categoriesTable.slug,
        foodType: categoriesTable.foodType,
      })
      .from(categoriesTable);
    const bySlug = new Map(categories.map((c) => [c.slug, c]));

    const rows = Object.entries(DEMO_PRODUCTS).flatMap(([slug, products]) => {
      const cat = bySlug.get(slug);
      if (!cat) {
        logger.warn({ slug }, "Demo seed: category slug not found, skipping");
        return [];
      }
      return products.map((p) => ({
        name: p.name,
        nameAr: p.nameAr,
        price: p.price,
        imageUrl: p.imageUrl,
        categoryId: cat.id,
        foodType: cat.foodType,
        isKeto: p.isKeto ?? false,
        isOrganic: p.isOrganic ?? false,
        weightOrVolume: p.weightOrVolume ?? null,
        isDemo: true,
        inStock: true,
      }));
    });

    // Flag + insert in ONE transaction: the flag row only persists if the
    // products were actually inserted, so a mid-seed failure retries on the
    // next restart instead of leaving a "flagged but never seeded" state.
    // Once committed, the flag makes this a no-op forever — so an admin
    // bulk-deletion of demo products is permanent across restarts/deploys.
    const inserted = await db.transaction(async (tx) => {
      const flagged = await tx
        .insert(appFlagsTable)
        .values({ key: SEED_FLAG })
        .onConflictDoNothing({ target: appFlagsTable.key })
        .returning({ key: appFlagsTable.key });
      if (flagged.length === 0) return -1; // already seeded once
      if (rows.length > 0) await tx.insert(productsTable).values(rows);
      return rows.length;
    });
    if (inserted < 0) return;
    logger.info({ inserted }, "Demo products seeded (one-time)");
  } catch (err) {
    // Never block server startup on a seed failure.
    logger.error({ err }, "Failed to seed demo products");
  }
}

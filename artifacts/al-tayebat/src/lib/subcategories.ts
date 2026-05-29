export interface SubcategoryOption {
  /** Stable value persisted in products.subcategory */
  value: string;
  ar: string;
  en: string;
}

/**
 * Single source of truth for Regular-Zone sub-category options, keyed by the
 * parent category slug. Reused by the customer category page, the offers page,
 * the admin product form, and the vendor product form.
 *
 * Healthy-Zone categories do NOT use these; they keep their Keto/Organic chips
 * driven by the isKeto/isOrganic booleans.
 */
export const SUBCATEGORIES_BY_SLUG: Record<string, SubcategoryOption[]> = {
  feasts: [
    { value: "family-feasts", ar: "عزائم عائلية", en: "Family Feasts" },
    { value: "individual-meals", ar: "وجبات فردية", en: "Individual Meals" },
  ],
  fastfood: [
    { value: "meals-combos", ar: "وجبات وكومبو", en: "Meals & Combos" },
    { value: "sandwiches", ar: "سندويشات", en: "Sandwiches" },
  ],
  pastries: [
    { value: "by-dozen", ar: "بالدرزن / كميات", en: "By Dozen / Bulk" },
    { value: "single-pieces", ar: "قطع فردية", en: "Single Pieces" },
    { value: "pizza", ar: "بيتزا", en: "Pizza" },
  ],
  "sweets-cakes": [
    { value: "whole-cakes", ar: "قوالب كاملة", en: "Whole Cakes" },
    { value: "slices-sweets", ar: "قطع وحلويات", en: "Slices & Sweets" },
  ],
  appetizers: [
    { value: "ready-to-eat", ar: "جاهز للأكل", en: "Ready to Eat" },
    { value: "cook-prep", ar: "مفرزات للطهي", en: "Cook-prep" },
  ],
};

/** All sub-category options across every category, used to resolve a value → label. */
export const ALL_SUBCATEGORIES: SubcategoryOption[] = Object.values(
  SUBCATEGORIES_BY_SLUG,
).flat();

export function getSubcategoriesForSlug(slug: string | null | undefined): SubcategoryOption[] {
  if (!slug) return [];
  return SUBCATEGORIES_BY_SLUG[slug] ?? [];
}

export function getSubcategoryLabel(value: string | null | undefined, lang: "ar" | "en"): string {
  if (!value) return "";
  const opt = ALL_SUBCATEGORIES.find((o) => o.value === value);
  if (!opt) return value;
  return lang === "en" ? opt.en : opt.ar;
}

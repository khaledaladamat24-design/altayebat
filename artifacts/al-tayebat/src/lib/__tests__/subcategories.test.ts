import { describe, it, expect } from "vitest";
import {
  buildCategoryChips,
  getSubcategoriesForSlug,
  getSubcategoryLabel,
} from "../subcategories";

describe("buildCategoryChips", () => {
  it("renders the mapped sub-type chips for a Regular-zone category", () => {
    const chips = buildCategoryChips({
      isRegular: true,
      slug: "fastfood",
      lang: "ar",
    });
    expect(chips.map((c) => c.value)).toEqual([
      "all",
      "sub:meals-combos",
      "sub:sandwiches",
      "instock",
    ]);
    expect(chips.map((c) => c.value)).not.toContain("keto");
    expect(chips.map((c) => c.value)).not.toContain("organic");
  });

  it("keeps the Keto/Organic chips for a Healthy-zone category", () => {
    const chips = buildCategoryChips({
      isRegular: false,
      slug: "keto",
      lang: "ar",
    });
    expect(chips.map((c) => c.value)).toEqual([
      "all",
      "keto",
      "organic",
      "instock",
    ]);
    expect(chips.some((c) => c.value.startsWith("sub:"))).toBe(false);
  });

  it("falls back to just all + instock for a Regular category with no mapped sub-types", () => {
    const chips = buildCategoryChips({
      isRegular: true,
      slug: "unknown-slug",
      lang: "ar",
    });
    expect(chips.map((c) => c.value)).toEqual(["all", "instock"]);
  });

  it("uses English labels when lang=en", () => {
    const chips = buildCategoryChips({
      isRegular: true,
      slug: "fastfood",
      lang: "en",
    });
    const sandwiches = chips.find((c) => c.value === "sub:sandwiches");
    expect(sandwiches?.label).toBe("Sandwiches");
    expect(chips.find((c) => c.value === "all")?.label).toBe("All");
  });

  it("uses Arabic labels when lang=ar", () => {
    const chips = buildCategoryChips({
      isRegular: false,
      slug: "keto",
      lang: "ar",
    });
    expect(chips.find((c) => c.value === "keto")?.label).toBe("كيتو");
  });
});

describe("getSubcategoriesForSlug", () => {
  it("returns options for a known slug", () => {
    expect(getSubcategoriesForSlug("pastries").map((o) => o.value)).toEqual([
      "by-dozen",
      "single-pieces",
      "pizza",
    ]);
  });

  it("returns an empty array for unknown or empty slugs", () => {
    expect(getSubcategoriesForSlug("nope")).toEqual([]);
    expect(getSubcategoriesForSlug(null)).toEqual([]);
    expect(getSubcategoriesForSlug(undefined)).toEqual([]);
  });
});

describe("getSubcategoryLabel", () => {
  it("resolves a value to its localized label", () => {
    expect(getSubcategoryLabel("pizza", "ar")).toBe("بيتزا");
    expect(getSubcategoryLabel("pizza", "en")).toBe("Pizza");
  });

  it("returns the raw value when unknown and empty string when nullish", () => {
    expect(getSubcategoryLabel("mystery", "ar")).toBe("mystery");
    expect(getSubcategoryLabel(null, "ar")).toBe("");
  });
});

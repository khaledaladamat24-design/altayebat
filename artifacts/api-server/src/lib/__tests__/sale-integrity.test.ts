import { describe, it, expect } from "vitest";
import { checkSaleIntegrity, SALE_INTEGRITY_ERROR } from "../sale-integrity";

describe("checkSaleIntegrity", () => {
  it("passes when the product is not on sale (originalPrice irrelevant)", () => {
    expect(
      checkSaleIntegrity({ isOnSale: false, price: 5, originalPrice: null }),
    ).toEqual({ ok: true });
    expect(
      checkSaleIntegrity({ isOnSale: undefined, price: 5, originalPrice: 2 }),
    ).toEqual({ ok: true });
    expect(
      checkSaleIntegrity({ isOnSale: 0, price: 5, originalPrice: undefined }),
    ).toEqual({ ok: true });
  });

  it("rejects an on-sale product without an originalPrice", () => {
    expect(
      checkSaleIntegrity({ isOnSale: true, price: 5, originalPrice: null }),
    ).toEqual({
      ok: false,
      error: SALE_INTEGRITY_ERROR,
    });
    expect(
      checkSaleIntegrity({ isOnSale: true, price: 5, originalPrice: undefined })
        .ok,
    ).toBe(false);
    expect(
      checkSaleIntegrity({ isOnSale: true, price: 5, originalPrice: "" }).ok,
    ).toBe(false);
  });

  it("rejects when originalPrice is not strictly greater than price", () => {
    expect(
      checkSaleIntegrity({ isOnSale: true, price: 5, originalPrice: 5 }).ok,
    ).toBe(false);
    expect(
      checkSaleIntegrity({ isOnSale: true, price: 5, originalPrice: 4 }).ok,
    ).toBe(false);
  });

  it("rejects when originalPrice is not numeric", () => {
    expect(
      checkSaleIntegrity({ isOnSale: true, price: 5, originalPrice: "abc" }).ok,
    ).toBe(false);
  });

  it("passes when originalPrice is strictly greater than price", () => {
    expect(
      checkSaleIntegrity({ isOnSale: true, price: 5, originalPrice: 8 }),
    ).toEqual({ ok: true });
  });

  it("normalizes stringified numeric inputs like the request body", () => {
    expect(
      checkSaleIntegrity({
        isOnSale: true,
        price: "5.000",
        originalPrice: "8.000",
      }),
    ).toEqual({ ok: true });
    expect(
      checkSaleIntegrity({
        isOnSale: true,
        price: "5.000",
        originalPrice: "4.500",
      }).ok,
    ).toBe(false);
  });
});

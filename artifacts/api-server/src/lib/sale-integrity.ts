export const SALE_INTEGRITY_ERROR =
  "لتفعيل العرض يجب إدخال سعر أصلي أعلى من السعر الحالي";

export type SaleIntegrityResult = { ok: true } | { ok: false; error: string };

/**
 * Enforces the "on sale" rule shared by the vendor product create/update
 * routes: a product flagged `isOnSale` must carry an `originalPrice` strictly
 * greater than its current `price` (so the strikethrough stays truthful).
 *
 * Accepts raw, possibly-stringified values straight off the request body and
 * normalizes them the same way the routes do. Returns `{ ok: true }` when the
 * product is not on sale or the prices are consistent, otherwise
 * `{ ok: false, error }` carrying the Arabic message the routes surface as 400.
 */
export function checkSaleIntegrity(input: {
  isOnSale: unknown;
  price: unknown;
  originalPrice: unknown;
}): SaleIntegrityResult {
  if (!Boolean(input.isOnSale)) return { ok: true };
  const { originalPrice } = input;
  const orig =
    originalPrice === undefined ||
    originalPrice === null ||
    originalPrice === ""
      ? null
      : Number(originalPrice);
  const price = Number(input.price);
  if (orig === null || Number.isNaN(orig) || !(orig > price)) {
    return { ok: false, error: SALE_INTEGRITY_ERROR };
  }
  return { ok: true };
}

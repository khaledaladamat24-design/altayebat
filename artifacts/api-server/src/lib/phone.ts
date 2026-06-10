/**
 * Normalize Jordanian phone numbers to the canonical "07XXXXXXXX" form so a
 * user can sign up with "+962791234567" and log back in with "0791234567"
 * (or any variant) without mismatches. Returns null for anything that isn't a
 * valid Jordanian mobile number.
 *
 * Shared by the auth routes (signup/login/check) and the orders route (the
 * "phone must already be registered" checkout gate) so both resolve a given
 * input to exactly the same stored value.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (/^07\d{8}$/.test(digits)) return digits;
  if (/^7\d{8}$/.test(digits)) return "0" + digits;
  if (/^9627\d{8}$/.test(digits)) return "0" + digits.slice(3);
  if (/^009627\d{8}$/.test(digits)) return "0" + digits.slice(5);
  return null; // reject anything that isn't a valid JO mobile
}

/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * Handles plain Error objects, Clerk-style errors (`{ errors: [{ longMessage }] }`),
 * and string throws. Returns `undefined` when nothing useful can be extracted so
 * callers can fall back to their own localized message.
 */
export function getErrorMessage(err: unknown): string | undefined {
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const e = err as {
      errors?: Array<{ longMessage?: string; message?: string }>;
      message?: string;
    };
    return e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.message;
  }
  return undefined;
}

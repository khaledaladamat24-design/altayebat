import type { Request, Response, NextFunction } from "express";

/**
 * The hardcoded super-admin email. Carries admin privileges regardless of the
 * admin password — used both for request-level admin checks and for deriving a
 * user's `isAdmin` flag from their email/role.
 */
export const SUPER_ADMIN_EMAIL = "khaledaladamat24@gmail.com";

const FALLBACK_ADMIN_PASSWORD = "tayebat2024";

/**
 * The active admin password — the `ADMIN_PASSWORD` Replit Secret, or a legacy
 * fallback (with a warning) when the secret is unset.
 */
export function getAdminPassword(): string {
  const env = process.env.ADMIN_PASSWORD;
  if (env && env.length > 0) return env;

  console.warn(
    "[admin] ⚠️  ADMIN_PASSWORD env secret is not set — falling back to the legacy default. " +
      "Set ADMIN_PASSWORD as a Replit Secret to secure the admin panel.",
  );
  return FALLBACK_ADMIN_PASSWORD;
}

/**
 * Single source of truth for request-level admin access: the request carries
 * either the super-admin email (`x-admin-email`) or the admin key
 * (`x-admin-key`) matching the active admin password.
 */
export function isAdminReq(req: Request): boolean {
  const adminEmail = req.headers["x-admin-email"] as string | undefined;
  const adminKey = req.headers["x-admin-key"] as string | undefined;
  return adminKey === getAdminPassword() || adminEmail === SUPER_ADMIN_EMAIL;
}

/** Express guard that rejects non-admin requests with 403. */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isAdminReq(req)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

/**
 * The hardcoded super-admin email. Carries admin privileges regardless of the
 * admin password — used both for deriving a user's `isAdmin` flag from their
 * email/role and for the verified-session admin check in `vendor-auth.ts`.
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

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Repair pass for vendor-role users that have no store profile.
 *
 * The admin panel's "vendors" tab and product↔vendor assignment both key off
 * `vendor_profiles`, not `users.role`. Users promoted to "vendor" before the
 * auto-create-profile fix shipped (or via any path that only flips the role)
 * are invisible there. This backfill creates a minimal, pre-approved profile
 * for each such user so they show up immediately; the vendor (or admin) can
 * complete the store details later.
 *
 * Idempotent: the anti-join only matches users that still lack a profile, so
 * repeat runs insert nothing. Runs on every startup and never blocks it.
 */
export async function backfillVendorProfiles(): Promise<void> {
  try {
    const result = await db.execute(sql`
      INSERT INTO vendor_profiles (user_id, store_name, store_name_ar, category, phone, status)
      SELECT
        u.id,
        COALESCE(NULLIF(TRIM(u.name), ''), u.phone, u.email, 'مورّد #' || u.id),
        NULLIF(TRIM(u.name), ''),
        'healthy',
        u.phone,
        'approved'
      FROM users u
      LEFT JOIN vendor_profiles vp ON vp.user_id = u.id
      WHERE u.role = 'vendor' AND vp.id IS NULL
    `);
    logger.info(
      { created: result.rowCount ?? 0 },
      "Vendor profile backfill ensured (vendor-role users without a store)",
    );
  } catch (err) {
    // Never block server startup on a backfill failure.
    logger.error({ err }, "Failed to backfill vendor profiles");
  }
}

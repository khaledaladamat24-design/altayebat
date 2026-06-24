import { db, usersTable } from "@workspace/db";
import { sql, and, isNull, lt } from "drizzle-orm";
import { logger } from "./logger";

/**
 * One-time grandfathering of pre-existing users.
 *
 * `users.auth_method` is the "has the user chosen a role?" signal — NULL forces
 * the client through the role-selection screen (/register). Users who already
 * existed before this feature shipped have a NULL auth_method, so without this
 * backfill they'd be sent back through role selection and could accidentally
 * overwrite a vendor account with "consumer".
 *
 * We infer a best-effort method from the identity columns (the exact value is
 * cosmetic — what matters is that it becomes non-NULL so they skip the screen)
 * and only touch rows created before a cutoff. The cutoff protects a user who is
 * mid-onboarding right now (row just created, role not yet chosen) from being
 * wrongly marked onboarded if the server restarts during that brief window.
 *
 * Idempotent: only ever affects rows where auth_method IS NULL.
 */
export async function backfillAuthMethod(): Promise<void> {
  try {
    const result = await db
      .update(usersTable)
      .set({
        authMethod: sql`CASE
          WHEN ${usersTable.passwordHash} IS NOT NULL AND ${usersTable.email} IS NULL THEN 'phone'
          WHEN ${usersTable.firebaseUid} IS NOT NULL AND ${usersTable.email} IS NOT NULL THEN 'google'
          WHEN ${usersTable.clerkId} IS NOT NULL OR ${usersTable.email} IS NOT NULL THEN 'email'
          WHEN ${usersTable.firebaseUid} IS NOT NULL THEN 'phone'
          ELSE 'email'
        END`,
      })
      .where(
        and(
          isNull(usersTable.authMethod),
          lt(usersTable.createdAt, sql`now() - interval '30 minutes'`),
        ),
      );
    logger.info(
      { updated: result.rowCount ?? 0 },
      "auth_method backfill ensured (grandfather existing users)",
    );
  } catch (err) {
    // Never block server startup on a backfill failure.
    logger.error({ err }, "Failed to backfill auth_method");
  }
}

import { Router } from "express";
import { db, deviceTokensTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getActingDbUserId } from "../lib/vendor-auth";

const router = Router();

// Register (or move) a device's FCM token for the *authenticated* user. Called by
// the native app after the user grants notification permission. The acting user
// is resolved server-side from the Clerk session / Firebase uid — never trusted
// from the request body — to prevent an attacker from binding their token to
// another vendor's account and hijacking that vendor's order pushes. The token
// is unique, so a re-register from a device that switched accounts re-points it.
router.post("/devices/register", async (req, res) => {
  try {
    const uid = await getActingDbUserId(req);
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { token, platform } = req.body ?? {};
    if (typeof token !== "string" || !token) {
      return res.status(400).json({ error: "token is required" });
    }
    const platformValue = typeof platform === "string" ? platform : null;

    await db
      .insert(deviceTokensTable)
      .values({ userId: uid, token, platform: platformValue })
      .onConflictDoUpdate({
        target: deviceTokensTable.token,
        set: { userId: uid, platform: platformValue, updatedAt: new Date() },
      });

    return res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to register device token");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Drop one of the *caller's own* device tokens (e.g. on logout). Idempotent.
// Scoped to the acting user so a caller can't unregister another user's token.
router.post("/devices/unregister", async (req, res) => {
  try {
    const uid = await getActingDbUserId(req);
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { token } = req.body ?? {};
    if (typeof token !== "string" || !token) {
      return res.status(400).json({ error: "token is required" });
    }
    await db
      .delete(deviceTokensTable)
      .where(
        and(
          eq(deviceTokensTable.token, token),
          eq(deviceTokensTable.userId, uid),
        ),
      );
    return res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to unregister device token");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

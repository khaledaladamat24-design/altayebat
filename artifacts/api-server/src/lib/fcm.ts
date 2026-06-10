import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { db, deviceTokensTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

let app: App | null = null;
let initTried = false;

// Lazily initialise Firebase Admin from the FIREBASE_SERVICE_ACCOUNT secret
// (the full service-account JSON, stringified). If the secret is missing or
// malformed we log once and disable push instead of crashing the server.
function getApp(): App | null {
  if (initTried) return app;
  initTried = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    logger.warn(
      "FIREBASE_SERVICE_ACCOUNT not set — push notifications are disabled",
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });
    logger.info("Firebase Admin initialised (FCM enabled)");
  } catch (err) {
    logger.error({ err }, "Failed to initialise Firebase Admin (FCM disabled)");
    app = null;
  }
  return app;
}

export function isFcmConfigured(): boolean {
  return getApp() !== null;
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Send a push to every device token owned by a user. Expired/invalid tokens are
// pruned from the DB. Never throws — failures are logged only — so callers can
// fire-and-forget without affecting their own request flow.
export async function sendPushToUser(
  userId: number,
  payload: PushPayload,
): Promise<void> {
  const firebaseApp = getApp();
  if (!firebaseApp) return;

  try {
    const rows = await db
      .select({ token: deviceTokensTable.token })
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.userId, userId));
    const tokens = rows.map((r) => r.token);
    if (tokens.length === 0) return;

    // DATA-ONLY message (no `notification` block) so the Android app's
    // OrderMessagingService.onMessageReceived fires even when the app is in the
    // background or killed — that's what starts the native looping alarm
    // (OrderAlarmService) which repeats the alert sound until the vendor stops
    // it manually. Title/body travel inside `data` and are read natively.
    const res = await getMessaging(firebaseApp).sendEachForMulticast({
      tokens,
      data: {
        ...payload.data,
        title: payload.title,
        body: payload.body,
      },
      android: { priority: "high" },
    });

    const stale: string[] = [];
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        stale.push(tokens[i]);
      }
    });
    if (stale.length) {
      await db
        .delete(deviceTokensTable)
        .where(inArray(deviceTokensTable.token, stale));
    }

    logger.info(
      { userId, sent: res.successCount, failed: res.failureCount },
      "FCM push sent",
    );
  } catch (err) {
    logger.error({ err, userId }, "Failed to send FCM push");
  }
}

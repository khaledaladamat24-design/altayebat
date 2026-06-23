import { db, ordersTable, usersTable } from "@workspace/db";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { logger } from "./logger";
import { SUPER_ADMIN_EMAIL } from "./admin-auth";
import { sendPushToUser, isFcmConfigured } from "./fcm";

// A pending order means the vendor hasn't accepted it yet. If a vendor stays
// silent for this long we stop letting the customer wait indefinitely:
//   - Cash-on-delivery (no money moved) → auto-cancel.
//   - Manual prepaid (cliq/iban/ewallet, customer already transferred) → we do
//     NOT cancel; we flag it `awaiting_admin` so a human protects the paid
//     order, and notify the admins.
const EXPIRY_MINUTES = 20;
const TICK_MS = 60_000;
const MANUAL_METHODS = ["cliq", "iban", "ewallet"] as const;

async function notifyAdmins(expired: { id: number }[]): Promise<void> {
  if (!isFcmConfigured() || expired.length === 0) return;
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.role, "admin"),
          eq(usersTable.email, SUPER_ADMIN_EMAIL),
        ),
      );
    for (const order of expired) {
      for (const admin of admins) {
        await sendPushToUser(admin.id, {
          title: "طلب يحتاج تدخّل الإدارة",
          body: `الطلب #${order.id} لم يردّ عليه المطعم خلال ${EXPIRY_MINUTES} دقيقة (دفع مسبق). الرجاء المتابعة.`,
          data: {
            type: "order_awaiting_admin",
            orderId: String(order.id),
          },
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to notify admins of awaiting_admin orders");
  }
}

export async function runOnce(): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60_000);

  // Cash-on-delivery: no money has moved, so a silent vendor just means the
  // order dies. Auto-cancel.
  const cancelled = await db
    .update(ordersTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(ordersTable.status, "pending"),
        eq(ordersTable.paymentMethod, "cod"),
        lt(ordersTable.createdAt, cutoff),
      ),
    )
    .returning({ id: ordersTable.id });

  // Manual prepaid: the customer already transferred money, so cancelling would
  // strand their payment. Hand it to the admins instead.
  const awaiting = await db
    .update(ordersTable)
    .set({ status: "awaiting_admin" })
    .where(
      and(
        eq(ordersTable.status, "pending"),
        inArray(ordersTable.paymentMethod, [...MANUAL_METHODS]),
        lt(ordersTable.createdAt, cutoff),
      ),
    )
    .returning({ id: ordersTable.id });

  if (cancelled.length || awaiting.length) {
    logger.info(
      { cancelled: cancelled.length, awaitingAdmin: awaiting.length },
      "Processed stuck pending orders",
    );
  }

  await notifyAdmins(awaiting);
}

// Periodically sweep stuck pending orders. Fire-and-forget; a failed tick is
// logged and retried on the next interval (so a transient DB hiccup or a server
// restart can't permanently strand an order — it's re-scanned every minute).
export function startOrderExpiryScheduler(): void {
  const tick = () => {
    void runOnce().catch((err) =>
      logger.error({ err }, "Order expiry sweep failed"),
    );
  };
  tick();
  setInterval(tick, TICK_MS);
  logger.info(
    { everyMs: TICK_MS, expiryMinutes: EXPIRY_MINUTES },
    "Order expiry scheduler started",
  );
}

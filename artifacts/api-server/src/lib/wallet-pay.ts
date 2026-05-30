import { db } from "@workspace/db";
import { walletsTable, walletTransactionsTable } from "@workspace/db";
import type { WalletTransaction } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * The transaction client handed to a `db.transaction(async (tx) => …)` callback.
 * The helper below runs every read/write through this client so the wallet
 * deduction commits/rolls back atomically with whatever else the caller does
 * inside the same transaction (e.g. creating the order row).
 */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PayOrderResult =
  | { ok: true; transaction: WalletTransaction; idempotent: boolean }
  | { ok: false; reason: "insufficient" };

/**
 * Deduct an order's total from a user's internal wallet balance.
 *
 * Must be called inside a `db.transaction` so the deduction is atomic with the
 * order creation that triggers it — this is what guarantees a balance order is
 * never "created but uncharged" even if the client's network drops afterwards.
 *
 * - Idempotent per orderId: a second call for the same orderId returns the
 *   existing approved payment without charging again.
 * - Race-safe: the deduction is a conditional UPDATE (`balance >= amount`) so
 *   the balance can never go negative.
 */
export async function payOrderFromWallet(
  tx: DbTx,
  args: {
    userId: number;
    amount: number;
    orderId: number;
    description?: string;
  },
): Promise<PayOrderResult> {
  const { userId, amount, orderId, description } = args;

  // Idempotency: if we already approved a payment for this orderId, return it.
  const [existing] = await tx
    .select()
    .from(walletTransactionsTable)
    .where(
      and(
        eq(walletTransactionsTable.orderId, orderId),
        eq(walletTransactionsTable.userId, userId),
        eq(walletTransactionsTable.type, "payment"),
        eq(walletTransactionsTable.status, "approved"),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: true, transaction: existing, idempotent: true };
  }

  // Ensure a wallet row exists (starts at zero balance).
  await tx
    .insert(walletsTable)
    .values({ userId, balance: "0.000" })
    .onConflictDoNothing({ target: walletsTable.userId });

  // Atomic conditional deduction: only succeeds when balance is sufficient.
  const updated = await tx
    .update(walletsTable)
    .set({
      balance: sql`${walletsTable.balance} - ${String(amount)}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(walletsTable.userId, userId),
        sql`${walletsTable.balance} >= ${String(amount)}`,
      ),
    )
    .returning();
  if (updated.length === 0) {
    return { ok: false, reason: "insufficient" };
  }

  const [txn] = await tx
    .insert(walletTransactionsTable)
    .values({
      userId,
      type: "payment",
      amount: String(amount),
      status: "approved",
      description: description || "دفع طلب",
      orderId,
    })
    .returning();
  return { ok: true, transaction: txn, idempotent: false };
}

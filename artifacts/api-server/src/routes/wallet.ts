import { Router } from "express";
import { db } from "@workspace/db";
import { walletsTable, walletTransactionsTable, usersTable } from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { isAdminReq, requireAdmin } from "../lib/admin-auth";

const router = Router();

/**
 * Auth guard for /wallet/:userId/* — caller must be signed-in via Clerk and
 * the Clerk session must map to the DB user identified by :userId. Admins are
 * allowed through for cross-user access.
 */
async function requireWalletOwner(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = parseInt(String(req.params.userId));
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
    if (isAdminReq(req)) { next(); return; }
    const clerk = getAuth(req);
    const clerkUserId = clerk?.userId;
    if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [u] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.clerkId, clerkUserId)).limit(1);
    if (!u || u.id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    next();
  } catch (err) {
    req.log.error({ err }, "Wallet auth check failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

async function getOrCreateWallet(userId: number) {
  const [existing] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(walletsTable).values({ userId, balance: "0.000" }).returning();
  return created;
}

/* GET /api/wallet/:userId */
router.get("/wallet/:userId", requireWalletOwner, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    const wallet = await getOrCreateWallet(userId);
    const transactions = await db.select().from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.userId, userId))
      .orderBy(desc(walletTransactionsTable.createdAt)).limit(50);
    res.json({
      balance: Number(wallet.balance),
      transactions: transactions.map(t => ({ ...t, amount: Number(t.amount) })),
      platformCliqAlias: process.env.PLATFORM_CLIQ_ALIAS || null,
      platformWalletNumber: process.env.PLATFORM_WALLET_NUMBER || null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch wallet");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/wallet/:userId/topup */
router.post("/wallet/:userId/topup", requireWalletOwner, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    const { amount, paymentMethod, screenshotUrl, description } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) { res.status(400).json({ error: "المبلغ غير صالح" }); return; }
    if (!paymentMethod || !["cliq", "wallet", "cash"].includes(paymentMethod)) {
      res.status(400).json({ error: "طريقة الدفع غير صحيحة" }); return;
    }
    if (paymentMethod !== "cash" && !screenshotUrl) {
      res.status(400).json({ error: "يرجى رفع إيصال التحويل" }); return;
    }
    await getOrCreateWallet(userId);
    const [tx] = await db.insert(walletTransactionsTable).values({
      userId, type: "topup", amount: String(amt), status: "pending",
      description: description || "شحن رصيد المحفظة",
      paymentMethod, screenshotUrl: screenshotUrl || null,
    }).returning();
    res.status(201).json({ ...tx, amount: Number(tx.amount) });
  } catch (err) {
    req.log.error({ err }, "Failed to create top-up request");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/wallet/:userId/pay — atomic deduction for an order.
 * - Uses a conditional UPDATE so concurrent calls cannot overdraw (race-safe).
 * - Idempotent per orderId: a second call for the same orderId returns the
 *   existing approved transaction without double-charging.
 */
router.post("/wallet/:userId/pay", requireWalletOwner, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    const { amount, orderId, description } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
    if (!orderId || typeof orderId !== "number") {
      res.status(400).json({ error: "orderId required for wallet payments" }); return;
    }

    // Idempotency: if we already approved a payment for this orderId, return it.
    const [existing] = await db.select().from(walletTransactionsTable).where(
      and(
        eq(walletTransactionsTable.orderId, orderId),
        eq(walletTransactionsTable.userId, userId),
        eq(walletTransactionsTable.type, "payment"),
        eq(walletTransactionsTable.status, "approved"),
      ),
    ).limit(1);
    if (existing) {
      res.json({ ...existing, amount: Number(existing.amount), idempotent: true });
      return;
    }

    await getOrCreateWallet(userId);

    // Atomic conditional deduction: only succeeds when balance is sufficient.
    const updated = await db.update(walletsTable)
      .set({ balance: sql`${walletsTable.balance} - ${String(amt)}`, updatedAt: new Date() })
      .where(and(
        eq(walletsTable.userId, userId),
        sql`${walletsTable.balance} >= ${String(amt)}`,
      ))
      .returning();
    if (updated.length === 0) {
      res.status(400).json({ error: "الرصيد غير كافٍ" }); return;
    }

    const [txn] = await db.insert(walletTransactionsTable).values({
      userId, type: "payment", amount: String(amt), status: "approved",
      description: description || "دفع طلب", orderId,
    }).returning();
    res.json({ ...txn, amount: Number(txn.amount) });
  } catch (err) {
    req.log.error({ err }, "Failed to deduct from wallet");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── Admin endpoints ── */

router.get("/admin/wallet/transactions", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(walletTransactionsTable).orderBy(desc(walletTransactionsTable.createdAt)).limit(200);
    res.json(rows.map(r => ({ ...r, amount: Number(r.amount) })));
  } catch (err) {
    req.log.error({ err }, "Failed to list wallet transactions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/wallet/transactions/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "Status must be approved or rejected" }); return;
    }
    const updated = await db.transaction(async (tx) => {
      const [txn] = await tx.select().from(walletTransactionsTable).where(eq(walletTransactionsTable.id, id)).limit(1);
      if (!txn) throw new Error("NOT_FOUND");
      if (txn.status !== "pending") throw new Error("ALREADY_PROCESSED");

      if (status === "approved" && txn.type === "topup") {
        await tx.update(walletsTable)
          .set({ balance: sql`${walletsTable.balance} + ${txn.amount}`, updatedAt: new Date() })
          .where(eq(walletsTable.userId, txn.userId));
      }
      const [u] = await tx.update(walletTransactionsTable)
        .set({ status, reviewedAt: new Date() })
        .where(eq(walletTransactionsTable.id, id)).returning();
      return u;
    });
    res.json({ ...updated, amount: Number(updated.amount) });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "NOT_FOUND") { res.status(404).json({ error: "Transaction not found" }); return; }
    if (msg === "ALREADY_PROCESSED") { res.status(400).json({ error: "Transaction already processed" }); return; }
    req.log.error({ err }, "Failed to update wallet transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

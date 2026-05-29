import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, vendorProfilesTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isAdminReq } from "./admin-auth";

export { isAdminReq };

/** Resolve the signed-in Clerk user → DB user id, or null. */
async function getDbUserIdFromClerk(req: Request): Promise<number | null> {
  const clerk = getAuth(req);
  const clerkUserId = clerk?.userId;
  if (!clerkUserId) return null;
  const [u] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId)).limit(1);
  return u?.id ?? null;
}

/**
 * Guard for routes scoped to a vendor by `:id` (or a custom param name).
 * Admins pass through. Otherwise the signed-in Clerk user must own the
 * vendor_profile row identified by the URL param.
 */
export function requireVendorOwner(paramName: string = "id") {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vendorId = parseInt(String(req.params[paramName]));
      if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor id" }); return; }
      if (isAdminReq(req)) { next(); return; }
      const dbUserId = await getDbUserIdFromClerk(req);
      if (!dbUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
      const [v] = await db.select({ userId: vendorProfilesTable.userId })
        .from(vendorProfilesTable).where(eq(vendorProfilesTable.id, vendorId)).limit(1);
      if (!v) { res.status(404).json({ error: "Vendor not found" }); return; }
      if (v.userId !== dbUserId) { res.status(403).json({ error: "Forbidden" }); return; }
      next();
    } catch (err) {
      req.log.error({ err }, "Vendor owner check failed");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

/**
 * Guard for routes scoped to an order by `:id` — caller must own the vendor
 * that owns the order. Admins pass through. Orders without a vendorId
 * (legacy/admin-only) are admin-only.
 */
export function requireOrderVendorOwner(paramName: string = "id") {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = parseInt(String(req.params[paramName]));
      if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }
      if (isAdminReq(req)) { next(); return; }
      const dbUserId = await getDbUserIdFromClerk(req);
      if (!dbUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
      const [row] = await db.select({
        vendorId: ordersTable.vendorId,
        vendorUserId: vendorProfilesTable.userId,
        status: ordersTable.status,
      }).from(ordersTable)
        .leftJoin(vendorProfilesTable, eq(ordersTable.vendorId, vendorProfilesTable.id))
        .where(eq(ordersTable.id, orderId)).limit(1);
      if (!row) { res.status(404).json({ error: "Order not found" }); return; }
      if (row.vendorId === null) { res.status(403).json({ error: "Forbidden" }); return; }
      if (row.vendorUserId !== dbUserId) { res.status(403).json({ error: "Forbidden" }); return; }
      (req as Request & { orderStatus?: string }).orderStatus = row.status;
      next();
    } catch (err) {
      req.log.error({ err }, "Order owner check failed");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

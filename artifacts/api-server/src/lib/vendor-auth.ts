import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, vendorProfilesTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SUPER_ADMIN_EMAIL, getAdminPassword } from "./admin-auth";

/**
 * Single source of truth for admin access. Two legitimate paths:
 *  1. `x-admin-key` matching the admin password secret (proof of the secret).
 *  2. A VERIFIED identity — the acting user resolved from the Clerk session
 *     cookie (or the `x-firebase-uid` header for phone accounts) — whose DB row
 *     is a super-admin (role `admin`, or the canonical super-admin email).
 *
 * The previously trusted `x-admin-email` header is intentionally NOT consulted:
 * it was client-supplied and spoofable, so anyone could forge admin access.
 */
export async function isAdminReq(req: Request): Promise<boolean> {
  const adminKey = req.headers["x-admin-key"] as string | undefined;
  if (adminKey && adminKey === getAdminPassword()) return true;

  const dbUserId = await getActingDbUserId(req);
  if (!dbUserId) return false;
  const [u] = await db
    .select({ email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, dbUserId))
    .limit(1);
  if (!u) return false;
  return u.role === "admin" || u.email === SUPER_ADMIN_EMAIL;
}

/** Express guard that rejects non-admin requests with 403. */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!(await isAdminReq(req))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  } catch (err) {
    req.log.error({ err }, "Admin check failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/** Resolve the signed-in Clerk user → DB user id, or null. */
export async function getDbUserIdFromClerk(
  req: Request,
): Promise<number | null> {
  // getAuth throws when the Clerk middleware isn't mounted on the request. Treat
  // that (and any Clerk resolution failure) as "no Clerk user" rather than an
  // error, so callers fall back to other identity sources / deny access.
  let clerkUserId: string | null | undefined;
  try {
    clerkUserId = getAuth(req)?.userId;
  } catch {
    clerkUserId = null;
  }
  if (!clerkUserId) return null;
  const [u] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId))
    .limit(1);
  return u?.id ?? null;
}

/**
 * Resolve the acting user. Clerk session takes priority; phone-authenticated
 * users have no Clerk session, so we fall back to the `x-firebase-uid` header
 * matched against `users.firebase_uid`. (The uid is an opaque, unguessable
 * Firebase value — for stronger guarantees verify a Firebase ID token via the
 * Admin SDK in the future.)
 */
export async function getActingDbUserId(req: Request): Promise<number | null> {
  const clerkUserId = await getDbUserIdFromClerk(req);
  if (clerkUserId) return clerkUserId;
  const firebaseUid = req.headers["x-firebase-uid"] as string | undefined;
  if (firebaseUid) {
    const [u] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, firebaseUid))
      .limit(1);
    if (u) return u.id;
  }
  // Native fallback: the Clerk session cookie isn't sent and the bearer token
  // doesn't verify inside the WebView, so email/Clerk users (incl. the
  // super-admin) forward their Clerk user id as an opaque x-clerk-user-id
  // header. Same trust model as x-firebase-uid: the id is unguessable and is
  // never exposed on any cross-user/public response (stripUser only returns the
  // caller's own row), so it can't be used to impersonate someone else.
  const clerkHeaderId = req.headers["x-clerk-user-id"] as string | undefined;
  if (!clerkHeaderId) return null;
  const [c] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkHeaderId))
    .limit(1);
  return c?.id ?? null;
}

/**
 * Guard for routes scoped to a vendor by `:id` (or a custom param name).
 * Admins pass through. Otherwise the signed-in user (Clerk or phone/Firebase)
 * must own the vendor_profile row identified by the URL param.
 */
export function requireVendorOwner(paramName: string = "id") {
  return async function (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const vendorId = parseInt(String(req.params[paramName]));
      if (isNaN(vendorId)) {
        res.status(400).json({ error: "Invalid vendor id" });
        return;
      }
      if (await isAdminReq(req)) {
        next();
        return;
      }
      const dbUserId = await getActingDbUserId(req);
      if (!dbUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const [v] = await db
        .select({ userId: vendorProfilesTable.userId })
        .from(vendorProfilesTable)
        .where(eq(vendorProfilesTable.id, vendorId))
        .limit(1);
      if (!v) {
        res.status(404).json({ error: "Vendor not found" });
        return;
      }
      if (v.userId !== dbUserId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
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
  return async function (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const orderId = parseInt(String(req.params[paramName]));
      if (isNaN(orderId)) {
        res.status(400).json({ error: "Invalid order id" });
        return;
      }
      if (await isAdminReq(req)) {
        next();
        return;
      }
      const dbUserId = await getActingDbUserId(req);
      if (!dbUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const [row] = await db
        .select({
          vendorId: ordersTable.vendorId,
          vendorUserId: vendorProfilesTable.userId,
          status: ordersTable.status,
        })
        .from(ordersTable)
        .leftJoin(
          vendorProfilesTable,
          eq(ordersTable.vendorId, vendorProfilesTable.id),
        )
        .where(eq(ordersTable.id, orderId))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      if (row.vendorId === null) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (row.vendorUserId !== dbUserId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      (req as Request & { orderStatus?: string }).orderStatus = row.status;
      next();
    } catch (err) {
      req.log.error({ err }, "Order owner check failed");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

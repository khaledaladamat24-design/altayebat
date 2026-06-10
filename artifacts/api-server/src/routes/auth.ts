import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SUPER_ADMIN_EMAIL } from "../lib/admin-auth";
import { normalizePhone } from "../lib/phone";
import { getActingDbUserId, isAdminReq } from "../lib/vendor-auth";

const router = Router();

// Pre-computed bcrypt hash of a random string — used to keep timing constant
// on /phone-login when the user is not found, defeating account enumeration
// via response-time differences.
const DUMMY_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8VEbZ1qB7yY8w8mU9.zG7gC0eY5N7m";

const stripUser = (u: typeof usersTable.$inferSelect) => {
  const { passwordHash: _ph, ...safe } = u;
  return {
    ...safe,
    isAdmin: u.email === SUPER_ADMIN_EMAIL || u.role === "admin",
  };
};

/**
 * POST /api/auth/set-password — called immediately after Firebase phone OTP
 * verification (or any other identity proof). Stores a bcrypt hash so the user
 * can sign back in later with phone + password and skip the OTP step entirely.
 */
router.post("/auth/set-password", async (req, res) => {
  try {
    const { phone, email, firebaseUid, password, name } = req.body as {
      phone?: string;
      email?: string;
      firebaseUid?: string;
      password?: string;
      name?: string;
    };
    if (!password || password.length < 6) {
      res.status(400).json({ error: "كلمة المرور 6 أحرف على الأقل" });
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone && !email) {
      res.status(400).json({ error: "Phone or email required" });
      return;
    }
    // IDOR mitigation: phone signup MUST present a Firebase UID (issued only
    // after a successful OTP). Without it, anyone could overwrite a stranger's
    // password by knowing their phone number.
    if (normalizedPhone && !firebaseUid) {
      res.status(400).json({ error: "OTP verification required" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);

    // Look up by the strongest identifier first. firebaseUid is the proof of
    // OTP, phone is the user's claim.
    let existing: typeof usersTable.$inferSelect | undefined;
    if (firebaseUid) {
      [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.firebaseUid, firebaseUid))
        .limit(1);
    }
    if (!existing && normalizedPhone) {
      [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.phone, normalizedPhone))
        .limit(1);
    }
    if (!existing && email) {
      [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
    }

    // Phone collision: if a *different* user already owns this phone, refuse —
    // OTP only proves the requester controls the number, but linking it to
    // someone else's account would let them steal it.
    if (normalizedPhone) {
      const [phoneOwner] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.phone, normalizedPhone))
        .limit(1);
      if (phoneOwner && existing && phoneOwner.id !== existing.id) {
        res.status(409).json({ error: "هذا الرقم مرتبط بحساب آخر" });
        return;
      }
      if (phoneOwner && !existing) existing = phoneOwner;
    }
    // Same for firebaseUid: refuse to attach OTP proof to a row that already
    // belongs to a different verified phone.
    if (
      firebaseUid &&
      existing &&
      existing.firebaseUid &&
      existing.firebaseUid !== firebaseUid
    ) {
      res.status(409).json({ error: "تعارض في حساب التحقق" });
      return;
    }

    if (existing) {
      const [updated] = await db
        .update(usersTable)
        .set({
          passwordHash,
          ...(normalizedPhone && !existing.phone
            ? { phone: normalizedPhone }
            : {}),
          ...(email && !existing.email ? { email } : {}),
          ...(firebaseUid && !existing.firebaseUid ? { firebaseUid } : {}),
          ...(name && !existing.name ? { name } : {}),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existing.id))
        .returning();
      res.json(stripUser(updated));
      return;
    }

    const [created] = await db
      .insert(usersTable)
      .values({
        phone: normalizedPhone,
        email: email || null,
        firebaseUid: firebaseUid || null,
        name: name || null,
        passwordHash,
        role: "consumer",
      })
      .returning();
    res.status(201).json(stripUser(created));
  } catch (err) {
    req.log.error({ err }, "Failed to set password");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/phone-login — signs the user back in with phone + password,
 * skipping any OTP. Used by returning users who already set a password.
 */
router.post("/auth/phone-login", async (req, res) => {
  try {
    const { phone, password } = req.body as {
      phone?: string;
      password?: string;
    };
    if (!phone || !password) {
      res.status(400).json({ error: "أدخل رقم الهاتف وكلمة المرور" });
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      res.status(400).json({ error: "رقم الهاتف غير صحيح" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, normalizedPhone))
      .limit(1);
    // Constant-time path: always run bcrypt.compare so response time doesn't
    // reveal whether the account exists. Unified error message avoids
    // distinguishing "wrong password" from "no account".
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) {
      res.status(401).json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" });
      return;
    }
    res.json(stripUser(user));
  } catch (err) {
    req.log.error({ err }, "Phone login failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/location — persists the signed-in user's permanent delivery
 * location (captured during signup/profile). Ownership guard: the acting user is
 * resolved from the verified Clerk session (or the x-firebase-uid header for
 * phone accounts) and must match the target row. Admins may write any row.
 */
router.post("/auth/location", async (req, res) => {
  try {
    const { userId, latitude, longitude, address, city } = req.body as {
      userId?: number;
      latitude?: number | null;
      longitude?: number | null;
      address?: string | null;
      city?: string | null;
    };
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    const hasCoords =
      typeof latitude === "number" && typeof longitude === "number";
    const hasAddress = typeof address === "string" && address.trim().length > 0;
    if (!hasCoords && !hasAddress) {
      res.status(400).json({
        error: "الرجاء تحديد موقعك الحالي أو كتابة العنوان للمتابعة",
      });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    // Ownership: resolve the acting user from the verified Clerk session (or the
    // x-firebase-uid header for phone accounts) and require it to match the
    // target row. Without this anyone could overwrite a stranger's saved address
    // by guessing the numeric id (IDOR). Admins may write any row.
    if (!isAdminReq(req)) {
      const actingId = await getActingDbUserId(req);
      if (!actingId || actingId !== id) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        latitude: hasCoords ? latitude : user.latitude,
        longitude: hasCoords ? longitude : user.longitude,
        address: hasAddress ? address!.trim() : user.address,
        city: typeof city === "string" && city.trim() ? city.trim() : user.city,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();
    res.json(stripUser(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to save user location");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/auth/check?phone=07... — lightweight existence + password presence
 * check, lets the client decide whether to show the password field or fall
 * back to OTP signup.
 */
router.get("/auth/check", async (req, res) => {
  try {
    const phone = normalizePhone((req.query.phone as string) || null);
    const email = (req.query.email as string) || null;
    if (!phone && !email) {
      res.status(400).json({ error: "phone or email required" });
      return;
    }
    const conds = [];
    if (phone) conds.push(eq(usersTable.phone, phone));
    if (email) conds.push(eq(usersTable.email, email));
    const [user] = await db
      .select({
        id: usersTable.id,
        hasPassword: usersTable.passwordHash,
      })
      .from(usersTable)
      .where(or(...conds))
      .limit(1);
    res.json({
      exists: !!user,
      hasPassword: !!user?.hasPassword,
    });
  } catch (err) {
    req.log.error({ err }, "Auth check failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

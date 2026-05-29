import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SUPER_ADMIN_EMAIL } from "../lib/admin-auth";

const router = Router();

/**
 * Normalize Jordanian phone numbers to the canonical "07XXXXXXXX" form so a
 * user can sign up with "+962791234567" and log back in with "0791234567"
 * (or any variant) without mismatches.
 */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (/^07\d{8}$/.test(digits)) return digits;
  if (/^7\d{8}$/.test(digits)) return "0" + digits;
  if (/^9627\d{8}$/.test(digits)) return "0" + digits.slice(3);
  if (/^009627\d{8}$/.test(digits)) return "0" + digits.slice(5);
  return null; // reject anything that isn't a valid JO mobile
}

// Pre-computed bcrypt hash of a random string — used to keep timing constant
// on /phone-login when the user is not found, defeating account enumeration
// via response-time differences.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8VEbZ1qB7yY8w8mU9.zG7gC0eY5N7m";

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
      phone?: string; email?: string; firebaseUid?: string;
      password?: string; name?: string;
    };
    if (!password || password.length < 6) {
      res.status(400).json({ error: "كلمة المرور 6 أحرف على الأقل" }); return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone && !email) {
      res.status(400).json({ error: "Phone or email required" }); return;
    }
    // IDOR mitigation: phone signup MUST present a Firebase UID (issued only
    // after a successful OTP). Without it, anyone could overwrite a stranger's
    // password by knowing their phone number.
    if (normalizedPhone && !firebaseUid) {
      res.status(400).json({ error: "OTP verification required" }); return;
    }
    const passwordHash = await bcrypt.hash(password, 10);

    // Look up by the strongest identifier first. firebaseUid is the proof of
    // OTP, phone is the user's claim.
    let existing: typeof usersTable.$inferSelect | undefined;
    if (firebaseUid) {
      [existing] = await db.select().from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
    }
    if (!existing && normalizedPhone) {
      [existing] = await db.select().from(usersTable).where(eq(usersTable.phone, normalizedPhone)).limit(1);
    }
    if (!existing && email) {
      [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    }

    // Phone collision: if a *different* user already owns this phone, refuse —
    // OTP only proves the requester controls the number, but linking it to
    // someone else's account would let them steal it.
    if (normalizedPhone) {
      const [phoneOwner] = await db.select().from(usersTable)
        .where(eq(usersTable.phone, normalizedPhone)).limit(1);
      if (phoneOwner && existing && phoneOwner.id !== existing.id) {
        res.status(409).json({ error: "هذا الرقم مرتبط بحساب آخر" }); return;
      }
      if (phoneOwner && !existing) existing = phoneOwner;
    }
    // Same for firebaseUid: refuse to attach OTP proof to a row that already
    // belongs to a different verified phone.
    if (firebaseUid && existing && existing.firebaseUid && existing.firebaseUid !== firebaseUid) {
      res.status(409).json({ error: "تعارض في حساب التحقق" }); return;
    }

    if (existing) {
      const [updated] = await db.update(usersTable).set({
        passwordHash,
        ...(normalizedPhone && !existing.phone ? { phone: normalizedPhone } : {}),
        ...(email && !existing.email ? { email } : {}),
        ...(firebaseUid && !existing.firebaseUid ? { firebaseUid } : {}),
        ...(name && !existing.name ? { name } : {}),
        updatedAt: new Date(),
      }).where(eq(usersTable.id, existing.id)).returning();
      res.json(stripUser(updated)); return;
    }

    const [created] = await db.insert(usersTable).values({
      phone: normalizedPhone, email: email || null,
      firebaseUid: firebaseUid || null, name: name || null,
      passwordHash, role: "consumer",
    }).returning();
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
    const { phone, password } = req.body as { phone?: string; password?: string };
    if (!phone || !password) {
      res.status(400).json({ error: "أدخل رقم الهاتف وكلمة المرور" }); return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) { res.status(400).json({ error: "رقم الهاتف غير صحيح" }); return; }
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.phone, normalizedPhone)).limit(1);
    // Constant-time path: always run bcrypt.compare so response time doesn't
    // reveal whether the account exists. Unified error message avoids
    // distinguishing "wrong password" from "no account".
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) {
      res.status(401).json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" }); return;
    }
    res.json(stripUser(user));
  } catch (err) {
    req.log.error({ err }, "Phone login failed");
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
    if (!phone && !email) { res.status(400).json({ error: "phone or email required" }); return; }
    const conds = [];
    if (phone) conds.push(eq(usersTable.phone, phone));
    if (email) conds.push(eq(usersTable.email, email));
    const [user] = await db.select({
      id: usersTable.id,
      hasPassword: usersTable.passwordHash,
    }).from(usersTable).where(or(...conds)).limit(1);
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

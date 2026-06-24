import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { SUPER_ADMIN_EMAIL } from "../lib/admin-auth";

const router = Router();

type UserRow = typeof usersTable.$inferSelect;

// Strip sensitive identity fields before sending a user to the client.
// `passwordHash` must never leave the server. Neither `firebaseUid` nor
// `clerkId` may be exposed here: both are trusted as fallback identity headers
// (x-firebase-uid / x-clerk-user-id) by the vendor/order/admin guards, so
// leaking either on a public/enumerable endpoint would let anyone impersonate
// that user (incl. the super-admin). They are only ever returned to the owner's
// own row via stripUser on the authenticated auth routes.
function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    name: u.name,
    role: u.role,
    authMethod: u.authMethod,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    isAdmin: u.email === SUPER_ADMIN_EMAIL || u.role === "admin",
  };
}

router.get("/users/profile", async (req, res) => {
  try {
    const { clerkId, firebaseUid, email, phone } = req.query as Record<
      string,
      string
    >;
    if (!clerkId && !firebaseUid && !email && !phone) {
      return res.status(400).json({ error: "Identifier required" });
    }
    let user = null;
    if (clerkId) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkId, clerkId))
        .limit(1);
    } else if (firebaseUid) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.firebaseUid, firebaseUid))
        .limit(1);
    } else if (email) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
    } else if (phone) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.phone, phone))
        .limit(1);
    }
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(publicUser(user));
  } catch (err) {
    req.log.error({ err }, "Failed to get user profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/profile", async (req, res) => {
  try {
    const { clerkId, firebaseUid, email, phone, name, role, authMethod } =
      req.body;
    if (!email && !phone)
      return res.status(400).json({ error: "Email or phone required" });

    const resolvedRole =
      email === SUPER_ADMIN_EMAIL ? "admin" : role || "consumer";

    // Resolve an existing row by ANY supplied identifier (not exclusively): an
    // email account created before clerkId existed must still be found by email
    // so we can backfill its clerkId, instead of inserting a duplicate row.
    let existing: UserRow | null = null;
    if (clerkId) {
      const [row] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkId, clerkId))
        .limit(1);
      existing = row ?? null;
    }
    if (!existing && firebaseUid) {
      const [row] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.firebaseUid, firebaseUid))
        .limit(1);
      existing = row ?? null;
    }
    if (!existing && email) {
      const [row] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      existing = row ?? null;
    }

    if (existing) {
      // Non-downgrade guard: routine login/upsert flows send `role:"consumer"`,
      // so without this an existing vendor/admin would be silently demoted to
      // consumer on every sign-in (wrong routing, lost dashboard). Never lower
      // an established vendor/admin here; role is only ever ELEVATED, either via
      // the explicit role-selection submit or the super-admin email.
      const effectiveRole =
        email === SUPER_ADMIN_EMAIL
          ? "admin"
          : existing.role === "admin" || existing.role === "vendor"
            ? existing.role
            : resolvedRole;
      const [updated] = await db
        .update(usersTable)
        .set({
          ...(name && { name }),
          ...(role && { role: effectiveRole }),
          ...(phone && { phone }),
          // Only set on the role-selection submit; marks the user onboarded so
          // returning logins skip the role screen.
          ...(authMethod && { authMethod }),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existing.id))
        .returning();
      // Backfill clerkId ONLY while the row still has none — never overwrite an
      // existing one. clerkId is trusted as an opaque identity header
      // (x-clerk-user-id) by the vendor/order/admin guards, so letting this
      // public endpoint reassign a populated clerkId would allow account
      // takeover. The `isNull` guard in the WHERE makes "first write wins"
      // atomic, so two concurrent claims can't both succeed (publicUser strips
      // clerkId anyway, so the stale `updated` value here is never returned).
      if (clerkId && !existing.clerkId) {
        await db
          .update(usersTable)
          .set({ clerkId })
          .where(
            and(eq(usersTable.id, existing.id), isNull(usersTable.clerkId)),
          );
      }
      // Backfill firebaseUid the same way (e.g. a Google sign-in whose email
      // already has a row): without this the matched row keeps a null
      // firebase_uid, so the x-firebase-uid identity header never resolves and
      // owner-gated routes (e.g. POST /auth/location) 403 "Not authorized".
      // isNull-guarded so it's first-write-wins and never overwrites an
      // existing uid; firebaseUid is stripped from public responses.
      if (firebaseUid && !existing.firebaseUid) {
        await db
          .update(usersTable)
          .set({ firebaseUid })
          .where(
            and(eq(usersTable.id, existing.id), isNull(usersTable.firebaseUid)),
          );
      }
      return res.json(publicUser(updated));
    }

    const [newUser] = await db
      .insert(usersTable)
      .values({
        clerkId: clerkId || null,
        firebaseUid: firebaseUid || null,
        email: email || null,
        phone: phone || null,
        name: name || null,
        role: resolvedRole,
        authMethod: authMethod || null,
      })
      .returning();

    return res.status(201).json(publicUser(newUser));
  } catch (err) {
    req.log.error({ err }, "Failed to upsert user profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await db
      .select()
      .from(usersTable)
      .orderBy(usersTable.createdAt);
    res.json(users.map(publicUser));
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { name, email, phone } = req.body;
    const [updated] = await db
      .update(usersTable)
      .set({
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "User not found" });
    return res.json(publicUser(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(usersTable).where(eq(usersTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

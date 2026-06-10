import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SUPER_ADMIN_EMAIL } from "../lib/admin-auth";

const router = Router();

type UserRow = typeof usersTable.$inferSelect;

// Strip sensitive identity fields before sending a user to the client.
// `passwordHash` must never leave the server, and `firebaseUid` must not be
// exposed: it is trusted as a fallback identity header by the vendor/order
// guards, so leaking it would enable impersonation.
function publicUser(u: UserRow) {
  return {
    id: u.id,
    clerkId: u.clerkId,
    email: u.email,
    phone: u.phone,
    name: u.name,
    role: u.role,
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
    const { clerkId, firebaseUid, email, phone, name, role } = req.body;
    if (!email && !phone)
      return res.status(400).json({ error: "Email or phone required" });

    const resolvedRole =
      email === SUPER_ADMIN_EMAIL ? "admin" : role || "consumer";

    let existing = null;
    if (clerkId) {
      [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkId, clerkId))
        .limit(1);
    } else if (firebaseUid) {
      [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.firebaseUid, firebaseUid))
        .limit(1);
    } else if (email) {
      [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
    }

    if (existing) {
      const [updated] = await db
        .update(usersTable)
        .set({
          ...(name && { name }),
          ...(role && { role: resolvedRole }),
          ...(phone && { phone }),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existing.id))
        .returning();
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

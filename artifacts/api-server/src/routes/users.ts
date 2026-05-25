import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const SUPER_ADMIN_EMAIL = "khaledaladamat24@gmail.com";

router.get("/users/profile", async (req, res) => {
  try {
    const { clerkId, firebaseUid, email, phone } = req.query as Record<string, string>;
    if (!clerkId && !firebaseUid && !email && !phone) {
      return res.status(400).json({ error: "Identifier required" });
    }
    let user = null;
    if (clerkId) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    } else if (firebaseUid) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
    } else if (email) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    } else if (phone) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    }
    if (!user) return res.status(404).json({ error: "User not found" });
    const isAdmin = user.email === SUPER_ADMIN_EMAIL || user.role === "admin";
    res.json({ ...user, isAdmin });
  } catch (err) {
    req.log.error({ err }, "Failed to get user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/profile", async (req, res) => {
  try {
    const { clerkId, firebaseUid, email, phone, name, role } = req.body;
    if (!email && !phone) return res.status(400).json({ error: "Email or phone required" });

    const resolvedRole = email === SUPER_ADMIN_EMAIL ? "admin" : (role || "consumer");

    let existing = null;
    if (clerkId) {
      [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    } else if (firebaseUid) {
      [existing] = await db.select().from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
    } else if (email) {
      [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    }

    if (existing) {
      const [updated] = await db.update(usersTable).set({
        ...(name && { name }),
        ...(role && { role: resolvedRole }),
        ...(phone && { phone }),
        updatedAt: new Date(),
      }).where(eq(usersTable.id, existing.id)).returning();
      return res.json({ ...updated, isAdmin: updated.email === SUPER_ADMIN_EMAIL || updated.role === "admin" });
    }

    const [newUser] = await db.insert(usersTable).values({
      clerkId: clerkId || null,
      firebaseUid: firebaseUid || null,
      email: email || null,
      phone: phone || null,
      name: name || null,
      role: resolvedRole,
    }).returning();

    res.status(201).json({ ...newUser, isAdmin: newUser.email === SUPER_ADMIN_EMAIL || newUser.role === "admin" });
  } catch (err) {
    req.log.error({ err }, "Failed to upsert user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json(users.map(u => ({ ...u, isAdmin: u.email === SUPER_ADMIN_EMAIL || u.role === "admin" })));
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

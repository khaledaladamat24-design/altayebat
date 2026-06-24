import {
  pgTable,
  serial,
  text,
  timestamp,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").unique(),
  firebaseUid: text("firebase_uid").unique(),
  email: text("email"),
  phone: text("phone"),
  name: text("name"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("consumer"),
  // How the user signed in (google | phone | email). NULL means the user has
  // NOT yet completed the role-selection screen — the client uses this as the
  // "has chosen a role" signal to force new users through /register exactly once.
  authMethod: text("auth_method"),
  // Permanent delivery location captured during signup/profile. Used to
  // auto-populate checkout and to scope search by the buyer's city.
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  address: text("address"),
  city: text("city"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Tiny key-value marker table for one-time startup jobs (e.g. demo-product
// seeding). A job checks its flag, runs once, then writes the flag — so a
// later manual deletion of the seeded rows is never undone on restart.
export const appFlagsTable = pgTable("app_flags", {
  key: text("key").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AppFlag = typeof appFlagsTable.$inferSelect;

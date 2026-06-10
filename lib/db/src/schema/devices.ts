import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per device/installation token. A user (vendor) may have several
// devices, so tokens are keyed by user but the token itself is unique (a token
// can only belong to one user at a time — re-registration moves it).
export const deviceTokensTable = pgTable(
  "device_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("device_tokens_token_uniq").on(t.token),
    index("device_tokens_user_idx").on(t.userId),
  ],
);

export const insertDeviceTokenSchema = createInsertSchema(
  deviceTokensTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeviceToken = z.infer<typeof insertDeviceTokenSchema>;
export type DeviceToken = typeof deviceTokensTable.$inferSelect;

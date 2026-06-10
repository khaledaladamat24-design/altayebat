import {
  pgTable,
  serial,
  text,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deliveryProvidersTable = pgTable("delivery_providers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  type: text("type").notNull().default("manual"),
  baseUrl: text("base_url"),
  enabled: boolean("enabled").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  contactPhone: text("contact_phone"),
  contactWhatsapp: text("contact_whatsapp"),
  credentials: jsonb("credentials")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  settings: jsonb("settings")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDeliveryProviderSchema = createInsertSchema(
  deliveryProvidersTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeliveryProvider = z.infer<
  typeof insertDeliveryProviderSchema
>;
export type DeliveryProvider = typeof deliveryProvidersTable.$inferSelect;

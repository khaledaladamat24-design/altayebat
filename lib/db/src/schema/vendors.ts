import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorProfilesTable = pgTable("vendor_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  storeName: text("store_name").notNull(),
  storeNameAr: text("store_name_ar"),
  category: text("category").notNull(),
  description: text("description"),
  phone: text("phone"),
  city: text("city"),
  cliqAlias: text("cliq_alias"),
  walletNumber: text("wallet_number"),
  bankAccount: text("bank_account"),
  deliveryFeeFixed: text("delivery_fee_fixed").default("1.500"),
  deliveryZones: text("delivery_zones"),
  freeDeliveryAbove: text("free_delivery_above").default("20.000"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVendorProfileSchema = createInsertSchema(vendorProfilesTable).omit({ id: true, createdAt: true });
export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type VendorProfile = typeof vendorProfilesTable.$inferSelect;

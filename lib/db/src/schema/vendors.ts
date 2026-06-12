import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
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
  isOnline: boolean("is_online").notNull().default(true),
  // Fulfillment options the vendor offers. Customers only see methods the
  // vendor has enabled. Both default to true so existing vendors keep delivery.
  pickupEnabled: boolean("pickup_enabled").notNull().default(true),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
  status: text("status").notNull().default("pending"),
  // Marks when the vendor last tapped "تصفير الوردية" (close shift). The vendor
  // dashboard's live view shows only orders created at/after this instant, so a
  // reset starts the new shift with an empty screen WITHOUT deleting or
  // cancelling any past order — all history stays in the DB and is reachable via
  // the dashboard's date filter. Null = never reset (show all).
  shiftResetAt: timestamp("shift_reset_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVendorProfileSchema = createInsertSchema(
  vendorProfilesTable,
).omit({ id: true, createdAt: true });
export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type VendorProfile = typeof vendorProfilesTable.$inferSelect;

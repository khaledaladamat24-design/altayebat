import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Per-vendor promotional ads shown on the vendor storefront page. One image
// per ad, image-only (no video). The server caps each vendor at 10 ads.
export const vendorAdsTable = pgTable(
  "vendor_ads",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    imageUrl: text("image_url").notNull(),
    title: text("title"),
    titleAr: text("title_ar"),
    linkUrl: text("link_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("vendor_ads_vendor_idx").on(table.vendorId)],
);

export const insertVendorAdSchema = createInsertSchema(vendorAdsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertVendorAd = z.infer<typeof insertVendorAdSchema>;
export type VendorAd = typeof vendorAdsTable.$inferSelect;

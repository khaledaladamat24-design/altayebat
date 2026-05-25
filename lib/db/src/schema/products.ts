import { pgTable, serial, text, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  description: text("description"),
  descriptionAr: text("description_ar"),
  price: numeric("price", { precision: 10, scale: 3 }).notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 3 }),
  imageUrl: text("image_url"),
  categoryId: integer("category_id").notNull(),
  inStock: boolean("in_stock").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  isBestseller: boolean("is_bestseller").notNull().default(false),
  isKeto: boolean("is_keto").notNull().default(false),
  isOrganic: boolean("is_organic").notNull().default(false),
  weightOrVolume: text("weight_or_volume"),
  rating: numeric("rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").notNull().default(0),
  calories: integer("calories"),
  protein: numeric("protein", { precision: 6, scale: 2 }),
  carbs: numeric("carbs", { precision: 6, scale: 2 }),
  fats: numeric("fats", { precision: 6, scale: 2 }),
  vendorId: integer("vendor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

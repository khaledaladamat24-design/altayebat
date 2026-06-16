import {
  pgTable,
  serial,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per (product, user): a customer's single star rating for a meal.
// Aggregate average + count are mirrored onto products.rating / reviewCount so
// product responses need no extra joins. Only customers with a delivered order
// containing the product may write a rating (enforced in the route handler).
export const productRatingsTable = pgTable(
  "product_ratings",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull(),
    userId: integer("user_id").notNull(),
    stars: integer("stars").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    productUserUniq: uniqueIndex("product_ratings_product_user_uniq").on(
      t.productId,
      t.userId,
    ),
  }),
);

export const insertProductRatingSchema = createInsertSchema(
  productRatingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductRating = z.infer<typeof insertProductRatingSchema>;
export type ProductRating = typeof productRatingsTable.$inferSelect;

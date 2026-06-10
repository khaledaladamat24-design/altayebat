import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id"),
  userId: integer("user_id"),
  vendorId: integer("vendor_id"),
  status: text("status").notNull().default("pending"),
  // How the customer receives the order: 'delivery' (vendor delivers, fee
  // applies) or 'pickup' (customer collects from the vendor, no fee).
  fulfillmentType: text("fulfillment_type").notNull().default("delivery"),
  paymentMethod: text("payment_method").notNull().default("cod"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentScreenshotUrl: text("payment_screenshot_url"),
  subtotal: numeric("subtotal", { precision: 10, scale: 3 }).notNull(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 3 })
    .notNull()
    .default("1.500"),
  total: numeric("total", { precision: 10, scale: 3 }).notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  notes: text("notes"),
  estimatedDelivery: text("estimated_delivery"),
  deliveryProviderId: integer("delivery_provider_id"),
  deliveryTrackingNumber: text("delivery_tracking_number"),
  deliveryAwbUrl: text("delivery_awb_url"),
  deliveryStatus: text("delivery_status"),
  deliveryShippedAt: timestamp("delivery_shipped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 3 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 3 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
});
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;

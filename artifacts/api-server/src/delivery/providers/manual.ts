import { randomBytes } from "node:crypto";
import type { DeliveryAdapter } from "../types";

/**
 * "Manual" adapter — no external API. Used when the merchant ships orders
 * themselves or hands them off out-of-band. Generates a local tracking number
 * so the order still has something to display.
 */
export const manualAdapter: DeliveryAdapter = {
  type: "manual",
  isConfigured: () => true,
  requiredCredentials: () => [],
  async createShipment(_provider, { order }) {
    const tn = `MAN-${order.id}-${randomBytes(3).toString("hex").toUpperCase()}`;
    return { trackingNumber: tn, status: "pending" };
  },
  async trackShipment(_provider, trackingNumber) {
    return {
      status: "manual",
      statusAr: "تسليم يدوي",
      history: [{ at: new Date().toISOString(), label: trackingNumber }],
    };
  },
};

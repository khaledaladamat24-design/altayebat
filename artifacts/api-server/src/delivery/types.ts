import type { DeliveryProvider, Order } from "@workspace/db";

export interface ShipmentInput {
  order: Order;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientCity?: string | null;
  totalCod: number;
  notes?: string | null;
}

export interface ShipmentResult {
  trackingNumber: string;
  awbUrl?: string | null;
  status?: string | null;
  raw?: unknown;
}

export interface TrackResult {
  status: string;
  statusAr?: string | null;
  history?: Array<{ at: string; label: string }>;
  raw?: unknown;
}

export interface DeliveryAdapter {
  readonly type: string;
  /** True when the configured credentials/settings look sufficient to make a real API call. */
  isConfigured(provider: DeliveryProvider): boolean;
  /** Required credential keys + human-readable labels (Arabic) for the admin UI. */
  requiredCredentials(): Array<{
    key: string;
    label: string;
    placeholder?: string;
  }>;
  createShipment(
    provider: DeliveryProvider,
    input: ShipmentInput,
  ): Promise<ShipmentResult>;
  trackShipment(
    provider: DeliveryProvider,
    trackingNumber: string,
  ): Promise<TrackResult>;
  cancelShipment?(
    provider: DeliveryProvider,
    trackingNumber: string,
  ): Promise<void>;
}

export class DeliveryNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(`Delivery provider "${providerName}" is not fully configured yet.`);
    this.name = "DeliveryNotConfiguredError";
  }
}

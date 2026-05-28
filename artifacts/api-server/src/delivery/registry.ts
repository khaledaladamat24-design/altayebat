import type { DeliveryAdapter } from "./types";
import { manualAdapter } from "./providers/manual";
import {
  aramexAdapter, logixAdapter, joeysAdapter, jedsAdapter,
  talabatAdapter, dhlAdapter, customAdapter,
} from "./providers/stub";

const adapters: Record<string, DeliveryAdapter> = {
  manual: manualAdapter,
  aramex: aramexAdapter,
  logix: logixAdapter,
  joeys: joeysAdapter,
  jeds: jedsAdapter,
  talabat: talabatAdapter,
  dhl: dhlAdapter,
  custom: customAdapter,
};

export function getAdapter(type: string): DeliveryAdapter | null {
  return adapters[type] ?? null;
}

export function listAdapterTypes() {
  return Object.values(adapters).map(a => ({
    type: a.type,
    requiredCredentials: a.requiredCredentials(),
  }));
}

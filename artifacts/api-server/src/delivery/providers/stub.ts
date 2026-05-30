import type { DeliveryProvider } from "@workspace/db";
import type { DeliveryAdapter } from "../types";
import { DeliveryNotConfiguredError } from "../types";

type CredKey = { key: string; label: string; placeholder?: string };

/**
 * Optional, uniform "void/cancel endpoint" credential appended to every
 * carrier's form. Once a merchant signs the carrier contract they paste the
 * carrier's documented void/cancel URL here (supports a `{tn}` placeholder for
 * the tracking number). It is intentionally NOT part of the required keys, so
 * it never blocks createShipment/trackShipment configuration.
 */
const CANCEL_URL_KEY: CredKey = {
  key: "cancelUrl",
  label: "Endpoint إلغاء/إبطال الشحنة (use {tn} for tracking number)",
  placeholder: "https://api.carrier.com/v1/shipments/{tn}/cancel",
};

/**
 * Resolve the carrier's void/cancel endpoint from the provider's stored
 * credentials (preferred) or settings. Returns null when none is configured.
 * A `{tn}` placeholder is replaced with the URL-encoded tracking number.
 */
function resolveCancelUrl(
  provider: DeliveryProvider,
  trackingNumber: string,
): string | null {
  const fromCreds = provider.credentials?.cancelUrl;
  const fromSettings =
    typeof provider.settings?.cancelUrl === "string"
      ? (provider.settings.cancelUrl as string)
      : undefined;
  const raw = (fromCreds || fromSettings || "").trim();
  if (!raw) return null;
  return raw.includes("{tn}")
    ? raw.replace(/\{tn\}/g, encodeURIComponent(trackingNumber))
    : raw;
}

/**
 * Build an Authorization header from whatever credentials the provider has.
 * Covers the auth styles used by the pre-baked carriers: bearer token
 * (`apiKey`), basic key+secret (`apiKey`/`apiSecret`), and basic
 * username+password (Aramex-style).
 */
function buildAuthHeaders(
  creds: Record<string, string>,
): Record<string, string> {
  if (creds.apiKey && creds.apiSecret) {
    const basic = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString(
      "base64",
    );
    return { authorization: `Basic ${basic}` };
  }
  if (creds.apiKey) {
    return { authorization: `Bearer ${creds.apiKey}` };
  }
  if (creds.username && creds.password) {
    const basic = Buffer.from(`${creds.username}:${creds.password}`).toString(
      "base64",
    );
    return { authorization: `Basic ${basic}` };
  }
  return {};
}

/**
 * Real carrier void/cancel call shared by every pre-baked + custom adapter.
 *
 * Throws `DeliveryNotConfiguredError` (→ route maps to 400 { notConfigured })
 * when the provider lacks its required credentials OR has no cancel endpoint
 * wired yet, so an un-contracted carrier can't silently pretend to void.
 *
 * On a reachable-but-rejecting carrier (non-2xx) it throws a plain Error, which
 * the route surfaces as a logged 500 and leaves the order's shipment intact.
 */
async function httpCancelShipment(
  provider: DeliveryProvider,
  trackingNumber: string,
  isConfigured: (p: DeliveryProvider) => boolean,
): Promise<void> {
  const name = provider.nameAr || provider.name;
  if (!isConfigured(provider)) {
    throw new DeliveryNotConfiguredError(name);
  }
  const url = resolveCancelUrl(provider, trackingNumber);
  if (!url) {
    throw new DeliveryNotConfiguredError(name);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...buildAuthHeaders(provider.credentials ?? {}),
    },
    body: JSON.stringify({ trackingNumber }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Carrier "${name}" rejected cancel for ${trackingNumber} (HTTP ${res.status})` +
        (detail ? `: ${detail.slice(0, 300)}` : ""),
    );
  }
}

/** Build a stub adapter for a named provider until credentials are wired. */
export function makeStubAdapter(
  type: string,
  requiredKeys: CredKey[],
): DeliveryAdapter {
  const adapter: DeliveryAdapter = {
    type,
    isConfigured(provider) {
      return requiredKeys.every((k) => Boolean(provider.credentials?.[k.key]));
    },
    // The cancel endpoint is offered on every carrier's form but is optional,
    // so it never gates create/track configuration.
    requiredCredentials: () => [...requiredKeys, CANCEL_URL_KEY],
    async createShipment(provider) {
      throw new DeliveryNotConfiguredError(provider.nameAr || provider.name);
    },
    async trackShipment(provider) {
      throw new DeliveryNotConfiguredError(provider.nameAr || provider.name);
    },
    async cancelShipment(provider, trackingNumber) {
      return httpCancelShipment(provider, trackingNumber, adapter.isConfigured);
    },
  };
  return adapter;
}

// Real API integration for each of these is left as a thin replacement of the
// `createShipment` / `trackShipment` methods once the merchant signs a contract
// and obtains the credentials listed in `requiredCredentials`. `cancelShipment`
// is already wired generically: set the carrier's documented void/cancel
// endpoint (`cancelUrl`) on the provider and it performs a real authenticated
// HTTP call to void the AWB.
export const aramexAdapter = makeStubAdapter("aramex", [
  {
    key: "accountNumber",
    label: "رقم الحساب (Account Number)",
    placeholder: "20016",
  },
  { key: "accountPin", label: "رقم PIN", placeholder: "331421" },
  { key: "username", label: "اسم المستخدم (Email)" },
  { key: "password", label: "كلمة السر" },
  { key: "accountEntity", label: "كيان الحساب (Entity)", placeholder: "AMM" },
  { key: "accountCountryCode", label: "رمز الدولة", placeholder: "JO" },
]);

export const logixAdapter = makeStubAdapter("logix", [
  { key: "apiKey", label: "مفتاح API" },
  { key: "merchantId", label: "رقم التاجر" },
]);

export const joeysAdapter = makeStubAdapter("joeys", [
  { key: "apiKey", label: "مفتاح API" },
  { key: "merchantId", label: "رقم التاجر" },
]);

export const jedsAdapter = makeStubAdapter("jeds", [
  { key: "apiKey", label: "مفتاح API" },
  { key: "accountId", label: "رقم الحساب" },
]);

export const talabatAdapter = makeStubAdapter("talabat", [
  { key: "clientId", label: "Client ID" },
  { key: "clientSecret", label: "Client Secret" },
  { key: "branchId", label: "رقم الفرع" },
]);

export const dhlAdapter = makeStubAdapter("dhl", [
  { key: "apiKey", label: "API Key" },
  { key: "apiSecret", label: "API Secret" },
  { key: "accountNumber", label: "رقم الحساب" },
]);

/** Fully custom HTTP endpoint — useful for in-house drivers app or any company we haven't pre-baked. */
export const customAdapter = makeStubAdapter("custom", [
  { key: "apiKey", label: "مفتاح API / Token" },
  { key: "createUrl", label: "Endpoint إنشاء شحنة (POST)" },
  {
    key: "trackUrl",
    label: "Endpoint تتبع (GET, use {tn} for tracking number)",
  },
]);

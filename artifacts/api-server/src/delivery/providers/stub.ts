import type { DeliveryProvider } from "@workspace/db";
import type {
  DeliveryAdapter,
  ShipmentInput,
  ShipmentResult,
  TrackResult,
} from "../types";
import { DeliveryNotConfiguredError } from "../types";

type CredKey = { key: string; label: string; placeholder?: string };

/**
 * Optional, uniform "create shipment endpoint" credential appended to every
 * pre-baked carrier's form. Once a merchant signs the carrier contract they
 * paste the carrier's documented create/book URL here. It is intentionally NOT
 * part of the required keys for pre-baked carriers (the `custom` adapter lists
 * it as required), so it never blocks the rest of the configuration.
 */
const CREATE_URL_KEY: CredKey = {
  key: "createUrl",
  label: "Endpoint إنشاء شحنة (POST)",
  placeholder: "https://api.carrier.com/v1/shipments",
};

/**
 * Optional, uniform "track shipment endpoint" credential appended to every
 * pre-baked carrier's form. Supports a `{tn}` placeholder for the tracking
 * number; when absent the tracking number is appended as a `?tn=` query param.
 */
const TRACK_URL_KEY: CredKey = {
  key: "trackUrl",
  label: "Endpoint تتبع (GET, use {tn} for tracking number)",
  placeholder: "https://api.carrier.com/v1/track/{tn}",
};

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
 * Resolve a configured endpoint URL (`createUrl` / `trackUrl` / `cancelUrl`)
 * from the provider's stored credentials (preferred) or settings. Returns null
 * when none is configured. When a tracking number is supplied, a `{tn}`
 * placeholder is replaced with its URL-encoded form.
 */
function resolveEndpoint(
  provider: DeliveryProvider,
  key: "createUrl" | "trackUrl" | "cancelUrl",
  trackingNumber?: string,
): string | null {
  const fromCreds = provider.credentials?.[key];
  const fromSettings =
    typeof provider.settings?.[key] === "string"
      ? (provider.settings[key] as string)
      : undefined;
  const raw = (fromCreds || fromSettings || "").trim();
  if (!raw) return null;
  if (trackingNumber == null) return raw;
  return raw.includes("{tn}")
    ? raw.replace(/\{tn\}/g, encodeURIComponent(trackingNumber))
    : raw;
}

/**
 * Pull the first present string-ish value among `keys` off a carrier's JSON
 * response. Carriers vary in casing/naming for the same field, so we accept a
 * small list of aliases. Numbers are coerced to strings (some carriers return a
 * numeric AWB id).
 */
function pickString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
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
  const url = resolveEndpoint(provider, "cancelUrl", trackingNumber);
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

/**
 * Real carrier "create/book shipment" call shared by every pre-baked + custom
 * adapter.
 *
 * Throws `DeliveryNotConfiguredError` (→ route maps to 400 { notConfigured })
 * when the provider lacks its required credentials OR has no create endpoint
 * wired yet, so an un-contracted carrier can't silently pretend to issue an AWB.
 *
 * On a reachable-but-rejecting carrier (non-2xx) — or a 2xx response that omits
 * a tracking number — it throws a plain Error, which the route surfaces as a
 * logged 500 and leaves the order untouched (no AWB persisted).
 */
async function httpCreateShipment(
  provider: DeliveryProvider,
  input: ShipmentInput,
  isConfigured: (p: DeliveryProvider) => boolean,
): Promise<ShipmentResult> {
  const name = provider.nameAr || provider.name;
  if (!isConfigured(provider)) {
    throw new DeliveryNotConfiguredError(name);
  }
  const url = resolveEndpoint(provider, "createUrl");
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
    body: JSON.stringify({
      orderId: input.order.id,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      recipientAddress: input.recipientAddress,
      recipientCity: input.recipientCity ?? null,
      codAmount: input.totalCod,
      notes: input.notes ?? null,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Carrier "${name}" rejected shipment creation for order ${input.order.id} (HTTP ${res.status})` +
        (detail ? `: ${detail.slice(0, 300)}` : ""),
    );
  }

  const data: unknown = await res.json().catch(() => ({}));
  const trackingNumber = pickString(data, [
    "trackingNumber",
    "tracking_number",
    "awb",
    "awbNumber",
    "awb_number",
    "id",
  ]);
  if (!trackingNumber) {
    throw new Error(
      `Carrier "${name}" returned no tracking number for order ${input.order.id}`,
    );
  }
  return {
    trackingNumber,
    awbUrl: pickString(data, [
      "awbUrl",
      "awb_url",
      "labelUrl",
      "label_url",
      "label",
    ]),
    status: pickString(data, ["status", "state"]) ?? "shipped",
    raw: data,
  };
}

/**
 * Real carrier "track shipment" call shared by every pre-baked + custom
 * adapter.
 *
 * Throws `DeliveryNotConfiguredError` (→ route maps to a tracking payload with
 * { notConfigured: true }) when the provider lacks its required credentials OR
 * has no track endpoint wired yet.
 *
 * The tracking number is injected via a `{tn}` placeholder in the URL, or
 * appended as a `?tn=` query param when no placeholder is present (GET has no
 * body). On a reachable-but-rejecting carrier (non-2xx) it throws a plain Error.
 */
async function httpTrackShipment(
  provider: DeliveryProvider,
  trackingNumber: string,
  isConfigured: (p: DeliveryProvider) => boolean,
): Promise<TrackResult> {
  const name = provider.nameAr || provider.name;
  if (!isConfigured(provider)) {
    throw new DeliveryNotConfiguredError(name);
  }
  const base = resolveEndpoint(provider, "trackUrl");
  if (!base) {
    throw new DeliveryNotConfiguredError(name);
  }
  const url = base.includes("{tn}")
    ? base.replace(/\{tn\}/g, encodeURIComponent(trackingNumber))
    : `${base}${base.includes("?") ? "&" : "?"}tn=${encodeURIComponent(trackingNumber)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...buildAuthHeaders(provider.credentials ?? {}),
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Carrier "${name}" tracking lookup failed for ${trackingNumber} (HTTP ${res.status})` +
        (detail ? `: ${detail.slice(0, 300)}` : ""),
    );
  }

  const data: unknown = await res.json().catch(() => ({}));
  const rawHistory =
    data && typeof data === "object"
      ? (data as Record<string, unknown>).history
      : undefined;
  const history = Array.isArray(rawHistory)
    ? rawHistory
        .map((h) => {
          const entry = (h ?? {}) as Record<string, unknown>;
          return {
            at: pickString(entry, ["at", "timestamp", "date", "time"]) ?? "",
            label:
              pickString(entry, ["label", "description", "status", "state"]) ??
              "",
          };
        })
        .filter((h) => h.at !== "" || h.label !== "")
    : undefined;

  return {
    status: pickString(data, ["status", "state"]) ?? "unknown",
    statusAr: pickString(data, ["statusAr", "status_ar"]),
    history,
    raw: data,
  };
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
    // The create/track/cancel endpoints are offered on every carrier's form.
    // For pre-baked carriers they are optional extras (a merchant pastes the
    // carrier's documented URLs once contracted); the `custom` adapter already
    // lists createUrl/trackUrl as required, so we de-dupe by key to avoid
    // showing the same field twice.
    requiredCredentials: () => {
      const extras = [CREATE_URL_KEY, TRACK_URL_KEY, CANCEL_URL_KEY].filter(
        (extra) => !requiredKeys.some((k) => k.key === extra.key),
      );
      return [...requiredKeys, ...extras];
    },
    async createShipment(provider, input) {
      return httpCreateShipment(provider, input, adapter.isConfigured);
    },
    async trackShipment(provider, trackingNumber) {
      return httpTrackShipment(provider, trackingNumber, adapter.isConfigured);
    },
    async cancelShipment(provider, trackingNumber) {
      return httpCancelShipment(provider, trackingNumber, adapter.isConfigured);
    },
  };
  return adapter;
}

// All three operations are wired generically against configurable HTTP
// endpoints: set the carrier's documented create (`createUrl`), track
// (`trackUrl`), and void/cancel (`cancelUrl`) endpoints on the provider and the
// adapter performs real authenticated HTTP calls (bearer/basic auth inferred
// from the stored credentials). Until a carrier's endpoints + required
// credentials are wired, create/track throw `DeliveryNotConfiguredError` so an
// un-contracted carrier can't silently pretend to issue an AWB. Carriers whose
// real API needs a bespoke request/response shape can still override these
// methods individually.
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

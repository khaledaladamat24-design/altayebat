import type { DeliveryAdapter } from "../types";
import { DeliveryNotConfiguredError } from "../types";

/** Build a stub adapter for a named provider until credentials are wired. */
export function makeStubAdapter(
  type: string,
  requiredKeys: Array<{ key: string; label: string; placeholder?: string }>,
): DeliveryAdapter {
  return {
    type,
    isConfigured(provider) {
      return requiredKeys.every((k) => Boolean(provider.credentials?.[k.key]));
    },
    requiredCredentials: () => requiredKeys,
    async createShipment(provider) {
      throw new DeliveryNotConfiguredError(provider.nameAr || provider.name);
    },
    async trackShipment(provider) {
      throw new DeliveryNotConfiguredError(provider.nameAr || provider.name);
    },
  };
}

// Real API integration for each of these is left as a thin replacement of the
// `createShipment` / `trackShipment` methods once the merchant signs a contract
// and obtains the credentials listed in `requiredCredentials`.
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

// Jordan cities/governorates used for BOTH the vendor's saved `city` (chosen at
// registration) and the customer's "delivery to" province filter. This is the
// SINGLE source of truth for that list — the vendor registration form and the
// province picker both consume it, so the stored vendor `city` always matches a
// filter value exactly (no canonicalization drift). The Arabic name is the
// stored value; an empty value means "all provinces" (no filter).
// NOTE: spellings are kept diacritic-free (e.g. "عمان" not "عمّان") to match
// what vendors store; the server also matches diacritic-insensitively as a
// safety net for any legacy free-text values.
export const CITY_STORAGE_KEY = "al_tayebat_city";

export type Province = { ar: string; en: string };

export const JORDAN_PROVINCES: Province[] = [
  { ar: "عمان", en: "Amman" },
  { ar: "إربد", en: "Irbid" },
  { ar: "الزرقاء", en: "Zarqa" },
  { ar: "السلط", en: "Salt" },
  { ar: "المفرق", en: "Mafraq" },
  { ar: "جرش", en: "Jerash" },
  { ar: "عجلون", en: "Ajloun" },
  { ar: "مادبا", en: "Madaba" },
  { ar: "الكرك", en: "Karak" },
  { ar: "الطفيلة", en: "Tafilah" },
  { ar: "معان", en: "Ma'an" },
  { ar: "العقبة", en: "Aqaba" },
];

export function getStoredCity(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(CITY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredCity(city: string): void {
  if (typeof window === "undefined") return;
  try {
    if (city) localStorage.setItem(CITY_STORAGE_KEY, city);
    else localStorage.removeItem(CITY_STORAGE_KEY);
  } catch {
    // ignore storage write failures (private mode, etc.)
  }
}

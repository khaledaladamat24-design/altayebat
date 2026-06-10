import { useState } from "react";
import { MapPin, X, Check } from "lucide-react";
import {
  JORDAN_PROVINCES,
  getStoredCity,
  setStoredCity,
} from "@/lib/provinces";
import { useLanguage } from "@/contexts/language";

/**
 * "Delivery to" province selector. Renders the trigger passed as children-less
 * content (the trigger markup lives in the caller); opening shows a bottom-sheet
 * modal of Jordan governorates. Selecting one persists it (Arabic name) to
 * localStorage and calls `onChange` so listings can re-filter by city.
 */
export function ProvincePicker({
  open,
  onClose,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  onChange: (city: string) => void;
}) {
  const { lang, dir, tr } = useLanguage();
  const [selected, setSelected] = useState<string>(() => getStoredCity());

  if (!open) return null;

  const pick = (city: string) => {
    setSelected(city);
    setStoredCity(city);
    onChange(city);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      dir={dir}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md bg-background rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            {tr("اختر منطقة التوصيل", "Choose delivery province")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-muted-foreground"
            aria-label={tr("إغلاق", "Close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-3 py-3">
          <button
            type="button"
            onClick={() => pick("")}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold mb-1 ${
              selected === ""
                ? "bg-primary/10 text-primary"
                : "hover:bg-muted text-foreground"
            }`}
          >
            {tr("كل المناطق", "All provinces")}
            {selected === "" && <Check className="w-4 h-4" />}
          </button>
          {JORDAN_PROVINCES.map((p) => {
            const label = lang === "en" ? p.en : p.ar;
            const isActive = selected === p.ar;
            return (
              <button
                key={p.ar}
                type="button"
                onClick={() => pick(p.ar)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold mb-1 ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                {label}
                {isActive && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

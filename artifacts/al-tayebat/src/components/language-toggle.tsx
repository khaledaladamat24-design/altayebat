import { Languages } from "lucide-react";
import { useLanguage } from "@/contexts/language";

/**
 * Compact Arabic/English language toggle for app headers.
 * Shows the language the user can switch TO, so the action is obvious.
 * Designed to sit on the deep-green header (uses translucent surface).
 */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, toggle } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
      className={`flex items-center gap-1.5 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 active:scale-95 transition-all px-3 py-1.5 text-primary-foreground ${className}`}
    >
      <Languages className="w-4 h-4" />
      <span className="text-xs font-bold leading-none">
        {lang === "ar" ? "EN" : "ع"}
      </span>
    </button>
  );
}

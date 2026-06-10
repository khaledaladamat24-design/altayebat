import { useState } from "react";
import { useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import {
  ChevronRight,
  ShieldCheck,
  Trash2,
  Info,
  LogOut,
  ChevronLeft,
  FileText,
  KeyRound,
  X,
  MapPin,
  Loader2,
  Navigation,
  Headphones,
  Languages,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { openSupport, SUPPORT_PHONE } from "@/lib/support";
import { useLanguage } from "@/contexts/language";
import { getErrorMessage } from "@/lib/errors";
import { resetGuestSession, notifySessionChange } from "@/hooks/use-session";

const SIGNED_IN_KEYS = [
  "al_tayebat_firebase_uid",
  "al_tayebat_user_id",
  "al_tayebat_vendor_id",
  "al_tayebat_email",
  "al_tayebat_phone",
  "al_tayebat_name",
  "al_tayebat_role",
  // Mandatory-location gate flag — must clear on logout so a different account
  // signing in on the same device is re-prompted for its own location.
  "al_tayebat_location_set",
];

function isLoggedIn() {
  return (
    !!localStorage.getItem("al_tayebat_firebase_uid") ||
    !!localStorage.getItem("al_tayebat_user_id") ||
    !!localStorage.getItem("__clerk_db_jwt")
  );
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const { lang, setLang, tr } = useLanguage();

  const signedIn = isLoggedIn();
  const hasClerkPassword = !!user;

  const [showPwModal, setShowPwModal] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showAddrModal, setShowAddrModal] = useState(false);
  const [city, setCity] = useState(
    () => localStorage.getItem("al_tayebat_city") || "",
  );
  const [neighborhood, setNeighborhood] = useState(
    () => localStorage.getItem("al_tayebat_address") || "",
  );
  const [locating, setLocating] = useState(false);
  const savedAddrLabel =
    [city, neighborhood].filter(Boolean).join("، ") ||
    tr("لم يُحدَّد", "Not set");

  const handleSaveAddress = () => {
    if (!city.trim()) {
      toast.error(tr("اختر المدينة", "Select a city"));
      return;
    }
    localStorage.setItem("al_tayebat_city", city.trim());
    localStorage.setItem("al_tayebat_address", neighborhood.trim());
    toast.success(tr("تم حفظ العنوان", "Address saved"));
    setShowAddrModal(false);
  };

  const handleUseMyLocation = async () => {
    if (!("geolocation" in navigator)) {
      toast.error(
        tr(
          "جهازك لا يدعم تحديد الموقع",
          "Your device doesn't support location",
        ),
      );
      return;
    }
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        });
      });
      const { latitude, longitude } = pos.coords;
      // Reverse geocode via OpenStreetMap Nominatim (free, no key needed)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=${lang}`,
        { headers: { "User-Agent": "AlTayebat/1.0" } },
      );
      if (!res.ok)
        throw new Error(
          tr(
            "فشل الاتصال بخدمة الخرائط",
            "Failed to connect to the maps service",
          ),
        );
      const data = await res.json();
      const addr = data.address || {};
      const detectedCity =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.state ||
        addr.county ||
        "";
      const detectedNeighborhood =
        addr.neighbourhood ||
        addr.suburb ||
        addr.quarter ||
        addr.hamlet ||
        addr.road ||
        "";

      if (detectedCity) setCity(detectedCity);
      if (detectedNeighborhood) setNeighborhood(detectedNeighborhood);

      if (!detectedCity && !detectedNeighborhood) {
        toast(
          tr(
            "لم نتمكن من تحديد العنوان من الخريطة — أدخله يدوياً",
            "Couldn't detect the address from the map — enter it manually",
          ),
        );
      } else {
        toast.success(
          tr("تم تحديد موقعك ✅ — اضغط حفظ", "Location detected ✅ — tap Save"),
        );
      }
    } catch (err: unknown) {
      const e = err as GeolocationPositionError & { message?: string };
      const code = (e as GeolocationPositionError).code;
      if (code === 1)
        toast.error(
          tr(
            "لم تسمح بالوصول للموقع. فعّل الإذن من إعدادات التطبيق.",
            "Location access denied. Enable the permission in app settings.",
          ),
        );
      else if (code === 2)
        toast.error(
          tr(
            "تعذّر تحديد الموقع — تأكد من تفعيل GPS",
            "Couldn't determine location — make sure GPS is on",
          ),
        );
      else if (code === 3)
        toast.error(
          tr(
            "انتهت مهلة تحديد الموقع — حاول مرة أخرى",
            "Location request timed out — try again",
          ),
        );
      else
        toast.error(
          e?.message || tr("فشل تحديد الموقع", "Failed to determine location"),
        );
    }
    setLocating(false);
  };

  const handleClearCache = () => {
    const keys = Object.keys(localStorage).filter(
      (k) => k.startsWith("al_tayebat_") && k !== "al_tayebat_session",
    );
    keys.forEach((k) => localStorage.removeItem(k));
    toast.success(tr("تم مسح ذاكرة التخزين المؤقتة", "Cache cleared"));
  };

  const handleSignOut = async () => {
    SIGNED_IN_KEYS.forEach((k) => localStorage.removeItem(k));
    resetGuestSession();
    try {
      await signOut();
    } catch {}
    notifySessionChange();
    setLocation("/auth");
  };

  const handleChangePassword = async () => {
    if (!user) {
      toast.error(
        tr(
          "تغيير كلمة المرور متاح فقط لحسابات البريد الإلكتروني",
          "Changing the password is only available for email accounts",
        ),
      );
      return;
    }
    if (!newPw || newPw.length < 8) {
      toast.error(
        tr(
          "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
          "Password must be at least 8 characters",
        ),
      );
      return;
    }
    setPwSaving(true);
    try {
      await user.updatePassword({
        newPassword: newPw,
        currentPassword: oldPw || undefined,
      });
      toast.success(tr("تم تغيير كلمة المرور", "Password changed"));
      setShowPwModal(false);
      setOldPw("");
      setNewPw("");
    } catch (err) {
      toast.error(
        getErrorMessage(err) ||
          tr("فشل تغيير كلمة المرور", "Failed to change password"),
      );
    }
    setPwSaving(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const userId = localStorage.getItem("al_tayebat_user_id");
      const vendorId = localStorage.getItem("al_tayebat_vendor_id");
      if (vendorId) {
        await fetch(`/api/vendors/${vendorId}`, { method: "DELETE" }).catch(
          () => {},
        );
      }
      if (userId) {
        const r = await fetch(`/api/users/${userId}`, { method: "DELETE" });
        if (!r.ok)
          throw new Error(
            tr(
              "فشل حذف الحساب من الخادم",
              "Failed to delete the account from the server",
            ),
          );
      }
      if (user) {
        try {
          await user.delete();
        } catch {}
      }
      SIGNED_IN_KEYS.forEach((k) => localStorage.removeItem(k));
      resetGuestSession();
      try {
        await signOut();
      } catch {}
      notifySessionChange();
      toast.success(
        tr("تم حذف حسابك نهائياً", "Your account has been permanently deleted"),
      );
      setLocation("/auth");
    } catch (err) {
      toast.error(
        getErrorMessage(err) ||
          tr("فشل حذف الحساب", "Failed to delete account"),
      );
      setDeleting(false);
    }
  };

  type SettingRow = {
    icon: LucideIcon;
    label: string;
    iconColor: string;
    iconBg: string;
    suffix?: string;
    onPress: () => void;
  };

  const rows: SettingRow[] = [
    {
      icon: MapPin,
      label: tr("عنوان التوصيل", "Delivery address"),
      iconColor: "text-rose-500",
      iconBg: "bg-rose-50",
      suffix: savedAddrLabel,
      onPress: () => setShowAddrModal(true),
    },
    ...(signedIn
      ? [
          {
            icon: KeyRound,
            label: tr("تغيير كلمة المرور", "Change password"),
            iconColor: "text-blue-500",
            iconBg: "bg-blue-50",
            onPress: () =>
              hasClerkPassword
                ? setShowPwModal(true)
                : toast(
                    tr(
                      "تغيير كلمة المرور متاح فقط لحسابات البريد الإلكتروني — حسابات الهاتف تستخدم رمز OTP",
                      "Changing the password is only available for email accounts — phone accounts use an OTP code",
                    ),
                  ),
          },
          {
            icon: FileText,
            label: tr("إعدادات حساب Clerk", "Clerk account settings"),
            iconColor: "text-indigo-500",
            iconBg: "bg-indigo-50",
            onPress: () =>
              hasClerkPassword
                ? openUserProfile()
                : toast(
                    tr(
                      "هذه الإعدادات تخص حسابات البريد الإلكتروني فقط",
                      "These settings are for email accounts only",
                    ),
                  ),
          },
        ]
      : []),
    {
      icon: Headphones,
      label: tr("تواصل معنا للمساعدة", "Contact us for help"),
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
      suffix: SUPPORT_PHONE,
      onPress: openSupport,
    },
    {
      icon: ShieldCheck,
      label: tr("سياسة الخصوصية", "Privacy policy"),
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-50",
      onPress: () => setLocation("/privacy-policy"),
    },
    {
      icon: Trash2,
      label: tr("مسح ذاكرة التخزين المؤقتة", "Clear cache"),
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
      suffix: tr("محلي", "Local"),
      onPress: handleClearCache,
    },
    {
      icon: Info,
      label: tr("عن الطيبات", "About Al-Tayebat"),
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      suffix: "1.1.0",
      onPress: () =>
        toast(
          tr(
            "الطيبات — تطبيق توصيل الغذاء الصحي في الأردن 🇯🇴",
            "Al-Tayebat — healthy food delivery app in Jordan 🇯🇴",
          ),
        ),
    },
  ];

  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div className="min-h-screen bg-muted/30" dir={dir}>
      <div className="max-w-md mx-auto bg-background min-h-screen shadow-sm border-x border-border/50">
        <div className="bg-background border-b border-border sticky top-0 z-20 px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={() => setLocation("/account")} className="p-1 -mr-1">
            {lang === "ar" ? (
              <ChevronRight className="w-6 h-6 text-foreground" />
            ) : (
              <ChevronLeft className="w-6 h-6 text-foreground" />
            )}
          </button>
          <h1 className="text-xl font-black flex-1 text-center pr-4">
            {tr("الإعدادات", "Settings")}
          </h1>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Language toggle */}
          <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                <Languages className="w-5 h-5 text-violet-500" />
              </div>
              <span className="flex-1 font-bold text-sm">
                {tr("اللغة", "Language")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLang("ar")}
                aria-pressed={lang === "ar"}
                className={`h-11 rounded-xl text-sm font-bold transition-colors ${
                  lang === "ar"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                العربية
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                aria-pressed={lang === "en"}
                className={`h-11 rounded-xl text-sm font-bold transition-colors ${
                  lang === "en"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                English
              </button>
            </div>
          </div>

          <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
            {rows.map((row, i) => (
              <button
                key={row.label}
                onClick={row.onPress}
                className={`w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/40 transition-colors text-right ${i < rows.length - 1 ? "border-b border-border" : ""}`}
              >
                <div
                  className={`w-9 h-9 rounded-xl ${row.iconBg} flex items-center justify-center shrink-0`}
                >
                  <row.icon className={`w-5 h-5 ${row.iconColor}`} />
                </div>
                <span className="flex-1 font-bold text-sm">{row.label}</span>
                {row.suffix && (
                  <span className="text-xs text-muted-foreground font-medium">
                    {row.suffix}
                  </span>
                )}
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>

          {signedIn && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full bg-background border border-destructive/30 rounded-2xl px-4 py-4 flex items-center gap-3 hover:bg-destructive/5 transition-colors shadow-sm"
            >
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <span className="font-bold text-destructive text-sm flex-1 text-right">
                {tr("حذف الحساب نهائياً", "Delete account permanently")}
              </span>
              <ChevronLeft className="w-4 h-4 text-destructive/60" />
            </button>
          )}

          <button
            onClick={handleSignOut}
            className="w-full bg-background border border-border rounded-2xl px-4 py-4 flex items-center gap-3 hover:bg-destructive/5 transition-colors shadow-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5 text-destructive" />
            </div>
            <span className="font-bold text-destructive text-sm flex-1 text-right">
              {signedIn
                ? tr("تسجيل الخروج", "Sign out")
                : tr("العودة لتسجيل الدخول", "Back to sign in")}
            </span>
          </button>

          <p className="text-center text-xs text-muted-foreground pt-4">
            {tr(
              "الطيبات — صنع بكل حب في الأردن 🇯🇴",
              "Al-Tayebat — made with love in Jordan 🇯🇴",
            )}
          </p>
        </div>
      </div>

      {/* Change password modal */}
      {showPwModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowPwModal(false)}
        >
          <div
            className="bg-background rounded-2xl w-full max-w-sm p-5 shadow-xl"
            dir={dir}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg">
                {tr("تغيير كلمة المرور", "Change password")}
              </h2>
              <button
                onClick={() => setShowPwModal(false)}
                className="p-1 text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr("كلمة المرور الحالية", "Current password")}
                </label>
                <Input
                  type="password"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                  className="h-11 bg-muted border-none"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr(
                    "كلمة المرور الجديدة (8+ أحرف)",
                    "New password (8+ characters)",
                  )}
                </label>
                <Input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="h-11 bg-muted border-none"
                  dir="ltr"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={pwSaving}
                className="w-full h-12 rounded-xl mt-2"
              >
                {pwSaving
                  ? tr("جاري الحفظ...", "Saving...")
                  : tr("حفظ كلمة المرور الجديدة", "Save new password")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Address modal */}
      {showAddrModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowAddrModal(false)}
        >
          <div
            className="bg-background rounded-2xl w-full max-w-sm p-5 shadow-xl"
            dir={dir}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg">
                {tr("عنوان التوصيل", "Delivery address")}
              </h2>
              <button
                onClick={() => setShowAddrModal(false)}
                className="p-1 text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleUseMyLocation}
                disabled={locating}
                className="w-full h-12 rounded-xl border-primary/40 text-primary hover:bg-primary/5 flex items-center justify-center gap-2"
              >
                {locating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4" />
                )}
                {locating
                  ? tr("جاري تحديد موقعك...", "Detecting your location...")
                  : tr("استخدم موقعي الحالي 📍", "Use my current location 📍")}
              </Button>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">
                  {tr("أو أدخله يدوياً", "Or enter manually")}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr("المدينة", "City")}
                </label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  list="city-list"
                  placeholder={tr(
                    "ابحث أو اختر المدينة...",
                    "Search or pick a city...",
                  )}
                  className="h-11 bg-muted border-none"
                  dir={dir}
                />
                <datalist id="city-list">
                  {[
                    "عمان",
                    "الزرقاء",
                    "إربد",
                    "العقبة",
                    "المفرق",
                    "الكرك",
                    "مادبا",
                    "السلط",
                    "جرش",
                    "عجلون",
                    "الطفيلة",
                    "معان",
                  ].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr(
                    "الحي / المنطقة (اختياري)",
                    "Neighborhood / area (optional)",
                  )}
                </label>
                <Input
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder={tr(
                    "مثال: دابوق، الشميساني...",
                    "e.g. Dabouq, Shmeisani...",
                  )}
                  className="h-11 bg-muted border-none"
                  dir={dir}
                />
              </div>
              <Button
                onClick={handleSaveAddress}
                className="w-full h-12 rounded-xl mt-2"
              >
                {tr("حفظ العنوان", "Save address")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div
            className="bg-background rounded-2xl w-full max-w-sm p-5 shadow-xl"
            dir={dir}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="font-black text-lg text-center mb-2">
              {tr("حذف الحساب نهائياً", "Delete account permanently")}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-5">
              {tr(
                "سيتم حذف جميع بياناتك (الملف الشخصي والمتجر إن وجد) ولا يمكن استرجاعها.",
                "All your data (profile and store if any) will be deleted and cannot be recovered.",
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 h-12 rounded-xl"
              >
                {tr("إلغاء", "Cancel")}
              </Button>
              <Button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 h-12 rounded-xl bg-destructive hover:bg-destructive/90"
              >
                {deleting
                  ? tr("جاري الحذف...", "Deleting...")
                  : tr("تأكيد الحذف", "Confirm delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

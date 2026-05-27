import { useState } from "react";
import { useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import {
  ChevronRight, ShieldCheck, Trash2, Info, LogOut, ChevronLeft, FileText, KeyRound, X, MapPin, Loader2, Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const SIGNED_IN_KEYS = [
  "al_tayebat_firebase_uid", "al_tayebat_user_id", "al_tayebat_vendor_id",
  "al_tayebat_email", "al_tayebat_phone", "al_tayebat_name", "al_tayebat_role",
];

function isLoggedIn() {
  return !!localStorage.getItem("al_tayebat_firebase_uid")
      || !!localStorage.getItem("al_tayebat_user_id")
      || !!localStorage.getItem("__clerk_db_jwt");
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();

  const signedIn = isLoggedIn();
  const hasClerkPassword = !!user;

  const [showPwModal, setShowPwModal] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showAddrModal, setShowAddrModal] = useState(false);
  const [city, setCity] = useState(() => localStorage.getItem("al_tayebat_city") || "");
  const [neighborhood, setNeighborhood] = useState(() => localStorage.getItem("al_tayebat_address") || "");
  const [locating, setLocating] = useState(false);
  const savedAddrLabel = [city, neighborhood].filter(Boolean).join("، ") || "لم يُحدَّد";

  const handleSaveAddress = () => {
    if (!city.trim()) { toast.error("اختر المدينة"); return; }
    localStorage.setItem("al_tayebat_city", city.trim());
    localStorage.setItem("al_tayebat_address", neighborhood.trim());
    toast.success("تم حفظ العنوان");
    setShowAddrModal(false);
  };

  const handleUseMyLocation = async () => {
    if (!("geolocation" in navigator)) {
      toast.error("جهازك لا يدعم تحديد الموقع");
      return;
    }
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 60000,
        });
      });
      const { latitude, longitude } = pos.coords;
      // Reverse geocode via OpenStreetMap Nominatim (free, no key needed)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=ar`,
        { headers: { "User-Agent": "AlTayebat/1.0" } }
      );
      if (!res.ok) throw new Error("فشل الاتصال بخدمة الخرائط");
      const data = await res.json();
      const addr = data.address || {};
      const detectedCity =
        addr.city || addr.town || addr.village || addr.state || addr.county || "";
      const detectedNeighborhood =
        addr.neighbourhood || addr.suburb || addr.quarter || addr.hamlet || addr.road || "";

      if (detectedCity) setCity(detectedCity);
      if (detectedNeighborhood) setNeighborhood(detectedNeighborhood);

      if (!detectedCity && !detectedNeighborhood) {
        toast("لم نتمكن من تحديد العنوان من الخريطة — أدخله يدوياً");
      } else {
        toast.success("تم تحديد موقعك ✅ — اضغط حفظ");
      }
    } catch (err: unknown) {
      const e = err as GeolocationPositionError & { message?: string };
      const code = (e as GeolocationPositionError).code;
      if (code === 1) toast.error("لم تسمح بالوصول للموقع. فعّل الإذن من إعدادات التطبيق.");
      else if (code === 2) toast.error("تعذّر تحديد الموقع — تأكد من تفعيل GPS");
      else if (code === 3) toast.error("انتهت مهلة تحديد الموقع — حاول مرة أخرى");
      else toast.error(e?.message || "فشل تحديد الموقع");
    }
    setLocating(false);
  };

  const handleClearCache = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("al_tayebat_") && k !== "al_tayebat_session");
    keys.forEach(k => localStorage.removeItem(k));
    toast.success("تم مسح ذاكرة التخزين المؤقتة");
  };

  const handleSignOut = async () => {
    SIGNED_IN_KEYS.forEach(k => localStorage.removeItem(k));
    try { await signOut(); } catch {}
    setLocation("/auth");
  };

  const handleChangePassword = async () => {
    if (!user) {
      toast.error("تغيير كلمة المرور متاح فقط لحسابات البريد الإلكتروني");
      return;
    }
    if (!newPw || newPw.length < 8) {
      toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return;
    }
    setPwSaving(true);
    try {
      await user.updatePassword({ newPassword: newPw, currentPassword: oldPw || undefined } as any);
      toast.success("تم تغيير كلمة المرور");
      setShowPwModal(false);
      setOldPw(""); setNewPw("");
    } catch (err: any) {
      toast.error(err?.errors?.[0]?.longMessage || err?.message || "فشل تغيير كلمة المرور");
    }
    setPwSaving(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const userId = localStorage.getItem("al_tayebat_user_id");
      const vendorId = localStorage.getItem("al_tayebat_vendor_id");
      if (vendorId) {
        await fetch(`/api/vendors/${vendorId}`, { method: "DELETE" }).catch(() => {});
      }
      if (userId) {
        const r = await fetch(`/api/users/${userId}`, { method: "DELETE" });
        if (!r.ok) throw new Error("فشل حذف الحساب من الخادم");
      }
      if (user) {
        try { await user.delete(); } catch {}
      }
      SIGNED_IN_KEYS.forEach(k => localStorage.removeItem(k));
      try { await signOut(); } catch {}
      toast.success("تم حذف حسابك نهائياً");
      setLocation("/auth");
    } catch (err: any) {
      toast.error(err?.message || "فشل حذف الحساب");
      setDeleting(false);
    }
  };

  const rows = [
    {
      icon: MapPin,
      label: "عنوان التوصيل",
      iconColor: "text-rose-500",
      iconBg: "bg-rose-50",
      suffix: savedAddrLabel,
      onPress: () => setShowAddrModal(true),
    },
    ...(signedIn ? [{
      icon: KeyRound,
      label: "تغيير كلمة المرور",
      iconColor: "text-blue-500",
      iconBg: "bg-blue-50",
      onPress: () => hasClerkPassword ? setShowPwModal(true) : toast("تغيير كلمة المرور متاح فقط لحسابات البريد الإلكتروني — حسابات الهاتف تستخدم رمز OTP"),
    }, {
      icon: FileText,
      label: "إعدادات حساب Clerk",
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-50",
      onPress: () => hasClerkPassword ? openUserProfile() : toast("هذه الإعدادات تخص حسابات البريد الإلكتروني فقط"),
    }] : []),
    {
      icon: ShieldCheck,
      label: "سياسة الخصوصية",
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-50",
      onPress: () => setLocation("/privacy-policy"),
    },
    {
      icon: Trash2,
      label: "مسح ذاكرة التخزين المؤقتة",
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
      suffix: "محلي",
      onPress: handleClearCache,
    },
    {
      icon: Info,
      label: "عن الطيبات",
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      suffix: "1.1.0",
      onPress: () => toast("الطيبات — تطبيق توصيل الغذاء الصحي في الأردن 🇯🇴"),
    },
  ];

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      <div className="max-w-md mx-auto bg-background min-h-screen shadow-sm border-x border-border/50">
      <div className="bg-background border-b border-border sticky top-0 z-20 px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => setLocation("/account")} className="p-1 -mr-1">
          <ChevronRight className="w-6 h-6 text-foreground" />
        </button>
        <h1 className="text-xl font-black flex-1 text-center pr-4">الإعدادات</h1>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          {rows.map((row, i) => (
            <button
              key={row.label}
              onClick={row.onPress}
              className={`w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/40 transition-colors text-right ${i < rows.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className={`w-9 h-9 rounded-xl ${row.iconBg} flex items-center justify-center shrink-0`}>
                <row.icon className={`w-5 h-5 ${row.iconColor}`} />
              </div>
              <span className="flex-1 font-bold text-sm">{row.label}</span>
              {(row as any).suffix && (
                <span className="text-xs text-muted-foreground font-medium">{(row as any).suffix}</span>
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
            <span className="font-bold text-destructive text-sm flex-1 text-right">حذف الحساب نهائياً</span>
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
            {signedIn ? "تسجيل الخروج" : "العودة لتسجيل الدخول"}
          </span>
        </button>

        <p className="text-center text-xs text-muted-foreground pt-4">
          الطيبات — صنع بكل حب في الأردن 🇯🇴
        </p>
      </div>
      </div>

      {/* Change password modal */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowPwModal(false)}>
          <div className="bg-background rounded-2xl w-full max-w-sm p-5 shadow-xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg">تغيير كلمة المرور</h2>
              <button onClick={() => setShowPwModal(false)} className="p-1 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">كلمة المرور الحالية</label>
                <Input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} className="h-11 bg-muted border-none" dir="ltr" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">كلمة المرور الجديدة (8+ أحرف)</label>
                <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="h-11 bg-muted border-none" dir="ltr" />
              </div>
              <Button onClick={handleChangePassword} disabled={pwSaving} className="w-full h-12 rounded-xl mt-2">
                {pwSaving ? "جاري الحفظ..." : "حفظ كلمة المرور الجديدة"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Address modal */}
      {showAddrModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowAddrModal(false)}>
          <div className="bg-background rounded-2xl w-full max-w-sm p-5 shadow-xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg">عنوان التوصيل</h2>
              <button onClick={() => setShowAddrModal(false)} className="p-1 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleUseMyLocation}
                disabled={locating}
                className="w-full h-12 rounded-xl border-primary/40 text-primary hover:bg-primary/5 flex items-center justify-center gap-2"
              >
                {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                {locating ? "جاري تحديد موقعك..." : "استخدم موقعي الحالي 📍"}
              </Button>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">أو أدخله يدوياً</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">المدينة</label>
                <Input
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  list="city-list"
                  placeholder="ابحث أو اختر المدينة..."
                  className="h-11 bg-muted border-none"
                  dir="rtl"
                />
                <datalist id="city-list">
                  {["عمان","الزرقاء","إربد","العقبة","المفرق","الكرك","مادبا","السلط","جرش","عجلون","الطفيلة","معان"].map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">الحي / المنطقة (اختياري)</label>
                <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="مثال: دابوق، الشميساني..." className="h-11 bg-muted border-none" dir="rtl" />
              </div>
              <Button onClick={handleSaveAddress} className="w-full h-12 rounded-xl mt-2">حفظ العنوان</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="bg-background rounded-2xl w-full max-w-sm p-5 shadow-xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="font-black text-lg text-center mb-2">حذف الحساب نهائياً</h2>
            <p className="text-sm text-muted-foreground text-center mb-5">
              سيتم حذف جميع بياناتك (الملف الشخصي والمتجر إن وجد) ولا يمكن استرجاعها.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={deleting} className="flex-1 h-12 rounded-xl">إلغاء</Button>
              <Button onClick={handleDeleteAccount} disabled={deleting} className="flex-1 h-12 rounded-xl bg-destructive hover:bg-destructive/90">
                {deleting ? "جاري الحذف..." : "تأكيد الحذف"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

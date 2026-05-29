import { Link, useLocation } from "wouter";
import {
  ChevronLeft, MapPin, Heart, Package, Globe, Settings,
  CreditCard, Zap, Gift, UserCircle, Pencil, Check, X, Headphones,
} from "lucide-react";
import { useUser, useAuth, useClerk } from "@clerk/react";
import { LogOut, Store } from "lucide-react";
import { toast } from "sonner";
import { useListOrders } from "@workspace/api-client-react";
import { useSession } from "@/hooks/use-session";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { openSupport } from "@/lib/support";

export default function Account() {
  const [, setLocation] = useLocation();
  const { isSignedIn: clerkSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const sessionId = useSession();
  const [vendorId, setVendorId] = useState<string | null>(() => localStorage.getItem("al_tayebat_vendor_id"));
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const [firebaseSignedIn, setFirebaseSignedIn] = useState(
    () => !!localStorage.getItem("al_tayebat_firebase_uid") || !!localStorage.getItem("al_tayebat_user_id")
  );
  useEffect(() => {
    const check = () => {
      setFirebaseSignedIn(!!localStorage.getItem("al_tayebat_firebase_uid") || !!localStorage.getItem("al_tayebat_user_id"));
      setVendorId(localStorage.getItem("al_tayebat_vendor_id"));
    };
    window.addEventListener("storage", check);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  const isSignedIn = clerkSignedIn || firebaseSignedIn;

  // Auto-detect vendor profile for signed-in users (and cache vendorId)
  useEffect(() => {
    if (!isSignedIn || vendorId) return;
    const userId = localStorage.getItem("al_tayebat_user_id");
    if (!userId) return;
    fetch(apiUrl(`/api/vendors/by-user/${userId}`)).then(async r => {
      if (r.ok) {
        const v = await r.json();
        localStorage.setItem("al_tayebat_vendor_id", String(v.id));
        setVendorId(String(v.id));
      }
    }).catch(() => {});
  }, [isSignedIn, vendorId]);

  // Load wallet balance for signed-in users
  useEffect(() => {
    if (!isSignedIn) { setWalletBalance(null); return; }
    const userId = localStorage.getItem("al_tayebat_user_id");
    if (!userId) return;
    fetch(apiUrl(`/api/wallet/${userId}`)).then(async r => {
      if (r.ok) {
        const d = await r.json();
        setWalletBalance(Number(d.balance));
      }
    }).catch(() => {});
  }, [isSignedIn]);

  const handleSignOut = async () => {
    ["al_tayebat_firebase_uid","al_tayebat_user_id","al_tayebat_vendor_id","al_tayebat_email","al_tayebat_phone","al_tayebat_name","al_tayebat_role"].forEach(k => localStorage.removeItem(k));
    setFirebaseSignedIn(false);
    setVendorId(null);
    try { await signOut(); } catch {}
    setLocation("/auth");
  };

  const { data: orders } = useListOrders(
    { sessionId },
    { query: { enabled: !!sessionId } }
  );

  // Show the best available identity for the signed-in user. Falls back through
  // Clerk profile → cached name → cached phone/email → "ضيف" (guest).
  const cachedPhone = typeof window !== "undefined" ? localStorage.getItem("al_tayebat_phone") : null;
  const cachedEmail = typeof window !== "undefined" ? localStorage.getItem("al_tayebat_email") : null;
  const [cachedName, setCachedName] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("al_tayebat_name") : null
  );
  const displayName =
    cachedName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    (isSignedIn && cachedPhone ? cachedPhone : null) ||
    (isSignedIn && cachedEmail ? cachedEmail.split("@")[0] : null) ||
    "ضيف";

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const openNameEditor = () => {
    if (!isSignedIn) { setLocation("/auth"); return; }
    setNameDraft(cachedName || (typeof displayName === "string" && displayName !== "ضيف" ? displayName : ""));
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) { toast.error("الرجاء إدخال اسم"); return; }
    const userId = localStorage.getItem("al_tayebat_user_id");
    if (!userId) { toast.error("الحساب غير معروف"); return; }
    setSavingName(true);
    try {
      const r = await fetch(apiUrl(`/api/users/${userId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) throw new Error(String(r.status));
      localStorage.setItem("al_tayebat_name", trimmed);
      setCachedName(trimmed);
      setEditingName(false);
      toast.success("تم تحديث الاسم");
    } catch {
      toast.error("فشل تحديث الاسم");
    } finally {
      setSavingName(false);
    }
  };

  const ordersCount = orders?.length ?? 0;

  const menuRows = [
    { icon: CreditCard, label: "طرق الدفع", iconColor: "text-blue-500", href: vendorId ? "/payment-methods" : "/wallet" },
    { icon: MapPin, label: "العنوان", iconColor: "text-rose", href: null },
    { icon: Heart, label: "المفضلة", iconColor: "text-pink-500", href: null },
    { icon: Zap, label: "ضمان التوصيل في الوقت المحدد", iconColor: "text-green-500", href: null },
    { icon: Headphones, label: "تواصل معنا للمساعدة", iconColor: "text-emerald-500", href: null, onPress: openSupport },
    { icon: Globe, label: "اللغة", iconColor: "text-slate-500", suffix: "العربية", href: null },
    { icon: Settings, label: "الإعدادات", iconColor: "text-slate-400", href: "/settings" },
  ];

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      {/* Header */}
      <div className="bg-background px-4 pt-12 pb-4 border-b border-border sticky top-0 z-20">
        <div className="flex items-center justify-between">
          {/* Name & avatar */}
          <div className="flex items-center gap-3 flex-1">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt={displayName} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <UserCircle className="w-6 h-6 text-primary" />
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">مرحباً</p>
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="h-7 px-2 text-sm font-bold rounded border border-border bg-background w-32"
                    autoFocus
                  />
                  <button onClick={saveName} disabled={savingName} className="p-1 text-primary disabled:opacity-50">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingName(false)} disabled={savingName} className="p-1 text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={isSignedIn ? openNameEditor : () => setLocation("/auth")}
                  className="flex items-center gap-1 font-black text-base group"
                >
                  {displayName}
                  {isSignedIn ? (
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-70 group-hover:opacity-100" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>
          </div>
          {/* Sign out / Support */}
          {isSignedIn ? (
            <button
              onClick={handleSignOut}
              title="تسجيل الخروج"
              className="w-10 h-10 rounded-full border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={openSupport}
              title="تواصل معنا للمساعدة"
              className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <span className="text-lg">🎧</span>
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Sign in banner (if guest) */}
        {!isSignedIn && (
          <button
            onClick={() => setLocation("/auth")}
            className="w-full bg-primary text-primary-foreground rounded-2xl p-4 flex items-center justify-between shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            <div className="text-right">
              <p className="font-black text-base">تسجيل الدخول / إنشاء حساب</p>
              <p className="text-primary-foreground/70 text-xs mt-0.5">بالبريد الإلكتروني أو رقم الهاتف (OTP)</p>
            </div>
            <ChevronLeft className="w-5 h-5 opacity-70 shrink-0" />
          </button>
        )}

        {/* Stats row */}
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border">
            {/* Orders */}
            <Link href="/orders">
              <div className="flex flex-col items-center py-5 gap-1.5 hover:bg-muted/40 transition-colors cursor-pointer">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Package className="w-5 h-5 text-amber-500" />
                </div>
                <span className="text-xs font-bold text-muted-foreground">الطلبات</span>
                <span className="text-lg font-black">{ordersCount}</span>
              </div>
            </Link>
            {/* Wallet */}
            <Link href={isSignedIn ? "/wallet" : "/auth"}>
              <div className="flex flex-col items-center py-5 gap-1.5 hover:bg-muted/40 transition-colors cursor-pointer">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-green-500" />
                </div>
                <span className="text-xs font-bold text-muted-foreground">المحفظة</span>
                <span className="text-lg font-black">{walletBalance !== null ? walletBalance.toFixed(2) : "—"}</span>
              </div>
            </Link>
            {/* Coupons */}
            <div className="flex flex-col items-center py-5 gap-1.5">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                <span className="text-rose text-lg">🎟️</span>
              </div>
              <span className="text-xs font-bold text-muted-foreground">قسائم</span>
              <span className="text-xs font-black text-rose">قريباً</span>
            </div>
          </div>
        </div>

        {/* Referral banner */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-3">
          <div className="text-3xl">🎁</div>
          <div className="flex-1">
            <p className="font-black text-sm">شارك واربح خصومات</p>
            <p className="text-xs text-muted-foreground mt-0.5">مكافآت لك وللأصدقاء أيضاً!</p>
          </div>
          <button className="bg-primary text-primary-foreground text-xs font-black px-3 py-1.5 rounded-xl">
            شارك
          </button>
        </div>

        {/* Menu rows */}
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          {menuRows.map((row, i) => {
            const inner = (
              <div
                className={`flex items-center gap-3 px-4 py-4 hover:bg-muted/40 transition-colors ${i < menuRows.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <row.icon className={`w-5 h-5 ${row.iconColor}`} />
                </div>
                <span className="flex-1 font-bold text-sm">{row.label}</span>
                {row.suffix && (
                  <span className="text-xs text-muted-foreground font-medium">{row.suffix}</span>
                )}
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </div>
            );
            return row.href ? (
              <Link key={row.label} href={row.href}>
                {inner}
              </Link>
            ) : (
              <div key={row.label} onClick={(row as { onPress?: () => void }).onPress} className="cursor-pointer">{inner}</div>
            );
          })}
        </div>

        {/* Vendor dashboard link (only for signed-in users with a vendor profile) */}
        {isSignedIn && vendorId && (
          <Link href="/vendor-dashboard">
            <div className="bg-background rounded-2xl border border-primary/30 overflow-hidden shadow-sm px-4 py-4 flex items-center gap-3 hover:bg-primary/5 transition-colors cursor-pointer">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <span className="font-bold text-sm block">إدارة متجري</span>
                <span className="text-[11px] text-muted-foreground">أضف وعدّل واحذف منتجاتك</span>
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        )}

        {/* Admin link */}
        <Link href="/admin">
          <div className="bg-background rounded-2xl border border-rose/30 overflow-hidden shadow-sm px-4 py-4 flex items-center gap-3 hover:bg-rose/5 transition-colors cursor-pointer">
            <div className="w-9 h-9 rounded-xl bg-rose/10 flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5 text-rose" />
            </div>
            <span className="flex-1 font-bold text-sm">لوحة إدارة المنتجات</span>
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </div>
        </Link>

        <p className="text-center text-xs text-muted-foreground pb-4">
          الطيبات — الإصدار 1.1.0 · صنع بكل حب في الأردن 🇯🇴
        </p>
      </div>
    </div>
  );
}

import { Link, useLocation } from "wouter";
import {
  ChevronLeft,
  Heart,
  Package,
  Settings,
  CreditCard,
  Zap,
  UserCircle,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useUser, useAuth, useClerk } from "@clerk/react";
import { LogOut, Store } from "lucide-react";
import { toast } from "sonner";
import {
  useListOrders,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import {
  useSession,
  resetGuestSession,
  notifySessionChange,
} from "@/hooks/use-session";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { openSupport } from "@/lib/support";
import { useLanguage } from "@/contexts/language";

export default function Account() {
  const { dir, tr } = useLanguage();
  const [, setLocation] = useLocation();
  const { isSignedIn: clerkSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const sessionId = useSession();
  const [vendorId, setVendorId] = useState<string | null>(() =>
    localStorage.getItem("al_tayebat_vendor_id"),
  );

  const [firebaseSignedIn, setFirebaseSignedIn] = useState(
    () =>
      !!localStorage.getItem("al_tayebat_firebase_uid") ||
      !!localStorage.getItem("al_tayebat_user_id"),
  );
  useEffect(() => {
    const check = () => {
      setFirebaseSignedIn(
        !!localStorage.getItem("al_tayebat_firebase_uid") ||
          !!localStorage.getItem("al_tayebat_user_id"),
      );
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

  // Role-based gating of sensitive admin buttons. The global "لوحة إدارة
  // المنتجات" (/admin) panel belongs to the app owner only; vendors manage their
  // own catalogue through "إدارة متجري". Regular customers see neither.
  const SUPER_ADMIN_EMAIL = "khaledaladamat24@gmail.com";
  const currentEmail = (
    user?.primaryEmailAddress?.emailAddress ||
    localStorage.getItem("al_tayebat_email") ||
    ""
  ).toLowerCase();
  const isSuperAdmin = currentEmail === SUPER_ADMIN_EMAIL;
  const isVendor = !!vendorId;

  // Auto-detect vendor profile for signed-in users (and cache vendorId)
  useEffect(() => {
    if (!isSignedIn || vendorId) return;
    const userId = localStorage.getItem("al_tayebat_user_id");
    if (!userId) return;
    fetch(apiUrl(`/api/vendors/by-user/${userId}`))
      .then(async (r) => {
        if (r.ok) {
          const v = await r.json();
          localStorage.setItem("al_tayebat_vendor_id", String(v.id));
          setVendorId(String(v.id));
        }
      })
      .catch(() => {});
  }, [isSignedIn, vendorId]);

  const handleSignOut = async () => {
    [
      "al_tayebat_firebase_uid",
      "al_tayebat_user_id",
      "al_tayebat_vendor_id",
      "al_tayebat_email",
      "al_tayebat_phone",
      "al_tayebat_name",
      "al_tayebat_role",
    ].forEach((k) => localStorage.removeItem(k));
    setFirebaseSignedIn(false);
    setVendorId(null);
    resetGuestSession();
    try {
      await signOut();
    } catch {}
    notifySessionChange();
    setLocation("/auth");
  };

  const { data: orders } = useListOrders(
    { sessionId },
    {
      query: {
        enabled: !!sessionId,
        queryKey: getListOrdersQueryKey({ sessionId }),
      },
    },
  );

  const guestLabel = tr("ضيف", "Guest");

  // Show the best available identity for the signed-in user. Falls back through
  // Clerk profile → cached name → cached phone/email → guest.
  const cachedPhone =
    typeof window !== "undefined"
      ? localStorage.getItem("al_tayebat_phone")
      : null;
  const cachedEmail =
    typeof window !== "undefined"
      ? localStorage.getItem("al_tayebat_email")
      : null;
  const [cachedName, setCachedName] = useState<string | null>(
    typeof window !== "undefined"
      ? localStorage.getItem("al_tayebat_name")
      : null,
  );
  const displayName =
    cachedName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    (isSignedIn && cachedPhone ? cachedPhone : null) ||
    (isSignedIn && cachedEmail ? cachedEmail.split("@")[0] : null) ||
    guestLabel;

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const openNameEditor = () => {
    if (!isSignedIn) {
      setLocation("/auth");
      return;
    }
    setNameDraft(
      cachedName ||
        (typeof displayName === "string" && displayName !== guestLabel
          ? displayName
          : ""),
    );
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast.error(tr("الرجاء إدخال اسم", "Please enter a name"));
      return;
    }
    const userId = localStorage.getItem("al_tayebat_user_id");
    if (!userId) {
      toast.error(tr("الحساب غير معروف", "Account not recognized"));
      return;
    }
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
      toast.success(tr("تم تحديث الاسم", "Name updated"));
    } catch {
      toast.error(tr("فشل تحديث الاسم", "Failed to update name"));
    } finally {
      setSavingName(false);
    }
  };

  const ordersCount = orders?.length ?? 0;

  const menuRows = [
    {
      icon: CreditCard,
      label: tr("طرق الدفع", "Payment methods"),
      iconColor: "text-blue-500",
      href: vendorId ? "/payment-methods" : null,
    },
    {
      icon: Heart,
      label: tr("المفضلة", "Favorites"),
      iconColor: "text-pink-500",
      href: null,
    },
    {
      icon: Zap,
      label: tr("ضمان التوصيل في الوقت المحدد", "On-time delivery guarantee"),
      iconColor: "text-green-500",
      href: null,
    },
    {
      icon: Settings,
      label: tr("الإعدادات", "Settings"),
      iconColor: "text-slate-400",
      suffix: tr("اللغة، العنوان، المساعدة", "Language, address, help"),
      href: "/settings",
    },
  ];

  return (
    <div className="min-h-screen bg-muted/30" dir={dir}>
      {/* Header */}
      <div className="bg-background px-4 pt-12 pb-4 border-b border-border sticky top-0 z-20">
        <div className="flex items-center justify-between">
          {/* Name & avatar */}
          <div className="flex items-center gap-3 flex-1">
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <UserCircle className="w-6 h-6 text-primary" />
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">
                {tr("مرحباً", "Welcome")}
              </p>
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="h-7 px-2 text-sm font-bold rounded border border-border bg-background w-32"
                    autoFocus
                  />
                  <button
                    onClick={saveName}
                    disabled={savingName}
                    className="p-1 text-primary disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    disabled={savingName}
                    className="p-1 text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={
                    isSignedIn ? openNameEditor : () => setLocation("/auth")
                  }
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
              title={tr("تسجيل الخروج", "Sign out")}
              className="w-10 h-10 rounded-full border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={openSupport}
              title={tr("تواصل معنا للمساعدة", "Contact us for help")}
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
              <p className="font-black text-base">
                {tr("تسجيل الدخول / إنشاء حساب", "Sign in / Create account")}
              </p>
              <p className="text-primary-foreground/70 text-xs mt-0.5">
                {tr(
                  "بالبريد الإلكتروني أو رقم الهاتف (OTP)",
                  "With email or phone number (OTP)",
                )}
              </p>
            </div>
            <ChevronLeft className="w-5 h-5 opacity-70 shrink-0" />
          </button>
        )}

        {/* Stats row */}
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="grid grid-cols-2 divide-x divide-x-reverse divide-border">
            {/* Orders */}
            <Link href="/orders">
              <div className="flex flex-col items-center py-5 gap-1.5 hover:bg-muted/40 transition-colors cursor-pointer">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Package className="w-5 h-5 text-amber-500" />
                </div>
                <span className="text-xs font-bold text-muted-foreground">
                  {tr("الطلبات", "Orders")}
                </span>
                <span className="text-lg font-black">{ordersCount}</span>
              </div>
            </Link>
            {/* Coupons */}
            <div className="flex flex-col items-center py-5 gap-1.5">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                <span className="text-rose text-lg">🎟️</span>
              </div>
              <span className="text-xs font-bold text-muted-foreground">
                {tr("قسائم", "Coupons")}
              </span>
              <span className="text-xs font-black text-rose">
                {tr("قريباً", "Coming soon")}
              </span>
            </div>
          </div>
        </div>

        {/* Referral banner */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-3">
          <div className="text-3xl">🎁</div>
          <div className="flex-1">
            <p className="font-black text-sm">
              {tr("شارك واربح خصومات", "Share and earn discounts")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tr(
                "مكافآت لك وللأصدقاء أيضاً!",
                "Rewards for you and your friends too!",
              )}
            </p>
          </div>
          <button className="bg-primary text-primary-foreground text-xs font-black px-3 py-1.5 rounded-xl">
            {tr("شارك", "Share")}
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
                  <span className="text-xs text-muted-foreground font-medium">
                    {row.suffix}
                  </span>
                )}
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </div>
            );
            return row.href ? (
              <Link key={row.label} href={row.href}>
                {inner}
              </Link>
            ) : (
              <div
                key={row.label}
                onClick={(row as { onPress?: () => void }).onPress}
                className="cursor-pointer"
              >
                {inner}
              </div>
            );
          })}
        </div>

        {/* Vendor dashboard link — vendors and the app owner only */}
        {isSignedIn && (isVendor || isSuperAdmin) && (
          <Link href="/vendor-dashboard">
            <div className="bg-background rounded-2xl border border-primary/30 overflow-hidden shadow-sm px-4 py-4 flex items-center gap-3 hover:bg-primary/5 transition-colors cursor-pointer">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <span className="font-bold text-sm block">
                  {tr("إدارة متجري", "Manage my store")}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {tr(
                    "أضف وعدّل واحذف منتجاتك",
                    "Add, edit, and remove your products",
                  )}
                </span>
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        )}

        {/* Admin link — app owner (super-admin) only */}
        {isSuperAdmin && (
          <Link href="/admin">
            <div className="bg-background rounded-2xl border border-rose/30 overflow-hidden shadow-sm px-4 py-4 flex items-center gap-3 hover:bg-rose/5 transition-colors cursor-pointer">
              <div className="w-9 h-9 rounded-xl bg-rose/10 flex items-center justify-center shrink-0">
                <Settings className="w-5 h-5 text-rose" />
              </div>
              <span className="flex-1 font-bold text-sm">
                {tr("لوحة إدارة المنتجات", "Product admin dashboard")}
              </span>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        )}

        <p className="text-center text-xs text-muted-foreground pb-4">
          {tr(
            "الطيبات — الإصدار 1.1.0 · صنع بكل حب في الأردن 🇯🇴",
            "Al-Tayebat — Version 1.1.0 · Made with love in Jordan 🇯🇴",
          )}
        </p>
      </div>
    </div>
  );
}

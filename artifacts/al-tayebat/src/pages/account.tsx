import { Link, useLocation } from "wouter";
import {
  ChevronLeft, MapPin, Heart, Package, Globe, Settings,
  CreditCard, Zap, Gift, UserCircle,
} from "lucide-react";
import { useUser, useClerk, useAuth } from "@clerk/react";
import { useListOrders } from "@workspace/api-client-react";
import { useSession } from "@/hooks/use-session";

export default function Account() {
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const sessionId = useSession();

  const { data: orders } = useListOrders(
    { sessionId },
    { query: { enabled: !!sessionId } }
  );

  const displayName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    localStorage.getItem("al_tayebat_name") ||
    "ضيف";

  const ordersCount = orders?.length ?? 0;

  const menuRows = [
    { icon: CreditCard, label: "طرق الدفع", iconColor: "text-blue-500", href: null },
    { icon: MapPin, label: "العنوان", iconColor: "text-rose", href: null },
    { icon: Heart, label: "المفضلة", iconColor: "text-pink-500", href: null },
    { icon: Zap, label: "ضمان التوصيل في الوقت المحدد", iconColor: "text-green-500", href: null },
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
              <button
                onClick={() => isSignedIn ? null : setLocation("/auth")}
                className="flex items-center gap-1 font-black text-base"
              >
                {displayName}
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
          {/* Support icon */}
          <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center cursor-pointer hover:bg-muted transition-colors">
            <span className="text-lg">🎧</span>
          </div>
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
            <div className="flex flex-col items-center py-5 gap-1.5">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-500" />
              </div>
              <span className="text-xs font-bold text-muted-foreground">المحفظة</span>
              <span className="text-lg font-black">0.00</span>
            </div>
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
              <div key={row.label} className="cursor-pointer">{inner}</div>
            );
          })}
        </div>

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

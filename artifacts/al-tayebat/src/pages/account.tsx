import { Link } from "wouter";
import { ChevronRight, UserCircle, Phone, MapPin, Package, HeartHandshake, LogIn, LogOut, Settings } from "lucide-react";
import { useUser, useClerk, useAuth } from "@clerk/react";

export default function Account() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut, openUserProfile, openSignIn } = useClerk();

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress?.split("@")[0] || localStorage.getItem("al_tayebat_name") || "";
  const phone = user?.primaryPhoneNumber?.phoneNumber || localStorage.getItem("al_tayebat_phone") || "";
  const address = localStorage.getItem("al_tayebat_address") || "";
  const email = user?.primaryEmailAddress?.emailAddress || "";

  return (
    <div className="pb-8 min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm">
        <h1 className="text-2xl font-bold mb-4">حسابي</h1>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary-foreground/30 bg-primary-foreground/20 flex items-center justify-center">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <UserCircle className="w-10 h-10" />
            )}
          </div>
          <div>
            <h2 className="font-bold text-lg">{name || "ضيف (زائر)"}</h2>
            {email && <p className="text-primary-foreground/75 text-sm">{email}</p>}
            {phone && !email && <p className="text-primary-foreground/75 text-sm" dir="ltr">{phone}</p>}
            {isSignedIn ? (
              <span className="inline-flex items-center gap-1 mt-1 bg-primary-foreground/20 text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                مسجّل الدخول
              </span>
            ) : (
              <p className="text-primary-foreground/60 text-xs mt-1">سجّل دخولك لحفظ طلباتك</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-4">
        {/* Auth Section */}
        {!isSignedIn ? (
          <button
            onClick={() => openSignIn({})}
            className="w-full bg-rose text-white rounded-2xl p-4 flex items-center justify-between cursor-pointer shadow-sm hover:bg-rose/90 transition-colors"
          >
            <div className="flex items-center gap-3">
              <LogIn className="w-5 h-5" />
              <div className="text-right">
                <p className="font-bold">تسجيل الدخول / إنشاء حساب</p>
                <p className="text-white/75 text-xs mt-0.5">بالإيميل أو Google أو GitHub</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 opacity-70 rotate-180 shrink-0" />
          </button>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <button
              onClick={() => openUserProfile()}
              className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors border-b border-border"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-primary" />
                <span className="font-bold">إدارة الحساب</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
            </button>
            <button
              onClick={() => signOut()}
              className="w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-destructive"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-bold">تسجيل الخروج</span>
            </button>
          </div>
        )}

        {/* Delivery Info */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <h3 className="font-bold text-sm text-muted-foreground">معلومات التوصيل المحفوظة</h3>
          </div>
          <div className="p-4 space-y-4">
            {phone && (
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">رقم الهاتف</p>
                  <p className="font-medium text-sm" dir="ltr">{phone}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">آخر عنوان توصيل</p>
                <p className="font-medium text-sm leading-relaxed">{address || "لم يُحدَّد بعد"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <Link href="/orders">
            <div className="p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer border-b border-border">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-primary" />
                <span className="font-bold">طلباتي السابقة</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
            </div>
          </Link>
          <Link href="/admin">
            <div className="p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer border-b border-border">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-rose" />
                <span className="font-bold">إدارة المنتجات</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
            </div>
          </Link>
          <div className="p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer">
            <div className="flex items-center gap-3">
              <HeartHandshake className="w-5 h-5 text-accent" />
              <span className="font-bold">تواصل معنا</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground pt-4">
          <p>تطبيق الطيبات — الإصدار 1.1.0</p>
          <p className="mt-1">صنع بكل حب في الأردن 🇯🇴</p>
        </div>
      </div>
    </div>
  );
}

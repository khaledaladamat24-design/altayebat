import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, useUser } from "@clerk/react";
import { Store, ShoppingBag, ChevronLeft, Loader2, CheckCircle2, Building2, Phone, MapPin, CreditCard, Wallet } from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api-url";

type Step = "role" | "vendor-details" | "vendor-payout" | "done";

const CATEGORIES = [
  { value: "keto", label: "منتجات كيتو" },
  { value: "organic", label: "خضروات عضوية" },
  { value: "pantry", label: "مؤونة صحية" },
  { value: "dairy", label: "ألبان ومشتقات" },
  { value: "nuts", label: "مكسرات وبذور" },
  { value: "sweets", label: "حلويات طبيعية" },
  { value: "meat", label: "لحوم ودواجن" },
  { value: "beverages", label: "مشروبات صحية" },
];

const CITIES = ["عمان", "الزرقاء", "إربد", "العقبة", "المفرق", "الكرك", "مادبا", "السلط", "جرش", "عجلون"];

export default function Register() {
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<"consumer" | "vendor">("consumer");
  const [loading, setLoading] = useState(false);

  const [vendorDetails, setVendorDetails] = useState({
    storeName: "",
    storeNameAr: "",
    category: "",
    description: "",
    phone: "",
    city: "",
  });

  const [payoutDetails, setPayoutDetails] = useState({
    cliqAlias: "",
    walletNumber: "",
    bankAccount: "",
    deliveryFeeFixed: "1.500",
    freeDeliveryAbove: "20.000",
  });

  const collectIdentity = () => {
    const email = user?.primaryEmailAddress?.emailAddress || localStorage.getItem("al_tayebat_email") || null;
    const phone = user?.primaryPhoneNumber?.phoneNumber || localStorage.getItem("al_tayebat_phone") || null;
    const name = user?.fullName || localStorage.getItem("al_tayebat_name") || null;
    const firebaseUid = localStorage.getItem("al_tayebat_firebase_uid") || null;
    return { email, phone, name, firebaseUid, clerkId: user?.id || null };
  };

  const saveUserProfile = async (r: "consumer" | "vendor") => {
    const id = collectIdentity();
    if (!id.email && !id.phone) {
      throw new Error("لم نجد بريد إلكتروني أو رقم هاتف — يرجى تسجيل الدخول أولاً");
    }
    const res = await fetch(apiUrl("/api/users/profile"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...id, role: r }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `فشل حفظ الملف الشخصي (HTTP ${res.status})`);
    }
    return res.json();
  };

  const handleConsumer = async () => {
    setLoading(true);
    try {
      const profile = await saveUserProfile("consumer");
      localStorage.setItem("al_tayebat_role", "consumer");
      localStorage.setItem("al_tayebat_user_id", String(profile.id));
      toast.success("أهلاً بك في الطيبات!");
      setLocation("/");
    } catch (err) {
      toast.error((err as Error).message || "حدث خطأ، حاول مجدداً");
    }
    setLoading(false);
  };

  const handleVendorDetails = () => {
    if (!vendorDetails.storeName || !vendorDetails.category) {
      toast.error("يرجى تعبئة اسم المتجر والتخصص");
      return;
    }
    setStep("vendor-payout");
  };

  const handleVendorSubmit = async () => {
    setLoading(true);
    try {
      const userProfile = await saveUserProfile("vendor");
      if (!userProfile?.id) throw new Error("لم نتمكن من إنشاء حساب المورد");

      const vRes = await fetch(apiUrl("/api/vendors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userProfile.id,
          ...vendorDetails,
          ...payoutDetails,
        }),
      });
      if (!vRes.ok) {
        const body = await vRes.json().catch(() => ({}));
        throw new Error(body.error || `فشل تسجيل المتجر (HTTP ${vRes.status})`);
      }
      const vendor = await vRes.json();
      localStorage.setItem("al_tayebat_role", "vendor");
      localStorage.setItem("al_tayebat_user_id", String(userProfile.id));
      localStorage.setItem("al_tayebat_vendor_id", String(vendor.id));
      toast.success("تم تسجيل متجرك بنجاح! 🎉");
      // No more "waiting for approval" — vendors get instant access to their dashboard
      setLocation("/vendor-dashboard");
    } catch (err) {
      toast.error((err as Error).message || "حدث خطأ أثناء تسجيل المتجر");
    }
    setLoading(false);
  };

  const headerImg = (
    <div className="relative h-36 shrink-0 overflow-hidden rounded-b-3xl">
      <img src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80" alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-primary/70 to-primary/90" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="text-white text-2xl font-black drop-shadow">الطيبات</span>
        <span className="text-white/80 text-sm">اختر طريقة المشاركة</span>
      </div>
    </div>
  );


  if (step === "vendor-payout") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-5 overflow-y-auto">
          <button onClick={() => setStep("vendor-details")} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ChevronLeft className="w-4 h-4" /> رجوع
          </button>
          <div>
            <h2 className="text-xl font-black">بيانات الدفع والتوصيل</h2>
            <p className="text-sm text-muted-foreground mt-1">ستُعرض للمستهلك لإتمام الدفع المباشر</p>
          </div>

          <div className="space-y-3">
            <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
                <CreditCard className="w-4 h-4" /> معلومات كليك CliQ
              </div>
              <input value={payoutDetails.cliqAlias} onChange={e => setPayoutDetails(p => ({ ...p, cliqAlias: e.target.value }))}
                placeholder="معرف كليك (مثال: mystore)" dir="ltr"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
            </div>

            <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
                <Wallet className="w-4 h-4" /> المحفظة الإلكترونية
              </div>
              <input value={payoutDetails.walletNumber} onChange={e => setPayoutDetails(p => ({ ...p, walletNumber: e.target.value }))}
                placeholder="رقم المحفظة (مثال: 0791234567)" dir="ltr"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
            </div>

            <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
                <Building2 className="w-4 h-4" /> الحساب البنكي (اختياري)
              </div>
              <input value={payoutDetails.bankAccount} onChange={e => setPayoutDetails(p => ({ ...p, bankAccount: e.target.value }))}
                placeholder="رقم IBAN أو الحساب" dir="ltr"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
            </div>

            <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
                <MapPin className="w-4 h-4" /> رسوم التوصيل
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">رسوم ثابتة (د.أ)</label>
                  <input type="number" step="0.001" value={payoutDetails.deliveryFeeFixed}
                    onChange={e => setPayoutDetails(p => ({ ...p, deliveryFeeFixed: e.target.value }))}
                    className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" dir="ltr" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">توصيل مجاني فوق (د.أ)</label>
                  <input type="number" step="0.001" value={payoutDetails.freeDeliveryAbove}
                    onChange={e => setPayoutDetails(p => ({ ...p, freeDeliveryAbove: e.target.value }))}
                    className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" dir="ltr" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">* يمكنك تعديل هذه الأسعار لاحقاً من لوحة التحكم</p>
            </div>
          </div>

          <button onClick={handleVendorSubmit} disabled={loading}
            className="w-full h-14 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-black text-lg rounded-2xl flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? "جاري الحفظ..." : "إنشاء متجري ✓"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "vendor-details") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-4 overflow-y-auto">
          <button onClick={() => setStep("role")} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ChevronLeft className="w-4 h-4" /> رجوع
          </button>
          <div>
            <h2 className="text-xl font-black">تفاصيل متجرك</h2>
            <p className="text-sm text-muted-foreground mt-1">أخبرنا عن مطبخك أو متجرك الصحي</p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">اسم المتجر بالعربي *</label>
              <input value={vendorDetails.storeNameAr} onChange={e => setVendorDetails(v => ({ ...v, storeNameAr: e.target.value }))}
                placeholder="مثال: مطبخ أم خالد الصحي"
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-4 text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">اسم المتجر بالإنجليزي *</label>
              <input value={vendorDetails.storeName} onChange={e => setVendorDetails(v => ({ ...v, storeName: e.target.value }))}
                placeholder="e.g. Om Khalid Healthy Kitchen" dir="ltr"
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-4 text-sm outline-none focus:border-primary" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">التخصص الغذائي *</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat.value} type="button" onClick={() => setVendorDetails(v => ({ ...v, category: cat.value }))}
                    className={`h-11 rounded-xl text-sm font-medium border-2 transition-all ${vendorDetails.category === cat.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30"}`}>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">المدينة</label>
              <select value={vendorDetails.city} onChange={e => setVendorDetails(v => ({ ...v, city: e.target.value }))}
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-4 text-sm outline-none focus:border-primary">
                <option value="">اختر المدينة</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">رقم الهاتف للتواصل</label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={vendorDetails.phone} onChange={e => setVendorDetails(v => ({ ...v, phone: e.target.value }))}
                  placeholder="07XXXXXXXX" dir="ltr"
                  className="w-full h-12 rounded-xl border border-border bg-muted/30 pr-10 pl-4 text-sm outline-none focus:border-primary" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">وصف قصير (اختياري)</label>
              <textarea value={vendorDetails.description} onChange={e => setVendorDetails(v => ({ ...v, description: e.target.value }))}
                placeholder="اكتب وصفاً موجزاً عن متجرك ومنتجاتك..."
                rows={3}
                className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm outline-none focus:border-primary resize-none" />
            </div>
          </div>

          <button onClick={handleVendorDetails}
            className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg rounded-2xl">
            التالي — بيانات الدفع
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
      {headerImg}
      <div className="flex-1 px-6 py-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-black">كيف تريد المشاركة؟</h1>
          <p className="text-muted-foreground text-sm mt-1">اختر دورك في منصة الطيبات</p>
        </div>

        <button onClick={() => { setRole("consumer"); setStep("role"); }}
          className={`w-full p-5 rounded-2xl border-2 text-right transition-all space-y-2 ${role === "consumer" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          onClickCapture={() => setRole("consumer")}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${role === "consumer" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="font-black text-lg">مستهلك</p>
              <p className="text-muted-foreground text-sm">أريد شراء منتجات صحية</p>
            </div>
            {role === "consumer" && <CheckCircle2 className="w-5 h-5 text-primary mr-auto" />}
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 pr-15">
            <li>✓ تصفح آلاف المنتجات الصحية</li>
            <li>✓ طلب وتوصيل لبابك</li>
            <li>✓ دفع مباشر للمورد بدون عمولات</li>
          </ul>
        </button>

        <button onClick={() => { setRole("vendor"); setStep("role"); }}
          className={`w-full p-5 rounded-2xl border-2 text-right transition-all space-y-2 ${role === "vendor" ? "border-rose bg-rose/5" : "border-border bg-card"}`}
          onClickCapture={() => setRole("vendor")}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${role === "vendor" ? "bg-rose text-white" : "bg-muted text-muted-foreground"}`}>
              <Store className="w-6 h-6" />
            </div>
            <div>
              <p className="font-black text-lg">مورّد / بائع</p>
              <p className="text-muted-foreground text-sm">أريد بيع منتجاتي الصحية</p>
            </div>
            {role === "vendor" && <CheckCircle2 className="w-5 h-5 text-rose mr-auto" />}
          </div>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>✓ أنشئ متجرك المجاني في دقائق</li>
            <li>✓ استقبل الدفع مباشرة (كليك / محفظة)</li>
            <li>✓ صفر عمولات على مبيعاتك</li>
          </ul>
        </button>

        <div className="space-y-3 pt-2">
          {role === "consumer" ? (
            <button onClick={handleConsumer} disabled={loading}
              className="w-full h-14 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-black text-lg rounded-2xl flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? "جاري التسجيل..." : "ابدأ التسوق الآن →"}
            </button>
          ) : (
            <button onClick={() => setStep("vendor-details")}
              className="w-full h-14 bg-rose hover:bg-rose/90 text-white font-black text-lg rounded-2xl">
              أنشئ متجرك →
            </button>
          )}

          <button onClick={() => setLocation("/")} className="w-full text-center text-sm text-muted-foreground py-2">
            تخطّى — أتصفح كضيف
          </button>
        </div>
      </div>
    </div>
  );
}

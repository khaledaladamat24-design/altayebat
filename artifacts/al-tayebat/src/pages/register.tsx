import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  Store,
  ShoppingBag,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Building2,
  Phone,
  MapPin,
  CreditCard,
  Wallet,
  Leaf,
} from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api-url";
import { useLanguage } from "@/contexts/language";
import { takeReturnTo } from "@/lib/post-auth";
import { JORDAN_PROVINCES } from "@/lib/provinces";

type Step = "role" | "vendor-details" | "vendor-payout" | "done";

export default function Register() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { dir, tr } = useLanguage();

  // Vendor specialty is now anchored on the 3 app zones (food_type). Stored as
  // a comma-separated list in the single `category` text column so a vendor can
  // span one or all zones — no DB change needed. The rest of the app keeps its
  // own category dropdowns unchanged.
  const CATEGORIES = [
    { value: "healthy", label: tr("صحي", "Healthy") },
    { value: "regular", label: tr("متنوع", "Regular") },
    { value: "grocery", label: tr("بقالة", "Grocery") },
  ];

  // Single source of truth shared with the customer province filter so a
  // vendor's saved city always matches a filter value exactly.
  const CITIES = JORDAN_PROVINCES.map((p) => ({
    value: p.ar,
    label: tr(p.ar, p.en),
  }));

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
    const email =
      user?.primaryEmailAddress?.emailAddress ||
      localStorage.getItem("al_tayebat_email") ||
      null;
    const phone =
      user?.primaryPhoneNumber?.phoneNumber ||
      localStorage.getItem("al_tayebat_phone") ||
      null;
    const name =
      user?.fullName || localStorage.getItem("al_tayebat_name") || null;
    const firebaseUid = localStorage.getItem("al_tayebat_firebase_uid") || null;
    return { email, phone, name, firebaseUid, clerkId: user?.id || null };
  };

  // How the user signed in, stashed by the auth flow. Persisted alongside the
  // chosen role so returning logins know the user has onboarded (skip this
  // screen). Falls back to inference from the identity columns just in case.
  const resolveAuthMethod = (id: ReturnType<typeof collectIdentity>) => {
    const stored = localStorage.getItem("al_tayebat_auth_method");
    if (stored) return stored;
    if (id.firebaseUid && id.email) return "google";
    if (id.firebaseUid) return "phone";
    return "email";
  };

  const saveUserProfile = async (r: "consumer" | "vendor") => {
    const id = collectIdentity();
    if (!id.email && !id.phone) {
      throw new Error(
        tr(
          "لم نجد بريد إلكتروني أو رقم هاتف — يرجى تسجيل الدخول أولاً",
          "No email or phone found — please sign in first",
        ),
      );
    }
    const res = await fetch(apiUrl("/api/users/profile"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...id,
        role: r,
        authMethod: resolveAuthMethod(id),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        body.error ||
          tr(
            `فشل حفظ الملف الشخصي (HTTP ${res.status})`,
            `Failed to save profile (HTTP ${res.status})`,
          ),
      );
    }
    return res.json();
  };

  const handleConsumer = async () => {
    setLoading(true);
    try {
      const profile = await saveUserProfile("consumer");
      localStorage.setItem("al_tayebat_role", "consumer");
      localStorage.setItem("al_tayebat_user_id", String(profile.id));
      toast.success(tr("أهلاً بك في الطيبات!", "Welcome to Al-Tayebat!"));
      // Return to wherever the user came from (e.g. checkout) when applicable.
      setLocation(takeReturnTo() || "/");
    } catch (err) {
      toast.error(
        (err as Error).message ||
          tr("حدث خطأ، حاول مجدداً", "Something went wrong, please try again"),
      );
    }
    setLoading(false);
  };

  const handleVendorDetails = () => {
    if (!vendorDetails.storeNameAr.trim() || !vendorDetails.category) {
      toast.error(
        tr(
          "يرجى تعبئة اسم المتجر بالعربي والتخصص",
          "Please enter the Arabic store name and specialty",
        ),
      );
      return;
    }
    const phone = vendorDetails.phone.trim();
    if (!phone) {
      toast.error(
        tr("رقم الهاتف للتواصل مطلوب", "Contact phone number is required"),
      );
      return;
    }
    if (!/^07\d{8}$/.test(phone)) {
      toast.error(
        tr(
          "أدخل رقم هاتف أردني صحيح (07XXXXXXXX)",
          "Enter a valid Jordanian phone number (07XXXXXXXX)",
        ),
      );
      return;
    }
    setStep("vendor-payout");
  };

  const handleVendorSubmit = async () => {
    setLoading(true);
    try {
      const userProfile = await saveUserProfile("vendor");
      if (!userProfile?.id)
        throw new Error(
          tr(
            "لم نتمكن من إنشاء حساب البائع",
            "We couldn't create the seller account",
          ),
        );

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
        throw new Error(
          body.error ||
            tr(
              `فشل تسجيل المتجر (HTTP ${vRes.status})`,
              `Failed to register the store (HTTP ${vRes.status})`,
            ),
        );
      }
      const vendor = await vRes.json();
      localStorage.setItem("al_tayebat_role", "vendor");
      localStorage.setItem("al_tayebat_user_id", String(userProfile.id));
      localStorage.setItem("al_tayebat_vendor_id", String(vendor.id));
      toast.success(
        tr("تم تسجيل متجرك بنجاح! 🎉", "Your store has been registered! 🎉"),
      );
      // No more "waiting for approval" — vendors get instant access to their dashboard
      setLocation("/vendor-dashboard");
    } catch (err) {
      toast.error(
        (err as Error).message ||
          tr(
            "حدث خطأ أثناء تسجيل المتجر",
            "Something went wrong while registering the store",
          ),
      );
    }
    setLoading(false);
  };

  const headerImg = (
    <div className="relative shrink-0 overflow-hidden rounded-b-[2rem] bg-gradient-to-bl from-primary via-primary to-rose px-6 pt-10 pb-7">
      <div className="absolute -top-12 -right-10 w-36 h-36 rounded-full bg-white/10" />
      <div className="absolute -bottom-12 -left-8 w-40 h-40 rounded-full bg-white/5" />
      <div className="relative flex flex-col items-center gap-2.5">
        <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/25">
          <Leaf className="w-8 h-8 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-white text-2xl font-black drop-shadow-sm">
            {tr("الطيبات", "Al-Tayebat")}
          </h1>
          <p className="text-white/85 text-sm mt-0.5">
            {tr("اختر طريقة المشاركة", "Choose how to join")}
          </p>
        </div>
      </div>
    </div>
  );

  if (step === "vendor-payout") {
    return (
      <div
        className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
        dir={dir}
      >
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-5 overflow-y-auto">
          <button
            onClick={() => setStep("vendor-details")}
            className="flex items-center gap-1 text-muted-foreground text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> {tr("رجوع", "Back")}
          </button>
          <div>
            <h2 className="text-xl font-black">
              {tr("بيانات الدفع والتوصيل", "Payment & delivery details")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tr(
                "ستُعرض للمستهلك لإتمام الدفع المباشر",
                "Shown to the consumer to complete the direct payment",
              )}
            </p>
          </div>

          <div className="space-y-3">
            <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
                <CreditCard className="w-4 h-4" />{" "}
                {tr("معلومات كليك CliQ", "CliQ details")}
              </div>
              <input
                value={payoutDetails.cliqAlias}
                onChange={(e) =>
                  setPayoutDetails((p) => ({ ...p, cliqAlias: e.target.value }))
                }
                placeholder={tr(
                  "معرف كليك (مثال: mystore)",
                  "CliQ alias (e.g. mystore)",
                )}
                dir="ltr"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
                <Wallet className="w-4 h-4" />{" "}
                {tr("المحفظة الإلكترونية", "E-wallet")}
              </div>
              <input
                value={payoutDetails.walletNumber}
                onChange={(e) =>
                  setPayoutDetails((p) => ({
                    ...p,
                    walletNumber: e.target.value,
                  }))
                }
                placeholder={tr(
                  "رقم المحفظة (مثال: 0791234567)",
                  "Wallet number (e.g. 0791234567)",
                )}
                dir="ltr"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
                <Building2 className="w-4 h-4" />{" "}
                {tr("الحساب البنكي (اختياري)", "Bank account (optional)")}
              </div>
              <input
                value={payoutDetails.bankAccount}
                onChange={(e) =>
                  setPayoutDetails((p) => ({
                    ...p,
                    bankAccount: e.target.value,
                  }))
                }
                placeholder={tr("رقم IBAN أو الحساب", "IBAN or account number")}
                dir="ltr"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="bg-muted/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary mb-1">
                <MapPin className="w-4 h-4" />{" "}
                {tr("رسوم التوصيل", "Delivery fees")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {tr("رسوم ثابتة (د.أ)", "Flat fee (JOD)")}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={payoutDetails.deliveryFeeFixed}
                    onChange={(e) =>
                      setPayoutDetails((p) => ({
                        ...p,
                        deliveryFeeFixed: e.target.value,
                      }))
                    }
                    className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {tr("توصيل مجاني فوق (د.أ)", "Free delivery above (JOD)")}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={payoutDetails.freeDeliveryAbove}
                    onChange={(e) =>
                      setPayoutDetails((p) => ({
                        ...p,
                        freeDeliveryAbove: e.target.value,
                      }))
                    }
                    className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    dir="ltr"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "* يمكنك تعديل هذه الأسعار لاحقاً من لوحة التحكم",
                  "* You can adjust these later from your dashboard",
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleVendorSubmit}
            disabled={loading}
            className="w-full h-14 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-black text-lg rounded-2xl flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading
              ? tr("جاري الحفظ...", "Saving...")
              : tr("إنشاء متجري ✓", "Create my store ✓")}
          </button>
        </div>
      </div>
    );
  }

  if (step === "vendor-details") {
    return (
      <div
        className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
        dir={dir}
      >
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-4 overflow-y-auto">
          <button
            onClick={() => setStep("role")}
            className="flex items-center gap-1 text-muted-foreground text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> {tr("رجوع", "Back")}
          </button>
          <div>
            <h2 className="text-xl font-black">
              {tr("تفاصيل متجرك", "Your store details")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tr(
                "أخبرنا عن مطبخك أو متجرك الصحي",
                "Tell us about your kitchen or healthy store",
              )}
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">
                {tr("اسم المتجر بالعربي *", "Store name (Arabic) *")}
              </label>
              <input
                value={vendorDetails.storeNameAr}
                onChange={(e) =>
                  setVendorDetails((v) => ({
                    ...v,
                    storeNameAr: e.target.value,
                  }))
                }
                placeholder={tr(
                  "مثال: مطبخ أم خالد الصحي",
                  "e.g. مطبخ أم خالد الصحي",
                )}
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-4 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">
                {tr(
                  "اسم المتجر بالإنجليزي (اختياري)",
                  "Store name (English) (optional)",
                )}
              </label>
              <input
                value={vendorDetails.storeName}
                onChange={(e) =>
                  setVendorDetails((v) => ({ ...v, storeName: e.target.value }))
                }
                placeholder="e.g. Om Khalid Healthy Kitchen"
                dir="ltr"
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-4 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">
                {tr("التخصص الغذائي *", "Food specialty *")}
              </label>
              <p className="text-[11px] text-muted-foreground">
                {tr(
                  "يمكنك اختيار أكثر من تخصص",
                  "You can choose more than one",
                )}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((cat) => {
                  const selected = vendorDetails.category
                    .split(",")
                    .filter(Boolean);
                  const isActive = selected.includes(cat.value);
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() =>
                        setVendorDetails((v) => {
                          const cur = v.category.split(",").filter(Boolean);
                          const next = cur.includes(cat.value)
                            ? cur.filter((c) => c !== cat.value)
                            : [...cur, cat.value];
                          return { ...v, category: next.join(",") };
                        })
                      }
                      className={`h-11 rounded-xl text-sm font-medium border-2 transition-all ${isActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30"}`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">
                {tr("المدينة", "City")}
              </label>
              <select
                value={vendorDetails.city}
                onChange={(e) =>
                  setVendorDetails((v) => ({ ...v, city: e.target.value }))
                }
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-4 text-sm outline-none focus:border-primary"
              >
                <option value="">{tr("اختر المدينة", "Select a city")}</option>
                {CITIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">
                {tr("رقم الهاتف للتواصل *", "Contact phone number *")}
              </label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={vendorDetails.phone}
                  onChange={(e) =>
                    setVendorDetails((v) => ({ ...v, phone: e.target.value }))
                  }
                  placeholder="07XXXXXXXX"
                  dir="ltr"
                  className="w-full h-12 rounded-xl border border-border bg-muted/30 pr-10 pl-4 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">
                {tr("وصف قصير (اختياري)", "Short description (optional)")}
              </label>
              <textarea
                value={vendorDetails.description}
                onChange={(e) =>
                  setVendorDetails((v) => ({
                    ...v,
                    description: e.target.value,
                  }))
                }
                placeholder={tr(
                  "اكتب وصفاً موجزاً عن متجرك ومنتجاتك...",
                  "Write a brief description of your store and products...",
                )}
                rows={3}
                className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm outline-none focus:border-primary resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleVendorDetails}
            className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg rounded-2xl"
          >
            {tr("التالي — بيانات الدفع", "Next — Payment details")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
      dir={dir}
    >
      {headerImg}
      <div className="flex-1 px-6 py-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-black">
            {tr("كيف تريد المشاركة؟", "How do you want to join?")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tr(
              "اختر دورك في منصة الطيبات",
              "Pick your role on the Al-Tayebat platform",
            )}
          </p>
        </div>

        <button
          onClick={() => {
            setRole("consumer");
            setStep("role");
          }}
          className={`w-full p-5 rounded-2xl border-2 text-right transition-all space-y-2 ${role === "consumer" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          onClickCapture={() => setRole("consumer")}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${role === "consumer" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="font-black text-lg">{tr("مستهلك", "Consumer")}</p>
              <p className="text-muted-foreground text-sm">
                {tr("أريد شراء منتجات صحية", "I want to buy healthy products")}
              </p>
            </div>
            {role === "consumer" && (
              <CheckCircle2 className="w-5 h-5 text-primary mr-auto" />
            )}
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 pr-15">
            <li>
              {tr(
                "✓ تصفح آلاف المنتجات الصحية",
                "✓ Browse thousands of healthy products",
              )}
            </li>
            <li>
              {tr(
                "✓ طلب وتوصيل لبابك",
                "✓ Order and have it delivered to your door",
              )}
            </li>
            <li>
              {tr(
                "✓ دفع مباشر للبائع بدون عمولات",
                "✓ Pay vendors directly with no commissions",
              )}
            </li>
          </ul>
        </button>

        <button
          onClick={() => {
            setRole("vendor");
            setStep("role");
          }}
          className={`w-full p-5 rounded-2xl border-2 text-right transition-all space-y-2 ${role === "vendor" ? "border-rose bg-rose/5" : "border-border bg-card"}`}
          onClickCapture={() => setRole("vendor")}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${role === "vendor" ? "bg-rose text-white" : "bg-muted text-muted-foreground"}`}
            >
              <Store className="w-6 h-6" />
            </div>
            <div>
              <p className="font-black text-lg">{tr("بائع", "Seller")}</p>
              <p className="text-muted-foreground text-sm">
                {tr("أريد بيع منتجاتي", "I want to sell my products")}
              </p>
            </div>
            {role === "vendor" && (
              <CheckCircle2 className="w-5 h-5 text-rose mr-auto" />
            )}
          </div>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>
              {tr(
                "✓ أنشئ متجرك المجاني في دقائق",
                "✓ Set up your free store in minutes",
              )}
            </li>
            <li>
              {tr(
                "✓ استقبل الدفع مباشرة (كليك / محفظة)",
                "✓ Get paid directly (CliQ / e-wallet)",
              )}
            </li>
            <li>
              {tr(
                "✓ صفر عمولات على مبيعاتك",
                "✓ Zero commissions on your sales",
              )}
            </li>
          </ul>
        </button>

        <div className="space-y-3 pt-2">
          {role === "consumer" ? (
            <button
              onClick={handleConsumer}
              disabled={loading}
              className="w-full h-14 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-black text-lg rounded-2xl flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading
                ? tr("جاري التسجيل...", "Signing up...")
                : tr("ابدأ التسوق الآن →", "Start shopping now →")}
            </button>
          ) : (
            <button
              onClick={() => setStep("vendor-details")}
              className="w-full h-14 bg-rose hover:bg-rose/90 text-white font-black text-lg rounded-2xl"
            >
              {tr("أنشئ متجرك →", "Create your store →")}
            </button>
          )}

          <button
            onClick={() => setLocation("/")}
            className="w-full text-center text-sm text-muted-foreground py-2"
          >
            {tr("تخطّى — أتصفح كضيف", "Skip — browse as guest")}
          </button>
        </div>
      </div>
    </div>
  );
}

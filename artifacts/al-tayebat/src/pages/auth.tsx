import { useState } from "react";
import { useLocation } from "wouter";
import { useClerk, useSignIn, useSignUp } from "@clerk/react";
import { Mail, Phone, Eye, EyeOff, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Mode = "landing" | "email-login" | "email-signup" | "phone" | "otp";

export default function Auth() {
  const [, setLocation] = useLocation();
  const { openSignIn } = useClerk();
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();

  const [mode, setMode] = useState<Mode>("landing");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);

  const skipAuth = () => {
    localStorage.setItem("al_tayebat_auth_skipped", "1");
    setLocation("/");
  };

  /* ── Email Login ── */
  const handleEmailLogin = async () => {
    if (!email) { toast.error("أدخل البريد الإلكتروني"); return; }
    if (!password) { toast.error("أدخل كلمة المرور"); return; }
    if (!signInLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });
      if (result.status === "complete") {
        setLocation("/");
      } else if (result.status === "needs_first_factor") {
        setPendingVerification(true);
        setMode("otp");
        toast("تم إرسال رمز التحقق إلى بريدك");
      }
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message;
      toast.error(msg === "Invalid credentials." ? "البريد أو كلمة المرور غير صحيحة" : (msg || "خطأ في تسجيل الدخول"));
    }
    setLoading(false);
  };

  /* ── Email Signup ── */
  const handleEmailSignup = async () => {
    if (!firstName.trim()) { toast.error("أدخل الاسم الأول"); return; }
    if (!email) { toast.error("أدخل البريد الإلكتروني"); return; }
    if (password.length < 8) { toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
    if (!signUpLoaded) return;
    setLoading(true);
    try {
      await signUp.create({
        firstName,
        lastName,
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
      setMode("otp");
      toast("تم إرسال رمز التحقق إلى بريدك الإلكتروني");
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message;
      toast.error(msg || "حدث خطأ في إنشاء الحساب");
    }
    setLoading(false);
  };

  /* ── OTP Verify ── */
  const handleOtpVerify = async () => {
    if (!otp || otp.length < 6) { toast.error("أدخل الرمز المكون من 6 أرقام"); return; }
    setLoading(true);
    try {
      if (pendingVerification && signUpLoaded && signUp.status !== "complete") {
        const result = await signUp.attemptEmailAddressVerification({ code: otp });
        if (result.status === "complete") {
          toast.success("تم إنشاء حسابك بنجاح 🎉");
          setLocation("/");
        }
      } else if (signInLoaded) {
        const result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: otp,
        });
        if (result.status === "complete") {
          toast.success("مرحباً بك في الطيبات!");
          setLocation("/");
        }
      }
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message;
      toast.error(msg || "الرمز غير صحيح");
    }
    setLoading(false);
  };

  /* ── Phone (via Clerk modal) ── */
  const handlePhone = () => {
    openSignIn({});
  };

  /* ─────────────────────────── UI ─────────────────────────── */

  const headerImg = (
    <div className="relative h-44 shrink-0 overflow-hidden rounded-b-3xl">
      <img
        src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80"
        alt="طعام صحي"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-primary/60 to-primary/80" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="text-white text-3xl font-black drop-shadow">الطيبات</span>
        <span className="text-white/80 text-sm">طعام صحي يوصل لبابك</span>
      </div>
    </div>
  );

  /* OTP screen */
  if (mode === "otp") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-8 space-y-6">
          <button onClick={() => { setMode(pendingVerification ? "email-signup" : "email-login"); setPendingVerification(false); }} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ArrowLeft className="w-4 h-4 rotate-180" /> رجوع
          </button>
          <div>
            <h2 className="text-2xl font-black">أدخل رمز التحقق</h2>
            <p className="text-muted-foreground text-sm mt-1">تم إرسال رمز مكون من 6 أرقام إلى <span className="text-foreground font-bold">{email}</span></p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="_ _ _ _ _ _"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
            className="w-full h-14 rounded-2xl border-2 border-primary/30 focus:border-primary bg-muted/30 text-center text-3xl font-black tracking-[0.5em] outline-none transition-colors"
            dir="ltr"
          />
          <button
            onClick={handleOtpVerify}
            disabled={loading || otp.length < 6}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {loading ? "جاري التحقق..." : "تأكيد"}
          </button>
          <button onClick={skipAuth} className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2">
            تخطّى — تصفح كضيف
          </button>
        </div>
      </div>
    );
  }

  /* Email Login screen */
  if (mode === "email-login") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-4">
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-muted-foreground text-sm mb-2">
            <ArrowLeft className="w-4 h-4 rotate-180" /> رجوع
          </button>
          <h2 className="text-2xl font-black">تسجيل الدخول</h2>

          {/* Email */}
          <div className="relative">
            <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-12 pl-4 py-3.5 text-sm outline-none focus:border-primary transition-colors text-right" dir="ltr" />
          </div>

          {/* Password */}
          <div className="relative">
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute left-4 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-muted-foreground" />}
            </button>
            <input type={showPassword ? "text" : "password"} placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleEmailLogin()} className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-4 pl-12 py-3.5 text-sm outline-none focus:border-primary transition-colors text-right" dir="ltr" />
          </div>

          {/* Remember me */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div onClick={() => setRememberMe(r => !r)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${rememberMe ? "bg-primary border-primary" : "border-border bg-muted/30"}`}>
              {rememberMe && <CheckCircle2 className="w-4 h-4 text-white fill-white" />}
            </div>
            <span className="text-sm font-medium text-foreground">تذكّرني</span>
          </label>

          <button onClick={handleEmailLogin} disabled={loading} className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>

          <div className="flex items-center gap-3"><div className="flex-1 h-px bg-border" /><span className="text-muted-foreground text-xs">أو</span><div className="flex-1 h-px bg-border" /></div>

          <button onClick={() => setMode("email-signup")} className="w-full h-12 border-2 border-primary text-primary font-black rounded-2xl hover:bg-primary/5 transition-all text-sm">
            إنشاء حساب جديد
          </button>
          <button onClick={skipAuth} className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1">تخطّى — تصفح كضيف</button>
        </div>
      </div>
    );
  }

  /* Email Signup screen */
  if (mode === "email-signup") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-4">
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-muted-foreground text-sm mb-2">
            <ArrowLeft className="w-4 h-4 rotate-180" /> رجوع
          </button>
          <h2 className="text-2xl font-black">إنشاء حساب جديد</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">الاسم الأول *</label>
              <input type="text" placeholder="أحمد" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary transition-colors" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">اسم العائلة</label>
              <input type="text" placeholder="محمد" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary transition-colors" />
            </div>
          </div>

          <div className="relative">
            <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-12 rounded-xl border border-border bg-muted/30 pr-11 pl-4 text-sm outline-none focus:border-primary transition-colors" dir="ltr" />
          </div>

          <div className="relative">
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute left-4 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
            <input type={showPassword ? "text" : "password"} placeholder="كلمة المرور (8 أحرف على الأقل)" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-12 rounded-xl border border-border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary transition-colors" dir="ltr" />
          </div>

          {/* Remember me */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div onClick={() => setRememberMe(r => !r)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${rememberMe ? "bg-primary border-primary" : "border-border bg-muted/30"}`}>
              {rememberMe && <CheckCircle2 className="w-4 h-4 text-white fill-white" />}
            </div>
            <span className="text-sm font-medium">تذكّرني</span>
          </label>

          <button onClick={handleEmailSignup} disabled={loading} className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? "جاري إنشاء الحساب..." : "إنشاء الحساب"}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            لديك حساب بالفعل؟{" "}
            <button onClick={() => setMode("email-login")} className="text-primary font-bold underline">تسجيل الدخول</button>
          </p>
          <button onClick={skipAuth} className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1">تخطّى — تصفح كضيف</button>
        </div>
      </div>
    );
  }

  /* Landing screen — default */
  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
      {headerImg}

      <div className="flex-1 px-6 py-8 space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black">مرحباً! 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">سجّل دخولك أو أنشئ حساباً للمتابعة</p>
        </div>

        {/* Email option */}
        <button
          onClick={() => setMode("email-login")}
          className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground text-base font-black rounded-2xl shadow-md transition-all flex items-center gap-3 px-5"
        >
          <Mail className="w-5 h-5 shrink-0" />
          <span className="flex-1 text-right">تسجيل الدخول بالبريد الإلكتروني</span>
        </button>

        {/* Phone option */}
        <button
          onClick={handlePhone}
          className="w-full h-14 border-2 border-border hover:border-primary hover:bg-primary/5 active:scale-[0.98] text-foreground text-base font-bold rounded-2xl transition-all flex items-center gap-3 px-5"
        >
          <Phone className="w-5 h-5 shrink-0 text-primary" />
          <span className="flex-1 text-right">تسجيل الدخول برقم الهاتف</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-xs font-medium">أو</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Create account */}
        <button
          onClick={() => setMode("email-signup")}
          className="w-full h-14 bg-rose hover:bg-rose/90 active:scale-[0.98] text-white text-base font-black rounded-2xl shadow-md transition-all flex items-center gap-3 px-5"
        >
          <span className="text-xl">✨</span>
          <span className="flex-1 text-right">إنشاء حساب جديد</span>
        </button>

        {/* Privacy */}
        <p className="text-center text-xs text-muted-foreground pt-1 leading-relaxed">
          بالمتابعة توافق على{" "}
          <span className="underline cursor-pointer text-foreground font-medium">سياسة الخصوصية</span>
          {" "}و{" "}
          <span className="underline cursor-pointer text-foreground font-medium">شروط الاستخدام</span>
        </p>

        {/* Skip */}
        <button
          onClick={skipAuth}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2 font-medium"
        >
          تخطّى — تصفح كضيف بدون تسجيل
        </button>
      </div>
    </div>
  );
}

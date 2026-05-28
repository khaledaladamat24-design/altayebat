import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useClerk, useAuth } from "@clerk/react";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import { Mail, Phone, Eye, EyeOff, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isConfigured, auth } from "@/lib/firebase";
import { apiUrl } from "@/lib/api-url";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";

const REMEMBER_EMAIL_KEY = "al_tayebat_remember_email";
const REMEMBER_PHONE_KEY = "al_tayebat_remember_phone";

type Mode = "landing" | "email-login" | "email-signup" | "phone-input" | "otp-email" | "otp-phone" | "phone-set-password";

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
    confirmationResult?: ConfirmationResult;
  }
}

export default function Auth() {
  const [, setLocation] = useLocation();
  const { openSignIn } = useClerk();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { signIn, isLoaded: signInLoaded, setActive: setActiveSignIn } = useSignIn();
  const { signUp, isLoaded: signUpLoaded, setActive: setActiveSignUp } = useSignUp();

  const [mode, setMode] = useState<Mode>("landing");
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_EMAIL_KEY) || "");
  const [phone, setPhone] = useState(() => localStorage.getItem(REMEMBER_PHONE_KEY) || "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingSignUp, setPendingSignUp] = useState(false);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  const firebaseEnabled = isConfigured();

  // Auto-login: if a Clerk session is already active when opening the auth page,
  // skip straight to the home screen. This is what makes "Remember me" feel automatic
  // — Clerk persists the session across app launches, so returning users never see
  // the login form again unless they explicitly sign out.
  useEffect(() => {
    if (authLoaded && isSignedIn) {
      localStorage.setItem("al_tayebat_onboarded_v2", "1");
      setLocation("/");
    }
  }, [authLoaded, isSignedIn, setLocation]);

  // Persist or clear remembered identifier based on the rememberMe toggle.
  const persistRemembered = (kind: "email" | "phone", value: string) => {
    const key = kind === "email" ? REMEMBER_EMAIL_KEY : REMEMBER_PHONE_KEY;
    if (rememberMe && value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  };

  useEffect(() => {
    return () => {
      try { window.recaptchaVerifier?.clear(); } catch {}
    };
  }, []);

  const skipAuth = () => {
    localStorage.setItem("al_tayebat_auth_skipped_v2", "1");
    localStorage.setItem("al_tayebat_onboarded_v2", "1");
    setLocation("/");
  };

  /* ── Email Login (supports both password and passwordless instances) ── */
  const handleEmailLogin = async () => {
    if (!email) { toast.error("أدخل البريد الإلكتروني"); return; }
    if (!signInLoaded) return;
    setLoading(true);

    type Factor = { strategy: string; emailAddressId?: string };
    type CreateResult = { status: string; createdSessionId?: string | null; supportedFirstFactors?: Factor[] };

    try {
      const result = (await signIn.create({ identifier: email })) as unknown as CreateResult;
      const factors = result.supportedFirstFactors || [];
      const hasPassword = factors.some(f => f.strategy === "password");
      const emailFactor = factors.find(f => f.strategy === "email_code");

      // Path A: password is enabled AND user provided one → try password
      if (hasPassword && password) {
        try {
          const r = (await (signIn as unknown as {
            attemptFirstFactor: (p: { strategy: string; password: string }) => Promise<CreateResult>;
          }).attemptFirstFactor({ strategy: "password", password }));
          if (r.status === "complete" && r.createdSessionId && setActiveSignIn) {
            await setActiveSignIn({ session: r.createdSessionId });
            localStorage.setItem("al_tayebat_email", email);
            localStorage.setItem("al_tayebat_onboarded_v2", "1");
            persistRemembered("email", email);
            toast.success("مرحباً بك في الطيبات!");
            setLocation("/");
            setLoading(false);
            return;
          }
        } catch (e1: unknown) {
          // Password wrong → fall through to email_code if available
          if (!emailFactor) throw e1;
          console.warn("[signin] password failed, falling back to email code:", e1);
        }
      }

      // Path B: send email code as OTP
      if (emailFactor?.emailAddressId) {
        await (signIn as unknown as {
          prepareFirstFactor: (p: { strategy: string; emailAddressId: string }) => Promise<unknown>;
        }).prepareFirstFactor({ strategy: "email_code", emailAddressId: emailFactor.emailAddressId });
        setPendingSignUp(false);
        setMode("otp-email");
        toast("تم إرسال رمز التحقق إلى بريدك الإلكتروني");
      } else {
        toast.error("لا توجد طريقة دخول مفعّلة لهذا الحساب");
      }
    } catch (err: unknown) {
      console.error("[signin] full error:", err);
      const er = (err as { errors?: { code?: string; longMessage?: string; message?: string }[] })?.errors?.[0];
      const friendly = er?.longMessage || er?.message;
      if (er?.code === "form_identifier_not_found") {
        toast.error("لا يوجد حساب بهذا البريد. أنشئ حساباً جديداً.");
        setMode("email-signup");
      } else {
        const codeHint = er?.code ? ` (${er.code})` : "";
        toast.error(friendly ? friendly + codeHint : `خطأ في تسجيل الدخول${codeHint}`);
      }
    }
    setLoading(false);
  };

  /* ── Email Signup ── */
  const handleEmailSignup = async () => {
    if (!firstName.trim()) { toast.error("أدخل الاسم الأول"); return; }
    if (!email) { toast.error("أدخل البريد الإلكتروني"); return; }
    if (password.length < 8) { toast.error("كلمة المرور 8 أحرف على الأقل"); return; }
    if (password !== password2) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    if (!signUpLoaded) {
      toast.error("خدمة التسجيل لم تكتمل التحميل بعد. أعد المحاولة بعد ثانيتين.");
      console.error("[signup] Clerk signUp not loaded yet");
      return;
    }
    setLoading(true);

    type ClerkErr = { code?: string; message?: string; longMessage?: string; meta?: { paramName?: string } };
    const extract = (e: unknown): ClerkErr | null => {
      const arr = (e as { errors?: ClerkErr[] })?.errors;
      return Array.isArray(arr) && arr.length ? arr[0] : null;
    };

    const attemptCreate = async (withNames: boolean) => {
      const payload: Record<string, string> = { emailAddress: email, password };
      if (withNames) {
        payload.firstName = firstName;
        if (lastName) payload.lastName = lastName;
      }
      return signUp.create(payload as Parameters<typeof signUp.create>[0]);
    };

    try {
      try {
        await attemptCreate(true);
      } catch (e1: unknown) {
        const er = extract(e1);
        // Retry without name fields if Clerk instance has them disabled
        if (er?.code === "form_param_unknown" || er?.code === "form_param_not_allowed") {
          console.warn("[signup] Clerk rejected name fields, retrying without:", er);
          await attemptCreate(false);
        } else {
          throw e1;
        }
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingSignUp(true);
      setMode("otp-email");
      toast("تم إرسال رمز التحقق إلى بريدك الإلكتروني");
    } catch (err: unknown) {
      console.error("[signup] full error:", err);
      const er = extract(err);
      const friendly = er?.longMessage || er?.message;
      const codeHint = er?.code ? ` (${er.code})` : "";
      const netHint = (err as Error)?.message?.includes("fetch") ? " — تحقق من الاتصال بالإنترنت" : "";
      // Email already exists → switch to sign-in mode
      if (er?.code === "form_identifier_exists") {
        toast.error("هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.");
        setMode("email-login");
      } else {
        toast.error((friendly ? friendly + codeHint : `حدث خطأ في إنشاء الحساب${codeHint}${netHint}`));
      }
    }
    setLoading(false);
  };

  /* ── OTP Email Verify ── */
  const handleOtpEmailVerify = async () => {
    if (!otp || otp.length < 6) { toast.error("أدخل الرمز المكون من 6 أرقام"); return; }
    setLoading(true);
    try {
      if (pendingSignUp && signUpLoaded) {
        const result = await signUp.attemptEmailAddressVerification({ code: otp }) as unknown as { status: string; createdSessionId?: string | null };
        if (result.status === "complete") {
          if (result.createdSessionId && setActiveSignUp) {
            await setActiveSignUp({ session: result.createdSessionId });
          }
          localStorage.setItem("al_tayebat_email", email);
          if (firstName || lastName) localStorage.setItem("al_tayebat_name", `${firstName} ${lastName}`.trim());
          localStorage.setItem("al_tayebat_onboarded_v2", "1");
          persistRemembered("email", email);
          toast.success("تم إنشاء حسابك بنجاح 🎉");
          setLocation("/register");
        }
      } else if (signInLoaded) {
        const result = await (signIn as unknown as { attemptFirstFactor: (p: { strategy: string; code: string }) => Promise<{ status: string; createdSessionId?: string | null }> }).attemptFirstFactor({ strategy: "email_code", code: otp });
        if (result.status === "complete") {
          if (result.createdSessionId && setActiveSignIn) {
            await setActiveSignIn({ session: result.createdSessionId });
          }
          localStorage.setItem("al_tayebat_email", email);
          localStorage.setItem("al_tayebat_onboarded_v2", "1");
          persistRemembered("email", email);
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

  /* ── Normalize JO phone: user types "07XXXXXXXX" → "+9627XXXXXXXX" ── */
  const toE164JO = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, "");
    if (/^07\d{8}$/.test(digits)) return "+962" + digits.slice(1);
    if (/^7\d{8}$/.test(digits)) return "+962" + digits;
    if (/^9627\d{8}$/.test(digits)) return "+" + digits;
    if (/^009627\d{8}$/.test(digits)) return "+" + digits.slice(2);
    return null;
  };

  /* ── Phone + Password Login (no OTP for returning users) ── */
  const handlePhonePasswordLogin = async () => {
    if (!phone || phone.length < 10) { toast.error("أدخل رقمك بالشكل 07XXXXXXXX"); return; }
    if (!password) { toast.error("أدخل كلمة المرور"); return; }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/phone-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          toast.error(body.error || "لا يوجد حساب — استخدم زر إرسال الرمز لإنشاء حساب جديد");
        } else {
          toast.error(body.error || "فشل تسجيل الدخول");
        }
        setLoading(false);
        return;
      }
      localStorage.setItem("al_tayebat_user_id", String(body.id));
      localStorage.setItem("al_tayebat_phone", phone);
      if (body.name) localStorage.setItem("al_tayebat_name", body.name);
      if (body.firebaseUid) localStorage.setItem("al_tayebat_firebase_uid", body.firebaseUid);
      localStorage.setItem("al_tayebat_onboarded_v2", "1");
      persistRemembered("phone", phone);
      toast.success("مرحباً بك في الطيبات!");
      setLocation("/");
    } catch (err) {
      toast.error((err as Error).message || "فشل تسجيل الدخول");
    }
    setLoading(false);
  };

  /* ── After OTP verify: persist password so future logins skip OTP ── */
  const handlePhoneSetPassword = async () => {
    if (password.length < 6) { toast.error("كلمة المرور 6 أحرف على الأقل"); return; }
    if (password !== password2) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setLoading(true);
    try {
      const firebaseUid = localStorage.getItem("al_tayebat_firebase_uid") || undefined;
      const res = await fetch(apiUrl("/api/auth/set-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, firebaseUid, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "فشل حفظ كلمة المرور");
      localStorage.setItem("al_tayebat_user_id", String(body.id));
      toast.success("تم حفظ كلمة المرور — يمكنك تسجيل الدخول لاحقاً بدون رمز");
      setLocation("/register");
    } catch (err) {
      toast.error((err as Error).message);
    }
    setLoading(false);
  };

  /* ── Firebase Phone Send OTP ── */
  const handleSendPhoneOtp = async () => {
    const e164 = toE164JO(phone);
    if (!e164) { toast.error("أدخل رقمك الأردني بالشكل 07XXXXXXXX (10 أرقام)"); return; }

    if (!firebaseEnabled) {
      toast.error("خدمة OTP الهاتفية غير مُفعّلة بعد. أضف مفاتيح Firebase في إعدادات المشروع.");
      return;
    }

    setLoading(true);
    try {
      if (!window.recaptchaVerifier && recaptchaRef.current) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaRef.current, {
          size: "invisible",
        });
      }
      const confirmation = await signInWithPhoneNumber(auth, e164, window.recaptchaVerifier!);
      window.confirmationResult = confirmation;
      setMode("otp-phone");
      toast("تم إرسال رمز التحقق إلى هاتفك");
    } catch (err: unknown) {
      const msg = (err as Error).message;
      toast.error(msg?.includes("invalid-phone") ? "رقم الهاتف غير صحيح" : "فشل إرسال الرمز. تأكد من رقم الهاتف.");
    }
    setLoading(false);
  };

  /* ── Firebase Phone Verify OTP ── */
  const handleOtpPhoneVerify = async () => {
    if (!otp || otp.length < 6) { toast.error("أدخل الرمز المكون من 6 أرقام"); return; }
    if (!window.confirmationResult) { toast.error("انتهت صلاحية الجلسة. أعد المحاولة."); return; }
    setLoading(true);
    try {
      const result = await window.confirmationResult.confirm(otp);
      if (result.user) {
        localStorage.setItem("al_tayebat_firebase_uid", result.user.uid);
        localStorage.setItem("al_tayebat_phone", phone);
        localStorage.setItem("al_tayebat_onboarded_v2", "1");
        persistRemembered("phone", phone);
        const res = await fetch(apiUrl("/api/users/profile"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firebaseUid: result.user.uid, phone, role: "consumer" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "فشل حفظ الملف الشخصي");
        }
        const profile = await res.json();
        localStorage.setItem("al_tayebat_user_id", String(profile.id));
        toast.success("تم التحقق! اختر كلمة المرور للدخول لاحقاً بدون رمز");
        setPassword(""); setPassword2("");
        setMode("phone-set-password");
      }
    } catch (err) {
      toast.error((err as Error).message || "الرمز غير صحيح أو منتهي الصلاحية");
    }
    setLoading(false);
  };

  const headerImg = (
    <div className="relative h-44 shrink-0 overflow-hidden rounded-b-3xl">
      <img src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80" alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-primary/60 to-primary/80" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="text-white text-3xl font-black drop-shadow">الطيبات</span>
        <span className="text-white/80 text-sm">طعام صحي يوصل لبابك</span>
      </div>
    </div>
  );

  const RememberMeBox = () => (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div onClick={() => setRememberMe(r => !r)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${rememberMe ? "bg-primary border-primary" : "border-border bg-muted/30"}`}>
        {rememberMe && <CheckCircle2 className="w-4 h-4 text-white fill-white" />}
      </div>
      <span className="text-sm font-medium">تذكّرني</span>
    </label>
  );

  /* ── OTP phone screen ── */
  if (mode === "otp-phone") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-8 space-y-6">
          <button onClick={() => { setMode("phone-input"); setOtp(""); }} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ArrowLeft className="w-4 h-4 rotate-180" /> رجوع
          </button>
          <div>
            <h2 className="text-2xl font-black">أدخل رمز التحقق</h2>
            <p className="text-muted-foreground text-sm mt-1">تم إرسال رمز 6 أرقام إلى <span className="text-foreground font-bold" dir="ltr">{phone}</span></p>
          </div>
          <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            placeholder="_ _ _ _ _ _" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
            className="w-full h-14 rounded-2xl border-2 border-primary/30 focus:border-primary bg-muted/30 text-center text-3xl font-black tracking-[0.5em] outline-none transition-colors" dir="ltr" />
          <button onClick={handleOtpPhoneVerify} disabled={loading || otp.length < 6}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {loading ? "جاري التحقق..." : "تأكيد"}
          </button>
          <button onClick={skipAuth} className="w-full text-center text-sm text-muted-foreground py-2">تخطّى — تصفح كضيف</button>
        </div>
      </div>
    );
  }

  /* ── OTP email screen ── */
  if (mode === "otp-email") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-8 space-y-6">
          <button onClick={() => { setMode(pendingSignUp ? "email-signup" : "email-login"); setOtp(""); }} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ArrowLeft className="w-4 h-4 rotate-180" /> رجوع
          </button>
          <div>
            <h2 className="text-2xl font-black">أدخل رمز التحقق</h2>
            <p className="text-muted-foreground text-sm mt-1">تم الإرسال إلى <span className="text-foreground font-bold">{email}</span></p>
          </div>
          <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            placeholder="_ _ _ _ _ _" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
            className="w-full h-14 rounded-2xl border-2 border-primary/30 focus:border-primary bg-muted/30 text-center text-3xl font-black tracking-[0.5em] outline-none transition-colors" dir="ltr" />
          <button onClick={handleOtpEmailVerify} disabled={loading || otp.length < 6}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {loading ? "جاري التحقق..." : "تأكيد"}
          </button>
          <button onClick={skipAuth} className="w-full text-center text-sm text-muted-foreground py-2">تخطّى — تصفح كضيف</button>
        </div>
      </div>
    );
  }

  /* ── Phone input screen ── */
  if (mode === "phone-input") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-5">
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ArrowLeft className="w-4 h-4 rotate-180" /> رجوع
          </button>
          <div>
            <h2 className="text-2xl font-black">رقم الهاتف</h2>
            <p className="text-muted-foreground text-sm mt-1">أدخل رقمك الأردني (يبدأ بـ 07) — 10 أرقام</p>
          </div>
          <div className="relative">
            <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input type="tel" inputMode="numeric" placeholder="07XXXXXXXX" value={phone} maxLength={10}
              onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="w-full h-14 rounded-2xl border border-border bg-muted/30 pr-12 pl-4 text-lg outline-none focus:border-primary transition-colors tracking-wider" dir="ltr" />
          </div>

          {!firebaseEnabled && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                ⚠️ خدمة OTP الهاتفية تحتاج مفاتيح Firebase. أضف المتغيرات في ملف <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">.env</code> من ملف <code className="font-mono">.env.example</code>
              </p>
            </div>
          )}

          <div className="relative">
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute left-4 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-muted-foreground" />}
            </button>
            <input type={showPassword ? "text" : "password"} placeholder="كلمة المرور (لمن لديه حساب)"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && password && handlePhonePasswordLogin()}
              className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-4 pl-12 py-3.5 text-sm outline-none focus:border-primary transition-colors" dir="ltr" />
          </div>

          <RememberMeBox />

          <button onClick={handlePhonePasswordLogin} disabled={loading || !password}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-40 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            تسجيل الدخول بكلمة المرور
          </button>

          <div className="flex items-center gap-3"><div className="flex-1 h-px bg-border" /><span className="text-muted-foreground text-xs">أو حساب جديد</span><div className="flex-1 h-px bg-border" /></div>

          <button onClick={handleSendPhoneOtp} disabled={loading}
            className="w-full h-13 border-2 border-primary text-primary font-black rounded-2xl hover:bg-primary/5 transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />}
            إنشاء حساب جديد — إرسال الرمز
          </button>

          <button onClick={skipAuth} className="w-full text-center text-sm text-muted-foreground py-2">تخطّى — تصفح كضيف</button>
          <div ref={recaptchaRef} />
        </div>
      </div>
    );
  }

  /* ── Set Password after phone OTP signup ── */
  if (mode === "phone-set-password") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-8 space-y-5">
          <div>
            <h2 className="text-2xl font-black">اختر كلمة المرور</h2>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
              سنحفظ هذه الكلمة لرقمك <span className="font-bold text-foreground" dir="ltr">{phone}</span> — في المرات القادمة تدخل بالرقم وكلمة المرور فقط بدون رمز.
            </p>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute left-4 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
            <input type={showPassword ? "text" : "password"} placeholder="كلمة المرور (6 أحرف على الأقل)"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary" dir="ltr" />
          </div>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} placeholder="تأكيد كلمة المرور"
              value={password2} onChange={e => setPassword2(e.target.value)}
              className={`w-full h-13 rounded-2xl border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary ${password2 && password2 !== password ? "border-red-400" : "border-border"}`} dir="ltr" />
            {password2 && password2 !== password && (<p className="text-xs text-red-500 mt-1 pr-1">كلمتا المرور غير متطابقتين</p>)}
          </div>
          <button onClick={handlePhoneSetPassword} disabled={loading || password.length < 6 || password !== password2}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            حفظ والمتابعة
          </button>
          <button onClick={() => { localStorage.setItem("al_tayebat_onboarded_v2", "1"); setLocation("/register"); }}
            className="w-full text-center text-sm text-muted-foreground py-2">تخطّى الآن (يمكنك إضافتها لاحقاً)</button>
        </div>
      </div>
    );
  }

  /* ── Email Login screen ── */
  if (mode === "email-login") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-4">
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ArrowLeft className="w-4 h-4 rotate-180" /> رجوع
          </button>
          <h2 className="text-2xl font-black">تسجيل الدخول</h2>
          <div className="relative">
            <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-12 pl-4 py-3.5 text-sm outline-none focus:border-primary transition-colors" dir="ltr" />
          </div>
          <div className="relative">
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute left-4 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-muted-foreground" />}
            </button>
            <input type={showPassword ? "text" : "password"} placeholder="كلمة المرور"
              value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleEmailLogin()}
              className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-4 pl-12 py-3.5 text-sm outline-none focus:border-primary transition-colors" dir="ltr" />
          </div>
          <RememberMeBox />
          <button onClick={handleEmailLogin} disabled={loading || !signInLoaded}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2">
            {(loading || !signInLoaded) ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {!signInLoaded ? "جاري تحميل خدمة الدخول..." : (loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول")}
          </button>
          <div className="flex items-center gap-3"><div className="flex-1 h-px bg-border" /><span className="text-muted-foreground text-xs">أو</span><div className="flex-1 h-px bg-border" /></div>
          <button onClick={() => setMode("email-signup")}
            className="w-full h-12 border-2 border-primary text-primary font-black rounded-2xl hover:bg-primary/5 transition-all text-sm">
            إنشاء حساب جديد
          </button>
          <button onClick={skipAuth} className="w-full text-center text-sm text-muted-foreground py-1">تخطّى — تصفح كضيف</button>
        </div>
      </div>
    );
  }

  /* ── Email Signup screen ── */
  if (mode === "email-signup") {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-4">
          <button onClick={() => setMode("landing")} className="flex items-center gap-1 text-muted-foreground text-sm">
            <ArrowLeft className="w-4 h-4 rotate-180" /> رجوع
          </button>
          <h2 className="text-2xl font-black">إنشاء حساب جديد</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">الاسم الأول *</label>
              <input type="text" placeholder="أحمد" value={firstName} onChange={e => setFirstName(e.target.value)}
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">اسم العائلة</label>
              <input type="text" placeholder="محمد" value={lastName} onChange={e => setLastName(e.target.value)}
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div className="relative">
            <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full h-12 rounded-xl border border-border bg-muted/30 pr-11 pl-4 text-sm outline-none focus:border-primary" dir="ltr" />
          </div>
          <div className="relative">
            <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute left-4 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
            <input type={showPassword ? "text" : "password"} placeholder="كلمة المرور (8 أحرف على الأقل)"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full h-12 rounded-xl border border-border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary" dir="ltr" />
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="تأكيد كلمة المرور"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              className={`w-full h-12 rounded-xl border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary ${
                password2 && password2 !== password ? "border-red-400" : "border-border"
              }`}
              dir="ltr"
            />
            {password2 && password2 !== password && (
              <p className="text-xs text-red-500 mt-1 pr-1">كلمتا المرور غير متطابقتين</p>
            )}
          </div>
          <RememberMeBox />
          <button onClick={handleEmailSignup} disabled={loading || !signUpLoaded}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2">
            {(loading || !signUpLoaded) ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {!signUpLoaded ? "جاري تحميل خدمة التسجيل..." : (loading ? "جاري إنشاء الحساب..." : "إنشاء الحساب")}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            لديك حساب؟{" "}
            <button onClick={() => setMode("email-login")} className="text-primary font-bold underline">تسجيل الدخول</button>
          </p>
          <button onClick={skipAuth} className="w-full text-center text-sm text-muted-foreground py-1">تخطّى — تصفح كضيف</button>
        </div>
      </div>
    );
  }

  /* ── Landing screen ── */
  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto" dir="rtl">
      {headerImg}
      <div className="flex-1 px-6 py-8 space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black">مرحباً! 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">سجّل دخولك أو أنشئ حساباً للمتابعة</p>
        </div>

        <button onClick={() => setMode("email-login")}
          className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground text-base font-black rounded-2xl shadow-md transition-all flex items-center gap-3 px-5">
          <Mail className="w-5 h-5 shrink-0" />
          <span className="flex-1 text-right">تسجيل الدخول بالبريد الإلكتروني</span>
        </button>

        <button onClick={() => setMode("phone-input")}
          className="w-full h-14 border-2 border-border hover:border-primary hover:bg-primary/5 active:scale-[0.98] text-foreground text-base font-bold rounded-2xl transition-all flex items-center gap-3 px-5">
          <Phone className="w-5 h-5 shrink-0 text-primary" />
          <span className="flex-1 text-right">تسجيل الدخول برقم الهاتف (OTP)</span>
          {firebaseEnabled && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">مُفعّل</span>}
        </button>

        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-xs font-medium">أو</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button onClick={() => setMode("email-signup")}
          className="w-full h-14 bg-rose hover:bg-rose/90 active:scale-[0.98] text-white text-base font-black rounded-2xl shadow-md transition-all flex items-center gap-3 px-5">
          <span className="text-xl">✨</span>
          <span className="flex-1 text-right">إنشاء حساب جديد</span>
        </button>

        <p className="text-center text-xs text-muted-foreground pt-1 leading-relaxed">
          بالمتابعة توافق على{" "}
          <span className="underline cursor-pointer text-foreground font-medium" onClick={() => setLocation("/privacy-policy")}>سياسة الخصوصية</span>
          {" "}و{" "}
          <span className="underline cursor-pointer text-foreground font-medium">شروط الاستخدام</span>
        </p>

        <button onClick={skipAuth}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2 font-medium">
          تخطّى — تصفح كضيف بدون تسجيل
        </button>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useClerk, useAuth } from "@clerk/react";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import {
  Mail,
  Phone,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { isConfigured, auth } from "@/lib/firebase";
import { apiUrl } from "@/lib/api-url";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { useLanguage } from "@/contexts/language";

const REMEMBER_EMAIL_KEY = "al_tayebat_remember_email";
const REMEMBER_PHONE_KEY = "al_tayebat_remember_phone";

type Mode =
  | "landing"
  | "email-login"
  | "email-signup"
  | "phone-input"
  | "otp-email"
  | "otp-phone"
  | "phone-set-password";

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
  const {
    signIn,
    isLoaded: signInLoaded,
    setActive: setActiveSignIn,
  } = useSignIn();
  const {
    signUp,
    isLoaded: signUpLoaded,
    setActive: setActiveSignUp,
  } = useSignUp();
  const { dir, tr } = useLanguage();

  const [mode, setMode] = useState<Mode>("landing");
  const [email, setEmail] = useState(
    () => localStorage.getItem(REMEMBER_EMAIL_KEY) || "",
  );
  const [phone, setPhone] = useState(
    () => localStorage.getItem(REMEMBER_PHONE_KEY) || "",
  );
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
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (authLoaded && isSignedIn && !redirectedRef.current) {
      redirectedRef.current = true;
      localStorage.setItem("al_tayebat_onboarded_v2", "1");
      setLocation("/");
    }
    // setLocation omitted: wouter v3 may return a new reference per render,
    // which would loop the effect (React #185) on Android WebView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, isSignedIn]);

  // Persist or clear remembered identifier based on the rememberMe toggle.
  const persistRemembered = (kind: "email" | "phone", value: string) => {
    const key = kind === "email" ? REMEMBER_EMAIL_KEY : REMEMBER_PHONE_KEY;
    if (rememberMe && value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  };

  useEffect(() => {
    return () => {
      try {
        window.recaptchaVerifier?.clear();
      } catch {}
    };
  }, []);

  const skipAuth = () => {
    localStorage.setItem("al_tayebat_auth_skipped_v2", "1");
    localStorage.setItem("al_tayebat_onboarded_v2", "1");
    setLocation("/");
  };

  /* ── Email Login: password ONLY. OTP is a separate "forgot password" flow. ──
   * Re-login should NEVER trigger an OTP email — that was the user's explicit
   * requirement. If the password is wrong, we surface a clear error instead of
   * silently falling back to email_code.
   */
  const handleEmailLogin = async () => {
    if (!email) {
      toast.error(tr("أدخل البريد الإلكتروني", "Enter your email"));
      return;
    }
    if (!password) {
      toast.error(tr("أدخل كلمة المرور", "Enter your password"));
      return;
    }
    if (!signInLoaded) return;
    setLoading(true);

    type CreateResult = { status: string; createdSessionId?: string | null };

    try {
      await signIn.create({ identifier: email });
      const r = await (
        signIn as unknown as {
          attemptFirstFactor: (p: {
            strategy: string;
            password: string;
          }) => Promise<CreateResult>;
        }
      ).attemptFirstFactor({ strategy: "password", password });

      if (r.status === "complete" && r.createdSessionId && setActiveSignIn) {
        await setActiveSignIn({ session: r.createdSessionId });
        localStorage.setItem("al_tayebat_email", email);
        localStorage.setItem("al_tayebat_onboarded_v2", "1");
        persistRemembered("email", email);
        toast.success(tr("مرحباً بك في الطيبات!", "Welcome to Al-Tayebat!"));
        setLocation("/");
      } else {
        toast.error(
          tr("تعذّر إكمال تسجيل الدخول", "Couldn't complete sign-in"),
        );
      }
    } catch (err: unknown) {
      console.error("[signin] full error:", err);
      const er = (
        err as {
          errors?: { code?: string; longMessage?: string; message?: string }[];
        }
      )?.errors?.[0];
      const friendly = er?.longMessage || er?.message;
      if (er?.code === "form_identifier_not_found") {
        toast.error(
          tr(
            "لا يوجد حساب بهذا البريد. أنشئ حساباً جديداً.",
            "No account with this email. Create a new account.",
          ),
        );
        setMode("email-signup");
      } else if (
        er?.code === "form_password_incorrect" ||
        er?.code === "form_password_pwned"
      ) {
        toast.error(
          tr(
            "كلمة المرور غير صحيحة. إذا نسيتها، اضغط (نسيت كلمة المرور؟)",
            "Incorrect password. If you forgot it, tap (Forgot password?)",
          ),
        );
      } else if (er?.code === "strategy_for_user_invalid") {
        toast.error(
          tr(
            "هذا الحساب لا يحتوي على كلمة مرور. اضغط (نسيت كلمة المرور؟) لإرسال رمز",
            "This account has no password set. Tap (Forgot password?) to receive a code",
          ),
        );
      } else {
        const codeHint = er?.code ? ` (${er.code})` : "";
        toast.error(
          friendly
            ? friendly + codeHint
            : tr(`خطأ في تسجيل الدخول${codeHint}`, `Sign-in error${codeHint}`),
        );
      }
    }
    setLoading(false);
  };

  /* ── Forgot Password: explicit OTP-based recovery (user choice, not silent fallback) ── */
  const handleEmailForgotPassword = async () => {
    if (!email) {
      toast.error(tr("أدخل البريد الإلكتروني أولاً", "Enter your email first"));
      return;
    }
    if (!signInLoaded) return;
    setLoading(true);
    try {
      type Factor = { strategy: string; emailAddressId?: string };
      type CreateResult = { supportedFirstFactors?: Factor[] };
      const result = (await signIn.create({
        identifier: email,
      })) as unknown as CreateResult;
      const emailFactor = (result.supportedFirstFactors || []).find(
        (f) => f.strategy === "email_code",
      );
      if (!emailFactor?.emailAddressId) {
        toast.error(
          tr(
            "لا يمكن إرسال رمز لهذا الحساب",
            "Cannot send a code for this account",
          ),
        );
        setLoading(false);
        return;
      }
      await (
        signIn as unknown as {
          prepareFirstFactor: (p: {
            strategy: string;
            emailAddressId: string;
          }) => Promise<unknown>;
        }
      ).prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: emailFactor.emailAddressId,
      });
      setPendingSignUp(false);
      setMode("otp-email");
      toast.success(
        tr(
          "تم إرسال رمز التحقق إلى بريدك",
          "A verification code has been sent to your email",
        ),
      );
    } catch (err: unknown) {
      const er = (err as { errors?: { code?: string; message?: string }[] })
        ?.errors?.[0];
      if (er?.code === "form_identifier_not_found") {
        toast.error(
          tr("لا يوجد حساب بهذا البريد", "No account with this email"),
        );
      } else {
        toast.error(
          er?.message || tr("تعذّر إرسال الرمز", "Couldn't send the code"),
        );
      }
    }
    setLoading(false);
  };

  /* ── Email Signup ── */
  const handleEmailSignup = async () => {
    if (!firstName.trim()) {
      toast.error(tr("أدخل الاسم الأول", "Enter your first name"));
      return;
    }
    if (!email) {
      toast.error(tr("أدخل البريد الإلكتروني", "Enter your email"));
      return;
    }
    if (password.length < 8) {
      toast.error(
        tr(
          "كلمة المرور 8 أحرف على الأقل",
          "Password must be at least 8 characters",
        ),
      );
      return;
    }
    if (password !== password2) {
      toast.error(tr("كلمتا المرور غير متطابقتين", "Passwords don't match"));
      return;
    }
    if (!signUpLoaded) {
      toast.error(
        tr(
          "خدمة التسجيل لم تكتمل التحميل بعد. أعد المحاولة بعد ثانيتين.",
          "Signup service hasn't finished loading. Try again in a couple seconds.",
        ),
      );
      console.error("[signup] Clerk signUp not loaded yet");
      return;
    }
    setLoading(true);

    type ClerkErr = {
      code?: string;
      message?: string;
      longMessage?: string;
      meta?: { paramName?: string };
    };
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
        if (
          er?.code === "form_param_unknown" ||
          er?.code === "form_param_not_allowed"
        ) {
          console.warn(
            "[signup] Clerk rejected name fields, retrying without:",
            er,
          );
          await attemptCreate(false);
        } else {
          throw e1;
        }
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingSignUp(true);
      setMode("otp-email");
      toast(
        tr(
          "تم إرسال رمز التحقق إلى بريدك الإلكتروني",
          "A verification code has been sent to your email",
        ),
      );
    } catch (err: unknown) {
      console.error("[signup] full error:", err);
      const er = extract(err);
      const friendly = er?.longMessage || er?.message;
      const codeHint = er?.code ? ` (${er.code})` : "";
      const netHint = (err as Error)?.message?.includes("fetch")
        ? tr(
            " — تحقق من الاتصال بالإنترنت",
            " — check your internet connection",
          )
        : "";
      // Email already exists → switch to sign-in mode
      if (er?.code === "form_identifier_exists") {
        toast.error(
          tr(
            "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.",
            "This email is already registered. Sign in instead.",
          ),
        );
        setMode("email-login");
      } else {
        toast.error(
          friendly
            ? friendly + codeHint
            : tr(
                `حدث خطأ في إنشاء الحساب${codeHint}${netHint}`,
                `Something went wrong creating the account${codeHint}${netHint}`,
              ),
        );
      }
    }
    setLoading(false);
  };

  /* ── OTP Email Verify ── */
  const handleOtpEmailVerify = async () => {
    if (!otp || otp.length < 6) {
      toast.error(tr("أدخل الرمز المكون من 6 أرقام", "Enter the 6-digit code"));
      return;
    }
    setLoading(true);
    try {
      if (pendingSignUp && signUpLoaded) {
        const result = (await signUp.attemptEmailAddressVerification({
          code: otp,
        })) as unknown as { status: string; createdSessionId?: string | null };
        if (result.status === "complete") {
          if (result.createdSessionId && setActiveSignUp) {
            await setActiveSignUp({ session: result.createdSessionId });
          }
          localStorage.setItem("al_tayebat_email", email);
          if (firstName || lastName)
            localStorage.setItem(
              "al_tayebat_name",
              `${firstName} ${lastName}`.trim(),
            );
          localStorage.setItem("al_tayebat_onboarded_v2", "1");
          persistRemembered("email", email);
          toast.success(
            tr("تم إنشاء حسابك بنجاح 🎉", "Your account has been created 🎉"),
          );
          setLocation("/register");
        }
      } else if (signInLoaded) {
        const result = await (
          signIn as unknown as {
            attemptFirstFactor: (p: {
              strategy: string;
              code: string;
            }) => Promise<{ status: string; createdSessionId?: string | null }>;
          }
        ).attemptFirstFactor({ strategy: "email_code", code: otp });
        if (result.status === "complete") {
          if (result.createdSessionId && setActiveSignIn) {
            await setActiveSignIn({ session: result.createdSessionId });
          }
          localStorage.setItem("al_tayebat_email", email);
          localStorage.setItem("al_tayebat_onboarded_v2", "1");
          persistRemembered("email", email);
          toast.success(tr("مرحباً بك في الطيبات!", "Welcome to Al-Tayebat!"));
          setLocation("/");
        }
      }
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]
        ?.message;
      toast.error(msg || tr("الرمز غير صحيح", "Incorrect code"));
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
    if (!phone || phone.length < 10) {
      toast.error(
        tr("أدخل رقمك بالشكل 07XXXXXXXX", "Enter your number as 07XXXXXXXX"),
      );
      return;
    }
    if (!password) {
      toast.error(tr("أدخل كلمة المرور", "Enter your password"));
      return;
    }
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
          toast.error(
            body.error ||
              tr(
                "لا يوجد حساب — استخدم زر إرسال الرمز لإنشاء حساب جديد",
                "No account — use the send-code button to create a new one",
              ),
          );
        } else {
          toast.error(body.error || tr("فشل تسجيل الدخول", "Sign-in failed"));
        }
        setLoading(false);
        return;
      }
      localStorage.setItem("al_tayebat_user_id", String(body.id));
      localStorage.setItem("al_tayebat_phone", phone);
      if (body.name) localStorage.setItem("al_tayebat_name", body.name);
      if (body.firebaseUid)
        localStorage.setItem("al_tayebat_firebase_uid", body.firebaseUid);
      localStorage.setItem("al_tayebat_onboarded_v2", "1");
      persistRemembered("phone", phone);
      toast.success(tr("مرحباً بك في الطيبات!", "Welcome to Al-Tayebat!"));
      setLocation("/");
    } catch (err) {
      toast.error(
        (err as Error).message || tr("فشل تسجيل الدخول", "Sign-in failed"),
      );
    }
    setLoading(false);
  };

  /* ── After OTP verify: persist password so future logins skip OTP ── */
  const handlePhoneSetPassword = async () => {
    if (password.length < 6) {
      toast.error(
        tr(
          "كلمة المرور 6 أحرف على الأقل",
          "Password must be at least 6 characters",
        ),
      );
      return;
    }
    if (password !== password2) {
      toast.error(tr("كلمتا المرور غير متطابقتين", "Passwords don't match"));
      return;
    }
    setLoading(true);
    try {
      const firebaseUid =
        localStorage.getItem("al_tayebat_firebase_uid") || undefined;
      const res = await fetch(apiUrl("/api/auth/set-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, firebaseUid, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          body.error || tr("فشل حفظ كلمة المرور", "Failed to save password"),
        );
      localStorage.setItem("al_tayebat_user_id", String(body.id));
      localStorage.setItem("al_tayebat_onboarded_v2", "1");
      toast.success(
        tr(
          "تم حفظ كلمة المرور — يمكنك تسجيل الدخول لاحقاً بدون رمز",
          "Password saved — you can sign in later without a code",
        ),
      );
      setLocation("/");
    } catch (err) {
      toast.error((err as Error).message);
    }
    setLoading(false);
  };

  /* ── Firebase Phone Send OTP ── */
  const handleSendPhoneOtp = async () => {
    const e164 = toE164JO(phone);
    if (!e164) {
      toast.error(
        tr(
          "أدخل رقمك الأردني بالشكل 07XXXXXXXX (10 أرقام)",
          "Enter your Jordanian number as 07XXXXXXXX (10 digits)",
        ),
      );
      return;
    }

    if (!firebaseEnabled) {
      toast.error(
        tr(
          "خدمة OTP الهاتفية غير مُفعّلة بعد. أضف مفاتيح Firebase في إعدادات المشروع.",
          "Phone OTP service isn't enabled yet. Add the Firebase keys in project settings.",
        ),
      );
      return;
    }

    setLoading(true);
    try {
      if (!window.recaptchaVerifier && recaptchaRef.current) {
        window.recaptchaVerifier = new RecaptchaVerifier(
          auth,
          recaptchaRef.current,
          {
            size: "invisible",
          },
        );
      }
      const confirmation = await signInWithPhoneNumber(
        auth,
        e164,
        window.recaptchaVerifier!,
      );
      window.confirmationResult = confirmation;
      setMode("otp-phone");
      toast(
        tr(
          "تم إرسال رمز التحقق إلى هاتفك",
          "A verification code has been sent to your phone",
        ),
      );
    } catch (err: unknown) {
      const msg = (err as Error).message;
      toast.error(
        msg?.includes("invalid-phone")
          ? tr("رقم الهاتف غير صحيح", "Invalid phone number")
          : tr(
              "فشل إرسال الرمز. تأكد من رقم الهاتف.",
              "Failed to send the code. Check the phone number.",
            ),
      );
    }
    setLoading(false);
  };

  /* ── Firebase Phone Verify OTP ── */
  const handleOtpPhoneVerify = async () => {
    if (!otp || otp.length < 6) {
      toast.error(tr("أدخل الرمز المكون من 6 أرقام", "Enter the 6-digit code"));
      return;
    }
    if (!window.confirmationResult) {
      toast.error(
        tr(
          "انتهت صلاحية الجلسة. أعد المحاولة.",
          "Session expired. Please try again.",
        ),
      );
      return;
    }
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
          body: JSON.stringify({
            firebaseUid: result.user.uid,
            phone,
            role: "consumer",
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error || tr("فشل حفظ الملف الشخصي", "Failed to save profile"),
          );
        }
        const profile = await res.json();
        localStorage.setItem("al_tayebat_user_id", String(profile.id));
        toast.success(
          tr(
            "تم التحقق! اختر كلمة المرور للدخول لاحقاً بدون رمز",
            "Verified! Choose a password so you can sign in later without a code",
          ),
        );
        setPassword("");
        setPassword2("");
        setMode("phone-set-password");
      }
    } catch (err) {
      toast.error(
        (err as Error).message ||
          tr("الرمز غير صحيح أو منتهي الصلاحية", "Code is invalid or expired"),
      );
    }
    setLoading(false);
  };

  const headerImg = (
    <div className="relative h-44 shrink-0 overflow-hidden rounded-b-3xl">
      <img
        src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80"
        alt=""
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-primary/60 to-primary/80" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="text-white text-3xl font-black drop-shadow">
          {tr("الطيبات", "Al-Tayebat")}
        </span>
        <span className="text-white/80 text-sm">
          {tr("طعام صحي يوصل لبابك", "Healthy food delivered to your door")}
        </span>
      </div>
    </div>
  );

  const RememberMeBox = () => (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => setRememberMe((r) => !r)}
        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${rememberMe ? "bg-primary border-primary" : "border-border bg-muted/30"}`}
      >
        {rememberMe && (
          <CheckCircle2 className="w-4 h-4 text-white fill-white" />
        )}
      </div>
      <span className="text-sm font-medium">
        {tr("تذكّرني", "Remember me")}
      </span>
    </label>
  );

  /* ── OTP phone screen ── */
  if (mode === "otp-phone") {
    return (
      <div
        className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
        dir={dir}
      >
        {headerImg}
        <div className="flex-1 px-6 py-8 space-y-6">
          <button
            onClick={() => {
              setMode("phone-input");
              setOtp("");
            }}
            className="flex items-center gap-1 text-muted-foreground text-sm"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" /> {tr("رجوع", "Back")}
          </button>
          <div>
            <h2 className="text-2xl font-black">
              {tr("أدخل رمز التحقق", "Enter verification code")}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {tr("تم إرسال رمز 6 أرقام إلى ", "A 6-digit code was sent to ")}
              <span className="text-foreground font-bold" dir="ltr">
                {phone}
              </span>
            </p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="_ _ _ _ _ _"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="w-full h-14 rounded-2xl border-2 border-primary/30 focus:border-primary bg-muted/30 text-center text-3xl font-black tracking-[0.5em] outline-none transition-colors"
            dir="ltr"
          />
          <button
            onClick={handleOtpPhoneVerify}
            disabled={loading || otp.length < 6}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {loading
              ? tr("جاري التحقق...", "Verifying...")
              : tr("تأكيد", "Confirm")}
          </button>
          <button
            onClick={skipAuth}
            className="w-full text-center text-sm text-muted-foreground py-2"
          >
            {tr("تخطّى — تصفح كضيف", "Skip — browse as guest")}
          </button>
        </div>
      </div>
    );
  }

  /* ── OTP email screen ── */
  if (mode === "otp-email") {
    return (
      <div
        className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
        dir={dir}
      >
        {headerImg}
        <div className="flex-1 px-6 py-8 space-y-6">
          <button
            onClick={() => {
              setMode(pendingSignUp ? "email-signup" : "email-login");
              setOtp("");
            }}
            className="flex items-center gap-1 text-muted-foreground text-sm"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" /> {tr("رجوع", "Back")}
          </button>
          <div>
            <h2 className="text-2xl font-black">
              {tr("أدخل رمز التحقق", "Enter verification code")}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {tr("تم الإرسال إلى ", "Sent to ")}
              <span className="text-foreground font-bold">{email}</span>
            </p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="_ _ _ _ _ _"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="w-full h-14 rounded-2xl border-2 border-primary/30 focus:border-primary bg-muted/30 text-center text-3xl font-black tracking-[0.5em] outline-none transition-colors"
            dir="ltr"
          />
          <button
            onClick={handleOtpEmailVerify}
            disabled={loading || otp.length < 6}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {loading
              ? tr("جاري التحقق...", "Verifying...")
              : tr("تأكيد", "Confirm")}
          </button>
          <button
            onClick={skipAuth}
            className="w-full text-center text-sm text-muted-foreground py-2"
          >
            {tr("تخطّى — تصفح كضيف", "Skip — browse as guest")}
          </button>
        </div>
      </div>
    );
  }

  /* ── Phone input screen ── */
  if (mode === "phone-input") {
    return (
      <div
        className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
        dir={dir}
      >
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-5">
          <button
            onClick={() => setMode("landing")}
            className="flex items-center gap-1 text-muted-foreground text-sm"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" /> {tr("رجوع", "Back")}
          </button>
          <div>
            <h2 className="text-2xl font-black">
              {tr("رقم الهاتف", "Phone number")}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {tr(
                "أدخل رقمك الأردني (يبدأ بـ 07) — 10 أرقام",
                "Enter your Jordanian number (starts with 07) — 10 digits",
              )}
            </p>
          </div>
          <div className="relative">
            <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="tel"
              inputMode="numeric"
              placeholder="07XXXXXXXX"
              value={phone}
              maxLength={10}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className="w-full h-14 rounded-2xl border border-border bg-muted/30 pr-12 pl-4 text-lg outline-none focus:border-primary transition-colors tracking-wider"
              dir="ltr"
            />
          </div>

          {!firebaseEnabled && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                {tr(
                  "⚠️ خدمة OTP الهاتفية تحتاج مفاتيح Firebase. أضف المتغيرات في ملف ",
                  "⚠️ Phone OTP needs Firebase keys. Add the variables to ",
                )}
                <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">
                  .env
                </code>
                {tr(" من ملف ", " from ")}
                <code className="font-mono">.env.example</code>
              </p>
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute left-4 top-1/2 -translate-y-1/2"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Eye className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={tr(
                "كلمة المرور (لمن لديه حساب)",
                "Password (if you have an account)",
              )}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && password && handlePhonePasswordLogin()
              }
              className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-4 pl-12 py-3.5 text-sm outline-none focus:border-primary transition-colors"
              dir="ltr"
            />
          </div>

          <RememberMeBox />

          <button
            onClick={handlePhonePasswordLogin}
            disabled={loading || !password}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-40 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {tr("تسجيل الدخول بكلمة المرور", "Sign in with password")}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted-foreground text-xs">
              {tr("أو حساب جديد", "Or new account")}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={handleSendPhoneOtp}
            disabled={loading}
            className="w-full h-13 border-2 border-primary text-primary font-black rounded-2xl hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Phone className="w-5 h-5" />
            )}
            {tr(
              "إنشاء حساب جديد — إرسال الرمز",
              "Create a new account — send code",
            )}
          </button>

          <button
            onClick={skipAuth}
            className="w-full text-center text-sm text-muted-foreground py-2"
          >
            {tr("تخطّى — تصفح كضيف", "Skip — browse as guest")}
          </button>
          <div ref={recaptchaRef} />
        </div>
      </div>
    );
  }

  /* ── Set Password after phone OTP signup ── */
  if (mode === "phone-set-password") {
    return (
      <div
        className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
        dir={dir}
      >
        {headerImg}
        <div className="flex-1 px-6 py-8 space-y-5">
          <div>
            <h2 className="text-2xl font-black">
              {tr("اختر كلمة المرور", "Choose a password")}
            </h2>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
              {tr("سنحفظ هذه الكلمة لرقمك ", "We'll save this password for ")}
              <span className="font-bold text-foreground" dir="ltr">
                {phone}
              </span>
              {tr(
                " — في المرات القادمة تدخل بالرقم وكلمة المرور فقط بدون رمز.",
                " — next time you'll only need the number and password, no code.",
              )}
            </p>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute left-4 top-1/2 -translate-y-1/2"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={tr(
                "كلمة المرور (6 أحرف على الأقل)",
                "Password (at least 6 characters)",
              )}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary"
              dir="ltr"
            />
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder={tr("تأكيد كلمة المرور", "Confirm password")}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className={`w-full h-13 rounded-2xl border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary ${password2 && password2 !== password ? "border-red-400" : "border-border"}`}
              dir="ltr"
            />
            {password2 && password2 !== password && (
              <p className="text-xs text-red-500 mt-1 pr-1">
                {tr("كلمتا المرور غير متطابقتين", "Passwords don't match")}
              </p>
            )}
          </div>
          <button
            onClick={handlePhoneSetPassword}
            disabled={loading || password.length < 6 || password !== password2}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {tr("حفظ والمتابعة", "Save and continue")}
          </button>
          <button
            onClick={() => {
              localStorage.setItem("al_tayebat_onboarded_v2", "1");
              setLocation("/register");
            }}
            className="w-full text-center text-sm text-muted-foreground py-2"
          >
            {tr(
              "تخطّى الآن (يمكنك إضافتها لاحقاً)",
              "Skip for now (you can add it later)",
            )}
          </button>
        </div>
      </div>
    );
  }

  /* ── Email Login screen ── */
  if (mode === "email-login") {
    return (
      <div
        className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
        dir={dir}
      >
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-4">
          <button
            onClick={() => setMode("landing")}
            className="flex items-center gap-1 text-muted-foreground text-sm"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" /> {tr("رجوع", "Back")}
          </button>
          <h2 className="text-2xl font-black">
            {tr("تسجيل الدخول", "Sign in")}
          </h2>
          <div className="relative">
            <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="email"
              placeholder={tr("البريد الإلكتروني", "Email address")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-12 pl-4 py-3.5 text-sm outline-none focus:border-primary transition-colors"
              dir="ltr"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute left-4 top-1/2 -translate-y-1/2"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Eye className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={tr("كلمة المرور", "Password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
              className="w-full h-13 rounded-2xl border border-border bg-muted/30 pr-4 pl-12 py-3.5 text-sm outline-none focus:border-primary transition-colors"
              dir="ltr"
            />
          </div>
          <RememberMeBox />
          <button
            onClick={handleEmailLogin}
            disabled={loading || !signInLoaded}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading || !signInLoaded ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : null}
            {!signInLoaded
              ? tr("جاري تحميل خدمة الدخول...", "Loading sign-in service...")
              : loading
                ? tr("جاري تسجيل الدخول...", "Signing in...")
                : tr("تسجيل الدخول", "Sign in")}
          </button>
          <button
            type="button"
            onClick={handleEmailForgotPassword}
            disabled={loading || !email}
            className="w-full text-center text-sm text-muted-foreground hover:text-primary disabled:opacity-40 underline"
          >
            {tr(
              "نسيت كلمة المرور؟ أرسل لي رمز تحقق",
              "Forgot password? Send me a verification code",
            )}
          </button>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted-foreground text-xs">
              {tr("أو", "Or")}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <button
            onClick={() => setMode("email-signup")}
            className="w-full h-12 border-2 border-primary text-primary font-black rounded-2xl hover:bg-primary/5 transition-all text-sm"
          >
            {tr("إنشاء حساب جديد", "Create a new account")}
          </button>
          <button
            onClick={skipAuth}
            className="w-full text-center text-sm text-muted-foreground py-1"
          >
            {tr("تخطّى — تصفح كضيف", "Skip — browse as guest")}
          </button>
        </div>
      </div>
    );
  }

  /* ── Email Signup screen ── */
  if (mode === "email-signup") {
    return (
      <div
        className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
        dir={dir}
      >
        {headerImg}
        <div className="flex-1 px-6 py-6 space-y-4">
          <button
            onClick={() => setMode("landing")}
            className="flex items-center gap-1 text-muted-foreground text-sm"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" /> {tr("رجوع", "Back")}
          </button>
          <h2 className="text-2xl font-black">
            {tr("إنشاء حساب جديد", "Create a new account")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">
                {tr("الاسم الأول *", "First name *")}
              </label>
              <input
                type="text"
                placeholder={tr("أحمد", "Ahmad")}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">
                {tr("اسم العائلة", "Last name")}
              </label>
              <input
                type="text"
                placeholder={tr("محمد", "Mohammad")}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="relative">
            <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              placeholder={tr("البريد الإلكتروني", "Email address")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 rounded-xl border border-border bg-muted/30 pr-11 pl-4 text-sm outline-none focus:border-primary"
              dir="ltr"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute left-4 top-1/2 -translate-y-1/2"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={tr(
                "كلمة المرور (8 أحرف على الأقل)",
                "Password (at least 8 characters)",
              )}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 rounded-xl border border-border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary"
              dir="ltr"
            />
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder={tr("تأكيد كلمة المرور", "Confirm password")}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className={`w-full h-12 rounded-xl border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary ${
                password2 && password2 !== password
                  ? "border-red-400"
                  : "border-border"
              }`}
              dir="ltr"
            />
            {password2 && password2 !== password && (
              <p className="text-xs text-red-500 mt-1 pr-1">
                {tr("كلمتا المرور غير متطابقتين", "Passwords don't match")}
              </p>
            )}
          </div>
          <RememberMeBox />
          <button
            onClick={handleEmailSignup}
            disabled={loading || !signUpLoaded}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading || !signUpLoaded ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : null}
            {!signUpLoaded
              ? tr("جاري تحميل خدمة التسجيل...", "Loading signup service...")
              : loading
                ? tr("جاري إنشاء الحساب...", "Creating account...")
                : tr("إنشاء الحساب", "Create account")}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            {tr("لديك حساب؟ ", "Already have an account? ")}
            <button
              onClick={() => setMode("email-login")}
              className="text-primary font-bold underline"
            >
              {tr("تسجيل الدخول", "Sign in")}
            </button>
          </p>
          <button
            onClick={skipAuth}
            className="w-full text-center text-sm text-muted-foreground py-1"
          >
            {tr("تخطّى — تصفح كضيف", "Skip — browse as guest")}
          </button>
        </div>
      </div>
    );
  }

  /* ── Landing screen ── */
  return (
    <div
      className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
      dir={dir}
    >
      {headerImg}
      <div className="flex-1 px-6 py-8 space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black">
            {tr("مرحباً! 👋", "Welcome! 👋")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tr(
              "سجّل دخولك أو أنشئ حساباً للمتابعة",
              "Sign in or create an account to continue",
            )}
          </p>
        </div>

        <button
          onClick={() => setMode("email-login")}
          className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground text-base font-black rounded-2xl shadow-md transition-all flex items-center gap-3 px-5"
        >
          <Mail className="w-5 h-5 shrink-0" />
          <span className="flex-1 text-right">
            {tr("تسجيل الدخول بالبريد الإلكتروني", "Sign in with email")}
          </span>
        </button>

        <button
          onClick={() => setMode("phone-input")}
          className="w-full h-14 border-2 border-border hover:border-primary hover:bg-primary/5 active:scale-[0.98] text-foreground text-base font-bold rounded-2xl transition-all flex items-center gap-3 px-5"
        >
          <Phone className="w-5 h-5 shrink-0 text-primary" />
          <span className="flex-1 text-right">
            {tr("تسجيل الدخول برقم الهاتف (OTP)", "Sign in with phone (OTP)")}
          </span>
          {firebaseEnabled && (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">
              {tr("مُفعّل", "Enabled")}
            </span>
          )}
        </button>

        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-xs font-medium">
            {tr("أو", "Or")}
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          onClick={() => setMode("email-signup")}
          className="w-full h-14 bg-rose hover:bg-rose/90 active:scale-[0.98] text-white text-base font-black rounded-2xl shadow-md transition-all flex items-center gap-3 px-5"
        >
          <span className="text-xl">✨</span>
          <span className="flex-1 text-right">
            {tr("إنشاء حساب جديد", "Create a new account")}
          </span>
        </button>

        <p className="text-center text-xs text-muted-foreground pt-1 leading-relaxed">
          {tr("بالمتابعة توافق على ", "By continuing, you agree to the ")}
          <span
            className="underline cursor-pointer text-foreground font-medium"
            onClick={() => setLocation("/privacy-policy")}
          >
            {tr("سياسة الخصوصية", "Privacy Policy")}
          </span>
          {tr(" و ", " and ")}
          <span className="underline cursor-pointer text-foreground font-medium">
            {tr("شروط الاستخدام", "Terms of Use")}
          </span>
        </p>

        <button
          onClick={skipAuth}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2 font-medium"
        >
          {tr(
            "تخطّى — تصفح كضيف بدون تسجيل",
            "Skip — browse as a guest without registering",
          )}
        </button>
      </div>
    </div>
  );
}

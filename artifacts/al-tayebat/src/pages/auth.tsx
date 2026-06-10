import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import {
  Phone,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Leaf,
} from "lucide-react";
import { toast } from "sonner";
import { isConfigured, auth } from "@/lib/firebase";
import { apiUrl } from "@/lib/api-url";
import { takeReturnTo } from "@/lib/post-auth";
import { syncLocationFlagFromProfile } from "@/lib/location-gate";
import { notifySessionChange } from "@/hooks/use-session";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { useLanguage } from "@/contexts/language";

const REMEMBER_EMAIL_KEY = "al_tayebat_remember_email";
const REMEMBER_PHONE_KEY = "al_tayebat_remember_phone";

type Mode =
  | "landing"
  | "signup"
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
  const [identifier, setIdentifier] = useState(
    () =>
      localStorage.getItem(REMEMBER_EMAIL_KEY) ||
      localStorage.getItem(REMEMBER_PHONE_KEY) ||
      "",
  );
  const [email, setEmail] = useState(
    () => localStorage.getItem(REMEMBER_EMAIL_KEY) || "",
  );
  const [phone, setPhone] = useState(
    () => localStorage.getItem(REMEMBER_PHONE_KEY) || "",
  );
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  // Seconds remaining before the user may request a fresh OTP. Phone OTP starts at
  // 120 (mirrors Firebase's 120s auto-retrieval window so the on-screen countdown
  // matches the real timer); email at 60. Ticks down to 0.
  const [resendIn, setResendIn] = useState(0);
  const [pendingSignUp, setPendingSignUp] = useState(false);
  const [pendingPhonePassword, setPendingPhonePassword] = useState(false);
  // True while the user is going through phone-OTP password RECOVERY (vs a new
  // signup) — used to show "new password / password updated" copy.
  const [isPhoneReset, setIsPhoneReset] = useState(false);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  // On native (Capacitor) we verify via the native Firebase SDK, which returns a
  // verificationId through the `phoneCodeSent` listener instead of a web
  // ConfirmationResult. We stash it here to confirm the code in the next step.
  const phoneVerificationIdRef = useRef<string | null>(null);
  // (#2) Synchronous re-entrancy lock for "send OTP". React `loading` updates
  // asynchronously, so a re-render (soft keyboard appearing) or a fast double-tap
  // could re-enter and fire signInWithPhoneNumber twice; this ref flips
  // immediately and is the real guard.
  const sendingOtpRef = useRef(false);
  // (#1) Native listener handles for Android auto-retrieval / instant verification
  // kept ALIVE after `phoneCodeSent` (the SMS is auto-read a few seconds later).
  const autoVerifyHandlesRef = useRef<PluginListenerHandle[]>([]);
  // Finalize-once guard shared by the auto-retrieval and manual-entry paths so a
  // login is never completed twice.
  const phoneAuthCompletingRef = useRef(false);
  // Live ref to the latest completePhoneAuth closure so the persistent native
  // listener never calls a stale version (current phone/password/reset state).
  const completePhoneAuthRef = useRef<(uid: string) => Promise<void>>(
    async () => {},
  );

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
      setLocation(takeReturnTo() || "/");
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

  const looksLikeEmail = (v: string) => v.includes("@");

  // Single identifier field (phone OR email), Tulip-style. We keep the derived
  // email/phone state in sync so the existing handlers keep working unchanged.
  const onIdentifierChange = (v: string) => {
    setIdentifier(v);
    if (looksLikeEmail(v)) {
      setEmail(v.trim());
      setPhone("");
    } else {
      setPhone(v.replace(/\D/g, "").slice(0, 10));
      setEmail("");
    }
  };

  useEffect(() => {
    return () => {
      try {
        window.recaptchaVerifier?.clear();
      } catch {}
      // (#1) Tear down any native phone-auth listeners kept alive for
      // auto-retrieval so a late silent verification can't fire after unmount.
      if (Capacitor.isNativePlatform()) {
        autoVerifyHandlesRef.current = [];
        import("@capacitor-firebase/authentication")
          .then((m) => m.FirebaseAuthentication.removeAllListeners())
          .catch(() => {});
      }
    };
  }, []);

  // Whenever an OTP entry screen is shown, (re)start the resend cooldown. Phone
  // mirrors Firebase's 120s auto-retrieval window; email keeps the 60s cooldown.
  useEffect(() => {
    if (mode === "otp-phone") setResendIn(120);
    else if (mode === "otp-email") setResendIn(60);
  }, [mode]);

  // Tick the resend cooldown down to zero, one second at a time.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const skipAuth = () => {
    // User chose to stay a guest — drop any stashed "return to checkout" intent
    // so a later sign-in doesn't unexpectedly bounce them back there.
    takeReturnTo();
    localStorage.setItem("al_tayebat_auth_skipped_v2", "1");
    localStorage.setItem("al_tayebat_onboarded_v2", "1");
    setLocation("/");
  };

  // After a successful sign-in/sign-up, return the user to wherever they were
  // headed (e.g. checkout) if a return path was stashed, otherwise go home.
  const goAfterAuth = (fallback: string) => {
    notifySessionChange();
    setLocation(takeReturnTo() || fallback);
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
        goAfterAuth("/");
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
        setMode("signup");
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
      toast.error(
        tr(
          "أدخل بريدك الإلكتروني في الحقل أعلاه أولاً",
          "Enter your email in the field above first",
        ),
      );
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

  /* ── Email Signup (no name field — Tulip-style unified form) ── */
  const handleEmailSignup = async () => {
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

    const createPayload = (extra?: Record<string, string>) =>
      signUp.create({
        emailAddress: email,
        password,
        ...extra,
      } as Parameters<typeof signUp.create>[0]);

    try {
      try {
        await createPayload();
      } catch (e1: unknown) {
        const er = extract(e1);
        // Some Clerk instances require a first name — derive one from the email
        // local-part so the unified form can stay name-free.
        if (
          er?.code === "form_param_missing" ||
          er?.meta?.paramName === "first_name"
        ) {
          const fallbackName = email.split("@")[0] || "User";
          await createPayload({ firstName: fallbackName });
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
        setMode("landing");
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
          goAfterAuth("/");
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
                "لا يوجد حساب — أنشئ حساباً جديداً",
                "No account — create a new one",
              ),
          );
          setMode("signup");
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
      // Returning users who already saved a location skip the mandatory gate.
      syncLocationFlagFromProfile(body);
      persistRemembered("phone", phone);
      toast.success(tr("مرحباً بك في الطيبات!", "Welcome to Al-Tayebat!"));
      goAfterAuth("/");
    } catch (err) {
      toast.error(
        (err as Error).message || tr("فشل تسجيل الدخول", "Sign-in failed"),
      );
    }
    setLoading(false);
  };

  /* ── After OTP verify: persist password so future logins skip OTP ── */
  const handlePhoneSetPassword = async (): Promise<boolean> => {
    if (password.length < 6) {
      toast.error(
        tr(
          "كلمة المرور 6 أحرف على الأقل",
          "Password must be at least 6 characters",
        ),
      );
      return false;
    }
    if (password !== password2) {
      toast.error(tr("كلمتا المرور غير متطابقتين", "Passwords don't match"));
      return false;
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
      const wasReset = isPhoneReset;
      toast.success(
        wasReset
          ? tr("تم تحديث كلمة المرور 🎉", "Your password has been updated 🎉")
          : tr("تم إنشاء حسابك بنجاح 🎉", "Your account has been created 🎉"),
      );
      setIsPhoneReset(false);
      setLoading(false);
      if (wasReset) {
        goAfterAuth("/");
      } else {
        setLocation("/register");
      }
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
      return false;
    }
  };

  /* ── After OTP verify: create/find profile, then set password or move on ── */
  // Shared post-verification finalize used by BOTH the manual OTP path and the
  // native auto-verification path (instant verification with no code entry).
  const completePhoneAuth = async (uid: string) => {
    // (#1) Finalize exactly once — Android auto-retrieval and a manual code entry
    // can both resolve; the guard makes the second call a no-op.
    if (phoneAuthCompletingRef.current) return;
    phoneAuthCompletingRef.current = true;
    localStorage.setItem("al_tayebat_firebase_uid", uid);
    localStorage.setItem("al_tayebat_phone", phone);
    localStorage.setItem("al_tayebat_onboarded_v2", "1");
    persistRemembered("phone", phone);
    const res = await fetch(apiUrl("/api/users/profile"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firebaseUid: uid, phone, role: "consumer" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Release the once-guard so the user can retry after a transient failure.
      phoneAuthCompletingRef.current = false;
      throw new Error(
        body.error || tr("فشل حفظ الملف الشخصي", "Failed to save profile"),
      );
    }
    const profile = await res.json();
    localStorage.setItem("al_tayebat_user_id", String(profile.id));
    // Returning phone users with a saved location skip the mandatory gate.
    syncLocationFlagFromProfile(profile);
    // The verification session is fully consumed now — don't let a stale id pass
    // the "session exists" gate on a later attempt.
    phoneVerificationIdRef.current = null;

    // If the user already chose a password during signup, save it now and skip
    // the extra "set password" screen (single signup form).
    if (pendingPhonePassword && password.length >= 6) {
      const saved = await handlePhoneSetPassword();
      if (saved) {
        setPendingPhonePassword(false);
      } else {
        // Auto-save failed (e.g. network) — the OTP code is already consumed, so
        // drop the user on the retryable password screen instead of stranding
        // them on the OTP step.
        setMode("phone-set-password");
      }
    } else {
      toast.success(
        isPhoneReset
          ? tr(
              "تم التحقق! اختر كلمة مرور جديدة",
              "Verified! Choose a new password",
            )
          : tr(
              "تم التحقق! اختر كلمة المرور للدخول لاحقاً بدون رمز",
              "Verified! Choose a password so you can sign in later without a code",
            ),
      );
      setPassword("");
      setPassword2("");
      setMode("phone-set-password");
    }
  };

  // Keep a live ref to the latest finalize closure so the long-lived native
  // listener below always runs against the current phone/password/reset state.
  completePhoneAuthRef.current = completePhoneAuth;

  // (#1) Tear down native phone-auth listeners (auto-retrieval) when leaving the
  // OTP flow so a late silent verification can't navigate an already-departed user.
  const removeNativePhoneListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    autoVerifyHandlesRef.current = [];
    try {
      const { FirebaseAuthentication } =
        await import("@capacitor-firebase/authentication");
      await FirebaseAuthentication.removeAllListeners();
    } catch {}
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

    // (#2) Synchronous re-entrancy lock: never fire signInWithPhoneNumber twice. A
    // re-render (soft keyboard) or a rapid double-tap could re-enter before the
    // async `loading` state flips, so guard with a ref that flips immediately.
    if (sendingOtpRef.current) return;
    sendingOtpRef.current = true;
    // Fresh verification session — release the finalize-once guard.
    phoneAuthCompletingRef.current = false;
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native Android/iOS: verify through the native Firebase SDK (backed by
        // Play Integrity / device verification) instead of the JS reCAPTCHA web
        // flow, which loops and freezes the Capacitor WebView. This is what makes
        // live SMS verification work for ANY real phone number.
        const { FirebaseAuthentication } =
          await import("@capacitor-firebase/authentication");
        phoneVerificationIdRef.current = null;
        await FirebaseAuthentication.removeAllListeners();
        autoVerifyHandlesRef.current = [];

        // (#1) PERSISTENT auto-verify listener. On Android the SMS is auto-read a
        // few seconds AFTER `phoneCodeSent`, so this listener must stay ALIVE
        // through the OTP screen to catch silent / instant verification and finish
        // the login automatically. (The old code removed every listener right
        // after `phoneCodeSent`, silently dropping auto-retrieval.)
        const autoCompleted = await FirebaseAuthentication.addListener(
          "phoneVerificationCompleted",
          (event) => {
            const uid = event.user?.uid;
            if (!uid) return;
            void (async () => {
              try {
                toast(tr("تم التحقق تلقائياً", "Verified automatically"));
                await completePhoneAuthRef.current(uid);
              } catch (e) {
                phoneAuthCompletingRef.current = false;
                toast.error(
                  (e as Error).message ||
                    tr("فشل التحقق", "Verification failed"),
                );
              }
            })();
          },
        );
        autoVerifyHandlesRef.current.push(autoCompleted);

        // One-shot race for the SEND result: code delivered, instant completion,
        // or failure. These listeners are removed once the send settles; only the
        // persistent auto-verify listener above survives onto the OTP screen.
        const oneShot: PluginListenerHandle[] = [];
        type Outcome =
          | { type: "code"; verificationId: string }
          | { type: "completed"; uid: string };
        try {
          const outcome = await new Promise<Outcome>((resolve, reject) => {
            let settled = false;
            const settle = (fn: () => void) => {
              if (settled) return;
              settled = true;
              fn();
            };
            // Register ALL listeners BEFORE firing the request, otherwise a fast
            // `phoneCodeSent`/`phoneVerificationCompleted` (instant verification)
            // can arrive before the listener exists and the promise hangs.
            Promise.all([
              FirebaseAuthentication.addListener("phoneCodeSent", (event) =>
                settle(() =>
                  resolve({
                    type: "code",
                    verificationId: event.verificationId,
                  }),
                ),
              ),
              FirebaseAuthentication.addListener(
                "phoneVerificationCompleted",
                (event) =>
                  settle(() => {
                    if (event.user?.uid)
                      resolve({ type: "completed", uid: event.user.uid });
                    else
                      reject(
                        new Error(tr("فشل التحقق", "Verification failed")),
                      );
                  }),
              ),
              FirebaseAuthentication.addListener(
                "phoneVerificationFailed",
                (event) => settle(() => reject(new Error(event.message))),
              ),
            ])
              .then((registered) => {
                oneShot.push(...registered);
                return FirebaseAuthentication.signInWithPhoneNumber({
                  phoneNumber: e164,
                  // Firebase caps Android phone-auth auto-retrieval at 120s — the
                  // maximum validity window before a resend is required. This is
                  // also the real timer the on-screen 120s countdown mirrors.
                  timeout: 120,
                });
              })
              .catch((e) => settle(() => reject(e as Error)));
          });

          if (outcome.type === "completed") {
            // Instant verification before the code was even sent: the native SDK
            // already signed the user in, so skip the OTP screen and finalize.
            toast(tr("تم التحقق تلقائياً", "Verified automatically"));
            await completePhoneAuth(outcome.uid);
            return;
          }
          phoneVerificationIdRef.current = outcome.verificationId;
          setMode("otp-phone");
          toast(
            tr(
              "تم إرسال رمز التحقق إلى هاتفك",
              "A verification code has been sent to your phone",
            ),
          );
        } finally {
          // Remove ONLY the one-shot send listeners; the persistent auto-verify
          // listener stays alive to catch a later auto-retrieval.
          for (const h of oneShot) {
            try {
              await h.remove();
            } catch {}
          }
        }
        return;
      }

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
      // (#1) The send failed before reaching the OTP screen — drop the persistent
      // auto-verify listener so it can't fire a stale completion later.
      void removeNativePhoneListeners();
      const msg = (err as Error).message;
      toast.error(
        msg?.includes("invalid-phone")
          ? tr("رقم الهاتف غير صحيح", "Invalid phone number")
          : msg
            ? tr(`فشل إرسال الرمز: ${msg}`, `Failed to send the code: ${msg}`)
            : tr(
                "فشل إرسال الرمز. تأكد من رقم الهاتف.",
                "Failed to send the code. Check the phone number.",
              ),
      );
    } finally {
      // (#2) Always release the synchronous lock + loading state, even on the
      // early `return` paths above (instant verification / code sent).
      sendingOtpRef.current = false;
      setLoading(false);
    }
  };

  /* ── Resend the OTP for whichever screen the user is on (phone 120s / email 60s cooldown) ── */
  const handleResendOtp = async () => {
    if (resendIn > 0 || loading) return;
    if (mode === "otp-phone") {
      await handleSendPhoneOtp();
    } else if (mode === "otp-email") {
      if (pendingSignUp) {
        // Signup email verification: re-prepare the email_code on the pending
        // sign-up attempt.
        if (!signUpLoaded) return;
        setLoading(true);
        try {
          await signUp.prepareEmailAddressVerification({
            strategy: "email_code",
          });
          toast.success(
            tr(
              "تم إرسال رمز جديد إلى بريدك",
              "A new code was sent to your email",
            ),
          );
        } catch {
          toast.error(
            tr("تعذّر إعادة إرسال الرمز", "Couldn't resend the code"),
          );
        }
        setLoading(false);
      } else {
        // Password-recovery / sign-in email code: re-run the forgot-password
        // prepare, which re-sends the email_code.
        await handleEmailForgotPassword();
      }
    }
    // Restart the cooldown even if the send re-rendered the same OTP mode (the
    // mode-change effect won't fire when the value is unchanged). Phone mirrors
    // Firebase's 120s auto-retrieval window; email keeps 60s.
    setResendIn(mode === "otp-phone" ? 120 : 60);
  };

  /* ── Firebase Phone Verify OTP ── */
  const handleOtpPhoneVerify = async () => {
    if (!otp || otp.length < 6) {
      toast.error(tr("أدخل الرمز المكون من 6 أرقام", "Enter the 6-digit code"));
      return;
    }
    const isNative = Capacitor.isNativePlatform();
    const hasSession = isNative
      ? !!phoneVerificationIdRef.current
      : !!window.confirmationResult;
    if (!hasSession) {
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
      let uid: string | undefined;
      if (isNative) {
        const { FirebaseAuthentication } =
          await import("@capacitor-firebase/authentication");
        const result = await FirebaseAuthentication.confirmVerificationCode({
          verificationId: phoneVerificationIdRef.current!,
          verificationCode: otp,
        });
        uid = result.user?.uid;
      } else {
        const result = await window.confirmationResult!.confirm(otp);
        uid = result.user?.uid;
      }
      if (uid) {
        await completePhoneAuth(uid);
      }
    } catch (err) {
      // Release the finalize-once guard so a corrected code can be retried.
      phoneAuthCompletingRef.current = false;
      toast.error(
        (err as Error).message ||
          tr("الرمز غير صحيح أو منتهي الصلاحية", "Code is invalid or expired"),
      );
    }
    setLoading(false);
  };

  /* ── Unified dispatchers: route the single identifier to email or phone flow ── */
  const handleLogin = () => {
    if (!identifier.trim()) {
      toast.error(
        tr("أدخل رقم الهاتف أو البريد الإلكتروني", "Enter your phone or email"),
      );
      return;
    }
    if (looksLikeEmail(identifier)) handleEmailLogin();
    else handlePhonePasswordLogin();
  };

  /* ── Forgot password dispatcher: email → Clerk OTP, phone → Firebase OTP ── */
  const handleForgotPassword = async () => {
    if (!identifier.trim()) {
      toast.error(
        tr(
          "أدخل رقم الهاتف أو البريد الإلكتروني أولاً",
          "Enter your phone or email first",
        ),
      );
      return;
    }
    if (looksLikeEmail(identifier)) {
      handleEmailForgotPassword();
      return;
    }
    // Phone recovery is RESET-only: it must target an EXISTING account. Verify
    // the number is registered before sending an OTP, otherwise "forgot
    // password" would silently create a brand-new account.
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
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/api/auth/check?phone=${encodeURIComponent(phone)}`),
      );
      const body = (await res.json().catch(() => ({}))) as { exists?: boolean };
      if (res.ok && !body.exists) {
        toast.error(
          tr(
            "لا يوجد حساب بهذا الرقم — أنشئ حساباً جديداً",
            "No account with this number — create a new one",
          ),
        );
        setLoading(false);
        setMode("signup");
        return;
      }
    } catch {
      // Network failure on the check — fall through and let the OTP proceed
      // rather than blocking a legitimate recovery.
    }
    setLoading(false);
    // Prove ownership via OTP, then land on the "set a new password" screen.
    setPendingPhonePassword(false);
    setIsPhoneReset(true);
    setPassword("");
    setPassword2("");
    handleSendPhoneOtp();
  };

  const handleSignup = () => {
    // A fresh signup is never a password reset — clear any stale recovery flag
    // so the "password updated / new password" copy can't leak in.
    setIsPhoneReset(false);
    if (!identifier.trim()) {
      toast.error(
        tr("أدخل رقم الهاتف أو البريد الإلكتروني", "Enter your phone or email"),
      );
      return;
    }
    if (looksLikeEmail(identifier)) {
      handleEmailSignup();
      return;
    }
    // Phone signup: collect the password now (Tulip-style), then send the OTP.
    // After the code is verified we save this password automatically.
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
    setPendingPhonePassword(true);
    handleSendPhoneOtp();
  };

  const headerImg = (
    <div className="relative shrink-0 overflow-hidden rounded-b-[2rem] bg-gradient-to-bl from-primary via-primary to-rose px-6 pt-12 pb-9">
      {/* soft decorative circles */}
      <div className="absolute -top-12 -right-10 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-14 -left-8 w-44 h-44 rounded-full bg-white/5" />
      <div className="relative flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/25">
          <Leaf className="w-10 h-10 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-white text-3xl font-black drop-shadow-sm">
            {tr("الطيبات", "Al-Tayebat")}
          </h1>
          <p className="text-white/85 text-sm mt-0.5">
            {tr("طعام صحي يوصل لبابك", "Healthy food delivered to your door")}
          </p>
        </div>
      </div>
    </div>
  );

  const RememberMeBox = ({ label }: { label?: string }) => (
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
        {label || tr("تذكّرني", "Remember me")}
      </span>
    </label>
  );

  // Shared identifier (phone OR email) input — the heart of the Tulip-style form.
  const identifierField = (
    <div className="relative">
      <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
      <input
        type="text"
        inputMode="email"
        autoComplete="username"
        placeholder={tr(
          "رقم الهاتف أو البريد الإلكتروني",
          "Phone or email address",
        )}
        value={identifier}
        onChange={(e) => onIdentifierChange(e.target.value)}
        className="w-full h-14 rounded-2xl border border-border bg-muted/30 pr-12 pl-4 text-sm outline-none focus:border-primary transition-colors"
        dir="ltr"
      />
    </div>
  );

  const passwordField = (
    placeholder: string,
    onEnter?: () => void,
    auto = "current-password",
  ) => (
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
        autoComplete={auto}
        placeholder={placeholder}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="w-full h-14 rounded-2xl border border-border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary transition-colors"
        dir="ltr"
      />
    </div>
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
              setMode("signup");
              setOtp("");
              setIsPhoneReset(false);
              // (#1) Leaving the OTP flow: drop the persistent auto-verify
              // listener so a late silent verification can't sign the user in.
              phoneAuthCompletingRef.current = false;
              void removeNativePhoneListeners();
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
            type="button"
            onClick={handleResendOtp}
            disabled={resendIn > 0 || loading}
            className="w-full text-center text-sm font-bold text-primary disabled:text-muted-foreground disabled:font-normal py-2"
          >
            {resendIn > 0
              ? tr(
                  `إعادة إرسال الرمز خلال ${resendIn} ثانية`,
                  `Resend code in ${resendIn}s`,
                )
              : tr("إعادة إرسال الرمز", "Resend code")}
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
              setMode(pendingSignUp ? "signup" : "landing");
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
            type="button"
            onClick={handleResendOtp}
            disabled={resendIn > 0 || loading}
            className="w-full text-center text-sm font-bold text-primary disabled:text-muted-foreground disabled:font-normal py-2"
          >
            {resendIn > 0
              ? tr(
                  `إعادة إرسال الرمز خلال ${resendIn} ثانية`,
                  `Resend code in ${resendIn}s`,
                )
              : tr("إعادة إرسال الرمز", "Resend code")}
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

  /* ── Set Password after phone OTP signup (fallback path) ── */
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
              {isPhoneReset
                ? tr("كلمة مرور جديدة", "New password")
                : tr("اختر كلمة المرور", "Choose a password")}
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
        </div>
      </div>
    );
  }

  /* ── Signup screen (unified, Tulip-style) ── */
  if (mode === "signup") {
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
          <div>
            <h2 className="text-2xl font-black">
              {tr("أنشئ حسابك الجديد", "Create your new account")}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {tr("بالهاتف أو البريد الإلكتروني", "With your phone or email")}
            </p>
          </div>

          {identifierField}

          {passwordField(
            tr("كلمة المرور (6 أحرف على الأقل)", "Password (6+ characters)"),
            handleSignup,
            "new-password",
          )}

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder={tr("تأكيد كلمة المرور", "Confirm password")}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignup()}
              className={`w-full h-14 rounded-2xl border bg-muted/30 pr-4 pl-12 text-sm outline-none focus:border-primary ${password2 && password2 !== password ? "border-red-400" : "border-border"}`}
              dir="ltr"
            />
            {password2 && password2 !== password && (
              <p className="text-xs text-red-500 mt-1 pr-1">
                {tr("كلمتا المرور غير متطابقتين", "Passwords don't match")}
              </p>
            )}
          </div>

          <RememberMeBox
            label={tr("تذكّرني على هذا الجهاز", "Remember me on this device")}
          />

          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {loading
              ? tr("جاري الإنشاء...", "Creating...")
              : tr("إرسال رمز التحقق", "Send verification code")}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {tr("لديك حساب بالفعل؟ ", "Already have an account? ")}
            <button
              onClick={() => setMode("landing")}
              className="text-primary font-bold underline"
            >
              {tr("سجّل دخولك", "Sign in")}
            </button>
          </p>

          <button
            onClick={skipAuth}
            className="w-full text-center text-sm text-muted-foreground py-1"
          >
            {tr("تخطّى — تصفح كضيف", "Skip — browse as guest")}
          </button>
          <div ref={recaptchaRef} />
        </div>
      </div>
    );
  }

  /* ── Landing / Login screen (unified, Tulip-style) ── */
  return (
    <div
      className="min-h-screen bg-background flex flex-col max-w-md mx-auto"
      dir={dir}
    >
      {headerImg}
      <div className="flex-1 px-6 py-8 space-y-4">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-black">
            {tr("مرحباً بعودتك 🌿", "Welcome back 🌿")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tr("سجّل دخولك للمتابعة", "Sign in to continue")}
          </p>
        </div>

        {identifierField}

        {passwordField(tr("كلمة المرور", "Password"), handleLogin)}

        <div className="flex items-center justify-between">
          <RememberMeBox />
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            className="text-sm text-primary font-medium disabled:opacity-40"
          >
            {tr("نسيت كلمة المرور؟", "Forgot password?")}
          </button>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-5 h-5" />
          )}
          {loading
            ? tr("جاري تسجيل الدخول...", "Signing in...")
            : tr("دخول", "Sign in")}
        </button>

        <p className="text-center text-sm text-muted-foreground pt-1">
          {tr("مستخدم جديد؟ ", "New here? ")}
          <button
            onClick={() => setMode("signup")}
            className="text-primary font-bold underline"
          >
            {tr("سجّل الآن", "Sign up now")}
          </button>
        </p>

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
        <div ref={recaptchaRef} />
      </div>
    </div>
  );
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/contexts/language";

// All Clerk / Firebase / navigation seams are mocked so we can drive each auth
// success path deterministically and assert where the user is sent afterwards.
const h = vi.hoisted(() => ({
  mockSetLocation: vi.fn(),
  // Clerk sign-in
  signInCreate: vi.fn(),
  attemptFirstFactor: vi.fn(),
  prepareFirstFactor: vi.fn(),
  setActiveSignIn: vi.fn(),
  // Clerk sign-up
  signUpCreate: vi.fn(),
  attemptEmailVerification: vi.fn(),
  prepareEmailVerification: vi.fn(),
  setActiveSignUp: vi.fn(),
  // Firebase phone
  signInWithPhoneNumber: vi.fn(),
  isConfigured: vi.fn(() => false),
  // Clerk session state used by the on-mount redirect effect
  isSignedIn: { value: false },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/auth", h.mockSetLocation],
}));

vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast };
});

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: h.isSignedIn.value, isLoaded: true }),
  useUser: () => ({ user: null }),
}));

vi.mock("@clerk/react/legacy", () => ({
  useSignIn: () => ({
    isLoaded: true,
    setActive: h.setActiveSignIn,
    signIn: {
      create: h.signInCreate,
      attemptFirstFactor: h.attemptFirstFactor,
      prepareFirstFactor: h.prepareFirstFactor,
    },
  }),
  useSignUp: () => ({
    isLoaded: true,
    setActive: h.setActiveSignUp,
    signUp: {
      create: h.signUpCreate,
      attemptEmailAddressVerification: h.attemptEmailVerification,
      prepareEmailAddressVerification: h.prepareEmailVerification,
    },
  }),
}));

vi.mock("@/lib/firebase", () => ({
  isConfigured: () => h.isConfigured(),
  auth: {},
}));

vi.mock("firebase/auth", () => ({
  RecaptchaVerifier: class {
    clear() {}
  },
  signInWithPhoneNumber: (...args: unknown[]) =>
    h.signInWithPhoneNumber(...args),
}));

import { toast } from "sonner";
import Auth from "../auth";
import Register from "../register";

const RETURN_KEY = "al_tayebat_return_to";

// The unified login/signup form: a single field accepts a phone OR an email.
const IDENTIFIER_PLACEHOLDER = "رقم الهاتف أو البريد الإلكتروني";
const SIGNUP_PASSWORD_PLACEHOLDER = /كلمة المرور \(6 أحرف على الأقل\)/;
const CONFIRM_PASSWORD_PLACEHOLDER = "تأكيد كلمة المرور";
const OTP_PLACEHOLDER = "_ _ _ _ _ _";

function renderAuth() {
  return render(
    <LanguageProvider>
      <Auth />
    </LanguageProvider>,
  );
}

function renderRegister() {
  return render(
    <LanguageProvider>
      <Register />
    </LanguageProvider>,
  );
}

// Logs in through the unified landing form (identifier + password → دخول).
async function loginWith(
  user: ReturnType<typeof userEvent.setup>,
  identifier: string,
  password: string,
) {
  await user.type(
    screen.getByPlaceholderText(IDENTIFIER_PLACEHOLDER),
    identifier,
  );
  await user.type(screen.getByPlaceholderText("كلمة المرور"), password);
  await user.click(screen.getByRole("button", { name: /^دخول$/ }));
}

beforeEach(() => {
  localStorage.clear();
  h.mockSetLocation.mockReset();
  h.signInCreate.mockReset().mockResolvedValue({});
  h.attemptFirstFactor.mockReset();
  h.prepareFirstFactor.mockReset().mockResolvedValue({});
  h.setActiveSignIn.mockReset().mockResolvedValue(undefined);
  h.signUpCreate.mockReset().mockResolvedValue({});
  h.attemptEmailVerification.mockReset();
  h.prepareEmailVerification.mockReset().mockResolvedValue({});
  h.setActiveSignUp.mockReset().mockResolvedValue(undefined);
  h.signInWithPhoneNumber.mockReset();
  h.isConfigured.mockReset().mockReturnValue(false);
  h.isSignedIn.value = false;
  // Firebase stashes its recaptcha/confirmation on window across renders.
  delete (window as { recaptchaVerifier?: unknown }).recaptchaVerifier;
  delete (window as { confirmationResult?: unknown }).confirmationResult;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Auth success paths honour the stashed return-to path", () => {
  it("email login navigates to the stashed path instead of home", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");
    // Email login is now a single password create call (strategy:"password").
    h.signInCreate.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_email",
    });

    const user = userEvent.setup();
    renderAuth();

    await loginWith(user, "a@b.com", "password123");

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    // The path is consumed so a later sign-in won't bounce back here.
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("phone-login (password) navigates to the stashed path", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 5, name: "أحمد" }),
      }),
    );

    const user = userEvent.setup();
    renderAuth();

    // A bare phone number (no "@") routes through the phone-password login.
    await loginWith(user, "0791234567", "secret1");

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("phone signup (new account) navigates to /register", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");
    h.isConfigured.mockReturnValue(true);
    h.signInWithPhoneNumber.mockResolvedValue({
      confirm: vi.fn().mockResolvedValue({ user: { uid: "fb_uid" } }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 9 }) }),
    );

    const user = userEvent.setup();
    renderAuth();

    // Landing → signup form → enter phone + password up front → request OTP.
    await user.click(screen.getByRole("button", { name: /سجّل الآن/ }));
    await user.type(
      screen.getByPlaceholderText(IDENTIFIER_PLACEHOLDER),
      "0791234567",
    );
    await user.type(
      screen.getByPlaceholderText(SIGNUP_PASSWORD_PLACEHOLDER),
      "secret1",
    );
    await user.type(
      screen.getByPlaceholderText(CONFIRM_PASSWORD_PLACEHOLDER),
      "secret1",
    );
    await user.click(screen.getByRole("button", { name: /إرسال رمز التحقق/ }));

    // OTP screen: confirm the code → password is auto-saved → a brand-new
    // account is sent to /register to pick its role, NOT the stashed path.
    await user.type(screen.getByPlaceholderText(OTP_PLACEHOLDER), "123456");
    await user.click(screen.getByRole("button", { name: /^تأكيد$/ }));

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/register"),
    );
    expect(h.mockSetLocation).not.toHaveBeenCalledWith("/checkout");
  });

  it("email-OTP login branch navigates to the stashed path", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");
    // Forgot-password flow surfaces an email_code factor, then the OTP verify
    // takes the sign-in (not sign-up) branch.
    h.signInCreate.mockResolvedValue({
      supportedFirstFactors: [
        { strategy: "email_code", emailAddressId: "eml_1" },
      ],
    });
    h.attemptFirstFactor.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_otp",
    });

    const user = userEvent.setup();
    renderAuth();

    await user.type(
      screen.getByPlaceholderText(IDENTIFIER_PLACEHOLDER),
      "a@b.com",
    );
    await user.click(screen.getByRole("button", { name: /نسيت كلمة المرور؟/ }));

    await user.type(screen.getByPlaceholderText(OTP_PLACEHOLDER), "123456");
    await user.click(screen.getByRole("button", { name: /^تأكيد$/ }));

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("choosing 'browse as guest' discards the stashed return path", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");

    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole("button", { name: /تخطّى — تصفح كضيف/ }));

    await waitFor(() => expect(h.mockSetLocation).toHaveBeenCalledWith("/"));
    expect(h.mockSetLocation).not.toHaveBeenCalledWith("/checkout");
    // The stale pay-later redirect is forgotten so a later sign-in won't
    // unexpectedly bounce the user to checkout.
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("falls back to home when no return path is stashed", async () => {
    h.signInCreate.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_home",
    });

    const user = userEvent.setup();
    renderAuth();

    await loginWith(user, "a@b.com", "password123");

    await waitFor(() => expect(h.mockSetLocation).toHaveBeenCalledWith("/"));
  });

  it("consumes the stored path so a later unrelated sign-in goes home", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");
    h.signInCreate.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_1",
    });

    const user = userEvent.setup();
    const first = renderAuth();

    await loginWith(user, "a@b.com", "password123");

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
    first.unmount();
    h.mockSetLocation.mockReset();

    // A second, unrelated sign-in (no return path stashed) must land home.
    renderAuth();
    await loginWith(user, "a@b.com", "password123");

    await waitFor(() => expect(h.mockSetLocation).toHaveBeenCalledWith("/"));
    expect(h.mockSetLocation).not.toHaveBeenCalledWith("/checkout");
  });
});

describe("Email signup lands a brand-new account on the register screen", () => {
  // Drives the email-signup flow up to the OTP screen so each case can submit a
  // code and assert on the verify branch's behaviour.
  async function reachEmailOtpScreen(user: ReturnType<typeof userEvent.setup>) {
    renderAuth();
    await user.click(screen.getByRole("button", { name: /سجّل الآن/ }));
    await user.type(
      screen.getByPlaceholderText(IDENTIFIER_PLACEHOLDER),
      "new@user.com",
    );
    await user.type(
      screen.getByPlaceholderText(SIGNUP_PASSWORD_PLACEHOLDER),
      "password123",
    );
    await user.type(
      screen.getByPlaceholderText(CONFIRM_PASSWORD_PLACEHOLDER),
      "password123",
    );
    await user.click(screen.getByRole("button", { name: /إرسال رمز التحقق/ }));
    await screen.findByPlaceholderText(OTP_PLACEHOLDER);
  }

  it("navigates to /register after OTP verify, not the stashed return path", async () => {
    // Even with a stashed return path, a fresh email signup must go to
    // /register to complete the profile — it does NOT honour al_tayebat_return_to.
    localStorage.setItem(RETURN_KEY, "/checkout");
    h.attemptEmailVerification.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_signup",
    });

    const user = userEvent.setup();
    await reachEmailOtpScreen(user);

    await user.type(screen.getByPlaceholderText(OTP_PLACEHOLDER), "123456");
    await user.click(screen.getByRole("button", { name: /^تأكيد$/ }));

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/register"),
    );
    // The stashed return path is intentionally NOT honoured here.
    expect(h.mockSetLocation).not.toHaveBeenCalledWith("/checkout");
  });

  it("shows an error toast and stays on the OTP screen when the code is wrong/expired", async () => {
    h.attemptEmailVerification.mockRejectedValue({
      errors: [{ message: "Incorrect code" }],
    });

    const user = userEvent.setup();
    await reachEmailOtpScreen(user);

    await user.type(screen.getByPlaceholderText(OTP_PLACEHOLDER), "000000");
    await user.click(screen.getByRole("button", { name: /^تأكيد$/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Incorrect code"),
    );
    // A failed verification must NOT advance the user — they stay on the OTP
    // screen (the code input is still rendered) and never reach /register.
    expect(screen.getByPlaceholderText(OTP_PLACEHOLDER)).toBeTruthy();
    expect(h.mockSetLocation).not.toHaveBeenCalledWith("/register");
  });

  it("does not navigate when verification resolves with a non-complete status", async () => {
    // Clerk can resolve without throwing yet report the sign-up isn't done
    // (e.g. status "missing_requirements"). The user must not be silently
    // dropped onto /register without a session.
    h.attemptEmailVerification.mockResolvedValue({
      status: "missing_requirements",
    });

    const user = userEvent.setup();
    await reachEmailOtpScreen(user);

    await user.type(screen.getByPlaceholderText(OTP_PLACEHOLDER), "123456");
    await user.click(screen.getByRole("button", { name: /^تأكيد$/ }));

    // Give any pending navigation a chance to fire, then assert none did.
    await waitFor(() => expect(h.attemptEmailVerification).toHaveBeenCalled());
    expect(h.setActiveSignUp).not.toHaveBeenCalled();
    expect(h.mockSetLocation).not.toHaveBeenCalledWith("/register");
  });
});

describe("Phone OTP verify surfaces failures instead of stranding the user", () => {
  // Drives the phone-signup flow up to the OTP screen with a Firebase
  // confirmation whose confirm() behaviour is supplied per-test, so each
  // failure branch can assert on the verify handler's behaviour.
  async function reachPhoneOtpScreen(
    user: ReturnType<typeof userEvent.setup>,
    confirm: ReturnType<typeof vi.fn>,
  ) {
    h.isConfigured.mockReturnValue(true);
    h.signInWithPhoneNumber.mockResolvedValue({ confirm });

    renderAuth();
    await user.click(screen.getByRole("button", { name: /سجّل الآن/ }));
    await user.type(
      screen.getByPlaceholderText(IDENTIFIER_PLACEHOLDER),
      "0791234567",
    );
    await user.type(
      screen.getByPlaceholderText(SIGNUP_PASSWORD_PLACEHOLDER),
      "secret1",
    );
    await user.type(
      screen.getByPlaceholderText(CONFIRM_PASSWORD_PLACEHOLDER),
      "secret1",
    );
    await user.click(screen.getByRole("button", { name: /إرسال رمز التحقق/ }));
    await screen.findByPlaceholderText(OTP_PLACEHOLDER);
  }

  it("shows an error toast and stays on the OTP screen when the code is wrong", async () => {
    const confirm = vi.fn().mockRejectedValue(new Error("Code is invalid"));

    const user = userEvent.setup();
    await reachPhoneOtpScreen(user, confirm);

    await user.type(screen.getByPlaceholderText(OTP_PLACEHOLDER), "000000");
    await user.click(screen.getByRole("button", { name: /^تأكيد$/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Code is invalid"),
    );
    // A rejected confirmation must NOT advance the user — they stay on the OTP
    // screen (the code input is still rendered) and never reach the
    // set-password screen.
    expect(screen.getByPlaceholderText(OTP_PLACEHOLDER)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /حفظ والمتابعة/ })).toBeNull();
  });

  it("does not advance when the confirmation resolves without a user", async () => {
    // Firebase can resolve confirm() without throwing yet hand back no `user`.
    // The handler must treat this as a no-op rather than silently advancing the
    // shopper to the set-password screen.
    const confirm = vi.fn().mockResolvedValue({});

    const user = userEvent.setup();
    await reachPhoneOtpScreen(user, confirm);

    await user.type(screen.getByPlaceholderText(OTP_PLACEHOLDER), "123456");
    await user.click(screen.getByRole("button", { name: /^تأكيد$/ }));

    // Give any pending navigation/advance a chance to fire, then assert none did.
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(screen.getByPlaceholderText(OTP_PLACEHOLDER)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /حفظ والمتابعة/ })).toBeNull();
    expect(h.mockSetLocation).not.toHaveBeenCalled();
  });

  it("falls back to the retryable set-password screen when the auto-save fails", async () => {
    // OTP succeeds but persisting the up-front password fails. The OTP is
    // single-use, so the user must NOT be stranded — they land on the
    // set-password screen where they can retry without re-verifying.
    h.isConfigured.mockReturnValue(true);
    h.signInWithPhoneNumber.mockResolvedValue({
      confirm: vi.fn().mockResolvedValue({ user: { uid: "fb_uid" } }),
    });
    // 1st fetch = profile upsert (ok), 2nd fetch = set-password (fails).
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 9 }) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "boom" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderAuth();

    await user.click(screen.getByRole("button", { name: /سجّل الآن/ }));
    await user.type(
      screen.getByPlaceholderText(IDENTIFIER_PLACEHOLDER),
      "0791234567",
    );
    await user.type(
      screen.getByPlaceholderText(SIGNUP_PASSWORD_PLACEHOLDER),
      "secret1",
    );
    await user.type(
      screen.getByPlaceholderText(CONFIRM_PASSWORD_PLACEHOLDER),
      "secret1",
    );
    await user.click(screen.getByRole("button", { name: /إرسال رمز التحقق/ }));

    await user.type(screen.getByPlaceholderText(OTP_PLACEHOLDER), "123456");
    await user.click(screen.getByRole("button", { name: /^تأكيد$/ }));

    // The retry screen appears and the failure is surfaced; no navigation.
    await screen.findByRole("button", { name: /حفظ والمتابعة/ });
    expect(toast.error).toHaveBeenCalledWith("boom");
    expect(h.mockSetLocation).not.toHaveBeenCalledWith("/checkout");
  });
});

describe("Register consumer honours the stashed return-to path", () => {
  it("navigates a new consumer to the stashed path after sign-up", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");
    localStorage.setItem("al_tayebat_email", "a@b.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 3 }) }),
    );

    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole("button", { name: /ابدأ التسوق الآن/ }));

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("falls back to home when no return path is stashed", async () => {
    localStorage.setItem("al_tayebat_email", "a@b.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 3 }) }),
    );

    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole("button", { name: /ابدأ التسوق الآن/ }));

    await waitFor(() => expect(h.mockSetLocation).toHaveBeenCalledWith("/"));
  });
});

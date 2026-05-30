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

import Auth from "../auth";
import Register from "../register";

const RETURN_KEY = "al_tayebat_return_to";

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
    h.attemptFirstFactor.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_email",
    });

    const user = userEvent.setup();
    renderAuth();

    await user.click(
      screen.getByRole("button", {
        name: /تسجيل الدخول بالبريد الإلكتروني/,
      }),
    );
    await user.type(
      screen.getByPlaceholderText("البريد الإلكتروني"),
      "a@b.com",
    );
    await user.type(screen.getByPlaceholderText("كلمة المرور"), "password123");
    await user.click(screen.getByRole("button", { name: /^تسجيل الدخول$/ }));

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

    await user.click(
      screen.getByRole("button", { name: /تسجيل الدخول برقم الهاتف/ }),
    );
    await user.type(screen.getByPlaceholderText("07XXXXXXXX"), "0791234567");
    await user.type(
      screen.getByPlaceholderText(/كلمة المرور \(لمن لديه حساب\)/),
      "secret1",
    );
    await user.click(
      screen.getByRole("button", { name: /تسجيل الدخول بكلمة المرور/ }),
    );

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("phone set-password (new account) navigates to the stashed path", async () => {
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

    // Landing → phone screen → request an OTP for a brand-new account.
    await user.click(
      screen.getByRole("button", { name: /تسجيل الدخول برقم الهاتف/ }),
    );
    await user.type(screen.getByPlaceholderText("07XXXXXXXX"), "0791234567");
    await user.click(
      screen.getByRole("button", { name: /إنشاء حساب جديد — إرسال الرمز/ }),
    );

    // OTP screen: confirm the code → lands on the set-password screen.
    await user.type(screen.getByPlaceholderText("_ _ _ _ _ _"), "123456");
    await user.click(screen.getByRole("button", { name: /تأكيد/ }));

    await screen.findByRole("button", { name: /حفظ والمتابعة/ });
    await user.type(
      screen.getByPlaceholderText(/كلمة المرور \(6 أحرف على الأقل\)/),
      "secret1",
    );
    await user.type(
      screen.getByPlaceholderText("تأكيد كلمة المرور"),
      "secret1",
    );
    await user.click(screen.getByRole("button", { name: /حفظ والمتابعة/ }));

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
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

    await user.click(
      screen.getByRole("button", {
        name: /تسجيل الدخول بالبريد الإلكتروني/,
      }),
    );
    await user.type(
      screen.getByPlaceholderText("البريد الإلكتروني"),
      "a@b.com",
    );
    await user.click(screen.getByRole("button", { name: /نسيت كلمة المرور؟/ }));

    await user.type(screen.getByPlaceholderText("_ _ _ _ _ _"), "123456");
    await user.click(screen.getByRole("button", { name: /تأكيد/ }));

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("choosing 'browse as guest' discards the stashed return path", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");

    const user = userEvent.setup();
    renderAuth();

    await user.click(
      screen.getByRole("button", { name: /تخطّى — تصفح كضيف/ }),
    );

    await waitFor(() => expect(h.mockSetLocation).toHaveBeenCalledWith("/"));
    expect(h.mockSetLocation).not.toHaveBeenCalledWith("/checkout");
    // The stale pay-later redirect is forgotten so a later sign-in won't
    // unexpectedly bounce the user to checkout.
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("falls back to home when no return path is stashed", async () => {
    h.attemptFirstFactor.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_home",
    });

    const user = userEvent.setup();
    renderAuth();

    await user.click(
      screen.getByRole("button", {
        name: /تسجيل الدخول بالبريد الإلكتروني/,
      }),
    );
    await user.type(
      screen.getByPlaceholderText("البريد الإلكتروني"),
      "a@b.com",
    );
    await user.type(screen.getByPlaceholderText("كلمة المرور"), "password123");
    await user.click(screen.getByRole("button", { name: /^تسجيل الدخول$/ }));

    await waitFor(() => expect(h.mockSetLocation).toHaveBeenCalledWith("/"));
  });

  it("consumes the stored path so a later unrelated sign-in goes home", async () => {
    localStorage.setItem(RETURN_KEY, "/checkout");
    h.attemptFirstFactor.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_1",
    });

    const user = userEvent.setup();
    const first = renderAuth();

    await user.click(
      screen.getByRole("button", {
        name: /تسجيل الدخول بالبريد الإلكتروني/,
      }),
    );
    await user.type(
      screen.getByPlaceholderText("البريد الإلكتروني"),
      "a@b.com",
    );
    await user.type(screen.getByPlaceholderText("كلمة المرور"), "password123");
    await user.click(screen.getByRole("button", { name: /^تسجيل الدخول$/ }));

    await waitFor(() =>
      expect(h.mockSetLocation).toHaveBeenCalledWith("/checkout"),
    );
    expect(localStorage.getItem(RETURN_KEY)).toBeNull();
    first.unmount();
    h.mockSetLocation.mockReset();

    // A second, unrelated sign-in (no return path stashed) must land home.
    renderAuth();
    await user.click(
      screen.getByRole("button", {
        name: /تسجيل الدخول بالبريد الإلكتروني/,
      }),
    );
    await user.type(
      screen.getByPlaceholderText("البريد الإلكتروني"),
      "a@b.com",
    );
    await user.type(screen.getByPlaceholderText("كلمة المرور"), "password123");
    await user.click(screen.getByRole("button", { name: /^تسجيل الدخول$/ }));

    await waitFor(() => expect(h.mockSetLocation).toHaveBeenCalledWith("/"));
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

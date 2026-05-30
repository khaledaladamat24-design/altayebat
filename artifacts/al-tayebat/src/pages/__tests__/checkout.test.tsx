import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/language";

const mockUseGetCart = vi.fn();
const mockMutate = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetCart: (...args: unknown[]) => mockUseGetCart(...args),
  useCreateOrder: () => ({ mutate: mockMutate, isSuccess: false }),
  getGetCartQueryKey: () => ["cart"],
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => "session_test",
}));

// MapPicker pulls in leaflet/CSS which is irrelevant to payment selection.
vi.mock("@/components/map-picker", () => ({
  MapPicker: () => null,
}));

// Capture navigation so we can assert the guest redirect to /auth. Link just
// needs to render its children (the back button).
const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/checkout", mockSetLocation],
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import Checkout from "../checkout";

function cartWithItems() {
  return {
    items: [
      {
        id: 1,
        productId: 42,
        quantity: 1,
        productName: "Keto Bread",
        productNameAr: "خبز كيتو",
        totalPrice: 10,
      },
    ],
    subtotal: 10,
    deliveryFee: 1.5,
    total: 11.5,
  };
}

function renderCheckout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <Checkout />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("Checkout payment-method selection", () => {
  beforeEach(() => {
    mockUseGetCart.mockReset();
    mockMutate.mockReset();
    localStorage.clear();
    // jsdom does not implement scrollIntoView; checkout calls it when a CliQ/
    // e-wallet order is submitted without a receipt.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables CliQ and E-Wallet when the vendor has not set payment info", async () => {
    // Non-cash methods are gated behind sign-in: a guest tapping them is sent to
    // signup instead of being blocked, so the disabled state only applies to a
    // signed-in user. Sign in here so we exercise the vendor-payment gating.
    localStorage.setItem("al_tayebat_user_id", "user_99");
    // All vendor/product lookups fail → defaults keep CliQ/E-Wallet disabled.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    renderCheckout();

    const cod = screen.getByRole("button", { name: /الدفع عند الاستلام/ });
    const cliq = screen.getByRole("button", { name: /تحويل كليك/ });
    const ewallet = screen.getByRole("button", { name: /محفظة إلكترونية/ });

    expect(cod).toBeEnabled();
    expect(cliq).toBeDisabled();
    expect(ewallet).toBeDisabled();
  });

  it("enables CliQ once the vendor exposes a CliQ alias and reveals the receipt-upload prompt on selection", async () => {
    // CliQ can only be *selected* by a signed-in user; a guest tap is redirected
    // to signup, so sign in to reach the receipt-upload prompt.
    localStorage.setItem("al_tayebat_user_id", "user_99");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ vendorId: 7 }),
          });
        }
        if (url.includes("/api/vendors/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              storeNameAr: "متجر",
              cliqAlias: "altayebat",
              walletNumber: null,
            }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    const user = userEvent.setup();
    renderCheckout();

    const cliq = screen.getByRole("button", { name: /تحويل كليك/ });
    await waitFor(() => expect(cliq).toBeEnabled());

    await user.click(cliq);

    // Selecting CliQ surfaces the transfer + upload instructions.
    expect(await screen.findByText(/ارفع إيصال الدفع/)).toBeInTheDocument();
  });

  it("submits a Cash-on-Delivery order with the delivery details and session id", async () => {
    // No vendor payment info → only COD is available (and selected by default).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    const user = userEvent.setup();
    renderCheckout();

    await user.type(screen.getByLabelText("الاسم الكامل"), "أحمد محمد");
    await user.type(screen.getByLabelText("رقم الهاتف"), "0791234567");
    await user.type(
      screen.getByLabelText("عنوان التوصيل"),
      "عمان، الدوار الخامس، شارع المدينة المنورة، مبنى 12",
    );

    await user.click(screen.getByRole("button", { name: /تأكيد الطلب/ }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    // The final confirmation dialog must have been acknowledged.
    expect(window.confirm).toHaveBeenCalled();

    const payload = mockMutate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(payload.data).toMatchObject({
      sessionId: "session_test",
      paymentMethod: "cod",
      customerName: "أحمد محمد",
      customerPhone: "0791234567",
      deliveryAddress: "عمان، الدوار الخامس، شارع المدينة المنورة، مبنى 12",
    });
    // COD never attaches a receipt screenshot.
    expect(payload.data.paymentScreenshotUrl).toBeUndefined();
  });

  it("blocks a CliQ order until a payment receipt screenshot is attached", async () => {
    // CliQ is only selectable once signed in; otherwise the tap redirects to
    // signup and the submit button never becomes the CliQ "pay" button.
    localStorage.setItem("al_tayebat_user_id", "user_99");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ vendorId: 7 }),
          });
        }
        if (url.includes("/api/vendors/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              storeNameAr: "متجر",
              cliqAlias: "altayebat",
              walletNumber: null,
            }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }),
    );
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    const user = userEvent.setup();
    renderCheckout();

    await user.type(screen.getByLabelText("الاسم الكامل"), "أحمد محمد");
    await user.type(screen.getByLabelText("رقم الهاتف"), "0791234567");
    await user.type(
      screen.getByLabelText("عنوان التوصيل"),
      "عمان، الدوار الخامس، شارع المدينة المنورة، مبنى 12",
    );

    const cliq = screen.getByRole("button", { name: /تحويل كليك/ });
    await waitFor(() => expect(cliq).toBeEnabled());
    await user.click(cliq);

    // Submitting without a receipt must NOT create an order.
    await user.click(screen.getByRole("button", { name: /ادفع عبر كليك/ }));
    await waitFor(() => expect(window.confirm).not.toHaveBeenCalled());
    expect(mockMutate).not.toHaveBeenCalled();

    // Attach the payment receipt screenshot.
    const file = new File(["receipt-bytes"], "receipt.png", {
      type: "image/png",
    });
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(fileInput, file);
    await waitFor(() =>
      expect(screen.getByText(/تم رفع الإيصال/)).toBeInTheDocument(),
    );

    // Now the order goes through with the receipt attached.
    await user.click(screen.getByRole("button", { name: /ادفع عبر كليك/ }));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    const payload = mockMutate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(payload.data).toMatchObject({
      sessionId: "session_test",
      paymentMethod: "cliq",
    });
    expect(typeof payload.data.paymentScreenshotUrl).toBe("string");
    expect(payload.data.paymentScreenshotUrl as string).toMatch(/^data:/);
  });

  it("submits a wallet-balance order without a separate /pay deduction call", async () => {
    // Signed-in user with a funded internal wallet. The balance is now charged
    // on the server inside the order-create transaction, so the client must NOT
    // make a separate /api/wallet/:userId/pay request (which could be lost to a
    // dropped connection and leave the order placed-but-uncharged).
    localStorage.setItem("al_tayebat_user_id", "user_99");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/wallet/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ balance: 50 }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });
    mockMutate.mockImplementation(
      (
        _payload: unknown,
        opts?: { onSuccess?: (o: { id: number }) => void },
      ) => {
        opts?.onSuccess?.({ id: 555 });
      },
    );

    const user = userEvent.setup();
    renderCheckout();

    await user.type(screen.getByLabelText("الاسم الكامل"), "أحمد محمد");
    await user.type(screen.getByLabelText("رقم الهاتف"), "0791234567");
    await user.type(
      screen.getByLabelText("عنوان التوصيل"),
      "عمان، الدوار الخامس، شارع المدينة المنورة، مبنى 12",
    );

    // Wallet balance (50) >= total (11.5) → the option becomes selectable.
    const balanceBtn = screen.getByRole("button", {
      name: /الدفع من رصيد محفظتي/,
    });
    await waitFor(() => expect(balanceBtn).toBeEnabled());
    await user.click(balanceBtn);

    await user.click(screen.getByRole("button", { name: /من رصيدي/ }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    const payload = mockMutate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(payload.data).toMatchObject({
      sessionId: "session_test",
      paymentMethod: "balance",
    });
    // Wallet payments never piggy-back a transfer receipt.
    expect(payload.data.paymentScreenshotUrl).toBeUndefined();

    // No client-side /pay deduction is made — the server charges the wallet
    // atomically with order creation.
    const payCall = fetchMock.mock.calls.find(
      ([u]: [string]) => typeof u === "string" && u.includes("/pay"),
    );
    expect(payCall).toBeUndefined();
  });

  it("disables the wallet-balance option when the balance is below the total", async () => {
    localStorage.setItem("al_tayebat_user_id", "user_99");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/wallet/")) {
          // Balance (5) < total (11.5).
          return Promise.resolve({
            ok: true,
            json: async () => ({ balance: 5 }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    renderCheckout();

    const balanceBtn = screen.getByRole("button", {
      name: /الدفع من رصيد محفظتي/,
    });
    // Once the (insufficient) balance has loaded, the option stays disabled so
    // an underfunded wallet can never be selected to pay.
    await waitFor(() => expect(screen.getByText(/5\.00/)).toBeInTheDocument());
    expect(balanceBtn).toBeDisabled();
  });

  it("shows a loading state instead of the form while the cart is loading", () => {
    mockUseGetCart.mockReturnValue({ data: undefined, isLoading: true });
    vi.stubGlobal("fetch", vi.fn());

    renderCheckout();

    expect(screen.getByText("جاري التحميل...")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /الدفع عند الاستلام/ }),
    ).not.toBeInTheDocument();
  });
});

describe("Checkout guest sign-up gate for non-cash payment", () => {
  beforeEach(() => {
    mockUseGetCart.mockReset();
    mockMutate.mockReset();
    mockSetLocation.mockReset();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    // No vendor/wallet info needed: non-cash options are tappable for guests
    // regardless (tapping them routes to sign-up), so all lookups can fail.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A guest has no auth markers in localStorage. Each non-cash method must send
  // them to /auth (sign up) instead of being selected, stashing the chosen
  // method + a return-to-/checkout path so they finish the order after signup.
  it.each([
    ["CliQ", /تحويل كليك/, "cliq"],
    ["E-Wallet", /محفظة إلكترونية/, "wallet"],
    ["wallet balance", /الدفع من رصيد محفظتي/, "balance"],
  ] as const)(
    "redirects a guest to sign up when they tap %s",
    async (_label, buttonName, expectedMethod) => {
      const user = userEvent.setup();
      renderCheckout();

      await user.click(screen.getByRole("button", { name: buttonName }));

      // Sent to the auth flow rather than selecting the method.
      expect(mockSetLocation).toHaveBeenCalledWith("/auth");
      // The chosen method is remembered for after signup...
      expect(localStorage.getItem("al_tayebat_pending_payment")).toBe(
        expectedMethod,
      );
      // ...and they will be returned to checkout to finish the order.
      expect(localStorage.getItem("al_tayebat_return_to")).toBe("/checkout");
      // No order is created from the guest tap.
      expect(mockMutate).not.toHaveBeenCalled();
    },
  );

  it("keeps Cash-on-Delivery selectable for guests without redirecting", async () => {
    const user = userEvent.setup();
    renderCheckout();

    await user.click(
      screen.getByRole("button", { name: /الدفع عند الاستلام/ }),
    );

    expect(mockSetLocation).not.toHaveBeenCalled();
    expect(localStorage.getItem("al_tayebat_pending_payment")).toBeNull();
  });

  it("stashes the half-filled delivery form so it is restored after signup", async () => {
    const user = userEvent.setup();
    renderCheckout();

    await user.type(screen.getByLabelText("الاسم الكامل"), "أحمد محمد");
    await user.type(screen.getByLabelText("رقم الهاتف"), "0791234567");
    await user.type(
      screen.getByLabelText("عنوان التوصيل"),
      "عمان، الدوار الخامس، شارع المدينة المنورة، مبنى 12",
    );

    await user.click(screen.getByRole("button", { name: /تحويل كليك/ }));

    expect(mockSetLocation).toHaveBeenCalledWith("/auth");
    expect(localStorage.getItem("al_tayebat_name")).toBe("أحمد محمد");
    expect(localStorage.getItem("al_tayebat_phone")).toBe("0791234567");
    expect(localStorage.getItem("al_tayebat_address")).toBe(
      "عمان، الدوار الخامس، شارع المدينة المنورة، مبنى 12",
    );
  });

  it("pre-selects the stashed method when a signed-in user returns to checkout", async () => {
    // Simulate the post-signup return: pending method stashed + user now signed
    // in, with the vendor exposing a CliQ alias so the method stays valid.
    localStorage.setItem("al_tayebat_pending_payment", "cliq");
    localStorage.setItem("al_tayebat_user_id", "user_99");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ vendorId: 7 }),
          });
        }
        if (url.includes("/api/vendors/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              storeNameAr: "متجر",
              cliqAlias: "altayebat",
              walletNumber: null,
            }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }),
    );

    renderCheckout();

    // CliQ being pre-selected surfaces its transfer + receipt-upload prompt
    // without the user having to click anything.
    expect(await screen.findByText(/ارفع إيصال الدفع/)).toBeInTheDocument();
    // The pending marker is consumed (cleared) once applied.
    expect(localStorage.getItem("al_tayebat_pending_payment")).toBeNull();
  });
});

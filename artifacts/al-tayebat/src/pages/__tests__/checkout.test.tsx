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
    vi.stubGlobal("confirm", vi.fn(() => true));
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
    vi.stubGlobal("confirm", vi.fn(() => true));
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

  it("charges the exact order total to the wallet via /pay on a wallet-balance order", async () => {
    // Signed-in user with a funded internal wallet.
    localStorage.setItem("al_tayebat_user_id", "user_99");
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      // The /pay deduction endpoint must be checked before the generic
      // /api/wallet/:userId balance lookup (both share the same prefix).
      if (url.includes("/api/wallet/") && url.includes("/pay")) {
        return Promise.resolve({ ok: true, json: async () => ({ balance: 38.5 }) });
      }
      if (url.includes("/api/wallet/")) {
        return Promise.resolve({ ok: true, json: async () => ({ balance: 50 }) });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });
    // Drive the success callback so the post-order /pay deduction fires.
    mockMutate.mockImplementation(
      (_payload: unknown, opts?: { onSuccess?: (o: { id: number }) => void }) => {
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

    // The wallet must be charged the exact total (subtotal 10 + delivery 1.5),
    // against the signed-in user, tagged with the freshly created order id.
    await waitFor(() => {
      const payCall = fetchMock.mock.calls.find(
        ([u]: [string]) => typeof u === "string" && u.includes("/pay"),
      );
      expect(payCall).toBeTruthy();
    });
    const payCall = fetchMock.mock.calls.find(([u]: [string]) =>
      u.includes("/pay"),
    ) as [string, RequestInit];
    expect(payCall[0]).toContain("/api/wallet/user_99/pay");
    expect(payCall[1].method).toBe("POST");
    const body = JSON.parse(payCall[1].body as string);
    expect(body).toMatchObject({ amount: 11.5, orderId: 555 });
  });

  it("disables the wallet-balance option when the balance is below the total", async () => {
    localStorage.setItem("al_tayebat_user_id", "user_99");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/wallet/")) {
          // Balance (5) < total (11.5).
          return Promise.resolve({ ok: true, json: async () => ({ balance: 5 }) });
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
    await waitFor(() =>
      expect(screen.getByText(/5\.00/)).toBeInTheDocument(),
    );
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

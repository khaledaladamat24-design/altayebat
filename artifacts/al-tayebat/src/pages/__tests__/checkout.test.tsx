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

// Capture navigation so we can assert no unexpected redirect happens. Link just
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

// Build a fetch mock where the cart's vendor exposes the given payment details.
function vendorFetch(vendor: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/products/")) {
      return Promise.resolve({ ok: true, json: async () => ({ vendorId: 7 }) });
    }
    if (url.includes("/api/vendors/")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ storeNameAr: "متجر", ...vendor }),
      });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
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
    mockSetLocation.mockReset();
    localStorage.clear();
    // jsdom does not implement scrollIntoView; checkout calls it when a manual
    // payment order is submitted without a receipt.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables CliQ, IBAN and E-Wallet when the vendor has not set payment info", async () => {
    // All vendor/product lookups fail → defaults keep manual methods disabled.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    renderCheckout();

    const cod = screen.getByRole("button", { name: /الدفع عند الاستلام/ });
    const cliq = screen.getByRole("button", { name: /تحويل كليك/ });
    const iban = screen.getByRole("button", { name: /تحويل بنكي/ });
    const ewallet = screen.getByRole("button", { name: /محفظة إلكترونية/ });

    expect(cod).toBeEnabled();
    expect(cliq).toBeDisabled();
    expect(iban).toBeDisabled();
    expect(ewallet).toBeDisabled();
  });

  it("enables CliQ once the vendor exposes a CliQ alias and reveals the receipt-upload prompt and educational banner on selection", async () => {
    vi.stubGlobal("fetch", vendorFetch({ cliqAlias: "altayebat" }));
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    const user = userEvent.setup();
    renderCheckout();

    const cliq = screen.getByRole("button", { name: /تحويل كليك/ });
    await waitFor(() => expect(cliq).toBeEnabled());

    await user.click(cliq);

    // Selecting CliQ surfaces the transfer + upload instructions and the manual
    // payment educational banner.
    expect(await screen.findByText(/ارفع إيصال الدفع/)).toBeInTheDocument();
    expect(screen.getByText(/الدفع يتم يدوياً/)).toBeInTheDocument();
  });

  it("enables IBAN once the vendor exposes a bank account", async () => {
    vi.stubGlobal(
      "fetch",
      vendorFetch({ bankAccount: "JO94CBJO0010000000000131000302" }),
    );
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    const user = userEvent.setup();
    renderCheckout();

    const iban = screen.getByRole("button", { name: /تحويل بنكي/ });
    await waitFor(() => expect(iban).toBeEnabled());

    await user.click(iban);

    expect(
      await screen.findByText(/بيانات التحويل البنكي/),
    ).toBeInTheDocument();
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
    vi.stubGlobal("fetch", vendorFetch({ cliqAlias: "altayebat" }));
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

  it("submits an IBAN order with the attached receipt", async () => {
    vi.stubGlobal(
      "fetch",
      vendorFetch({ bankAccount: "JO94CBJO0010000000000131000302" }),
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

    const iban = screen.getByRole("button", { name: /تحويل بنكي/ });
    await waitFor(() => expect(iban).toBeEnabled());
    await user.click(iban);

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

    await user.click(
      screen.getByRole("button", { name: /ادفع عبر التحويل البنكي/ }),
    );
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    const payload = mockMutate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(payload.data).toMatchObject({
      sessionId: "session_test",
      paymentMethod: "iban",
    });
    expect(payload.data.paymentScreenshotUrl as string).toMatch(/^data:/);
  });

  it("lets a guest select CliQ without redirecting when the vendor exposes an alias", async () => {
    vi.stubGlobal("fetch", vendorFetch({ cliqAlias: "altayebat" }));
    mockUseGetCart.mockReturnValue({ data: cartWithItems(), isLoading: false });

    const user = userEvent.setup();
    renderCheckout();

    const cliq = screen.getByRole("button", { name: /تحويل كليك/ });
    await waitFor(() => expect(cliq).toBeEnabled());
    await user.click(cliq);

    // No redirect to sign-up; the transfer + receipt-upload prompt appears.
    expect(mockSetLocation).not.toHaveBeenCalled();
    expect(await screen.findByText(/ارفع إيصال الدفع/)).toBeInTheDocument();
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

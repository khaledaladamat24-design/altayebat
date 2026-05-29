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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/language";

const mockUseGetOrder = vi.fn();
const mockUseListOrders = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetOrder: (...args: unknown[]) => mockUseGetOrder(...args),
  getGetOrderQueryKey: (id: number) => ["order", id],
  useListOrders: (...args: unknown[]) => mockUseListOrders(...args),
  getListOrdersQueryKey: (params: unknown) => ["orders", params],
  // The delivered-order view renders a per-item star rating; default to
  // not-eligible so existing tracking tests stay focused on status.
  useGetMyProductRating: () => ({ data: { canRate: false, myStars: null } }),
  getGetMyProductRatingQueryKey: (id: number) => ["product-rating-me", id],
  useRateProduct: () => ({ mutate: vi.fn(), isPending: false }),
  getGetProductQueryKey: (id: number) => ["product", id],
}));

// The order-detail page reads the id from the route; the orders list + both
// pages render <Link>. Stub wouter so we control params and avoid a Router.
let mockParams: Record<string, string> = { id: "123" };
vi.mock("wouter", () => ({
  useParams: () => mockParams,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Guests are identified purely by their localStorage session id.
vi.mock("@/hooks/use-session", () => ({
  useSession: () => "session_guest",
}));

import OrderDetail from "../order-detail";
import Orders from "../orders";

type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    sessionId: "session_guest",
    status: "pending" as OrderStatus,
    subtotal: 18,
    deliveryFee: 0,
    total: 18,
    deliveryAddress: "عمان، شارع المدينة المنورة، مبنى 12",
    customerName: "أحمد محمد",
    customerPhone: "0791234567",
    notes: "اتصل قبل الوصول",
    createdAt: "2026-05-20T10:30:00.000Z",
    estimatedDelivery: "30-45 دقيقة",
    items: [
      {
        id: 1,
        productId: 42,
        productName: "Keto Bread",
        productNameAr: "خبز كيتو",
        quantity: 2,
        unitPrice: 9,
        totalPrice: 18,
      },
    ],
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>{ui}</LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("OrderDetail (order tracking page)", () => {
  beforeEach(() => {
    mockUseGetOrder.mockReset();
    mockParams = { id: "123" };
  });

  it("shows a loading skeleton while the order is still loading", () => {
    mockUseGetOrder.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderWithProviders(<OrderDetail />);
    // No order header yet, just skeletons.
    expect(screen.queryByText(/طلب #/)).not.toBeInTheDocument();
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBe(
      3,
    );
  });

  // The progress bar fill width encodes the current status step
  // (index / (steps-1) * 100). This is the single assertion that proves the
  // *correct* status is reflected, since every step label is always rendered.
  it.each([
    ["pending", "0%"],
    ["preparing", "25%"],
    ["ready", "50%"],
    ["out_for_delivery", "75%"],
    ["delivered", "100%"],
  ] as const)(
    "reflects the %s status on the progress tracker",
    (status, expectedWidth) => {
      mockUseGetOrder.mockReturnValue({
        data: makeOrder({ status }),
        isLoading: false,
      });

      const { container } = renderWithProviders(<OrderDetail />);

      // The order identity is always shown (heading "طلب #123"). Match the
      // "طلب #" prefix so it isn't ambiguous with other UI copy containing
      // the word الطلب (e.g. the customer "received" confirmation button).
      expect(screen.getByText(/طلب #/)).toBeInTheDocument();
      expect(screen.getByText(/#123/)).toBeInTheDocument();

      // All step labels render; the fill width is what proves the active step.
      expect(screen.getByText("قيد الانتظار")).toBeInTheDocument();
      expect(screen.getByText("تم التوصيل")).toBeInTheDocument();

      const fill = container.querySelector(
        ".transition-all.duration-500",
      ) as HTMLElement;
      expect(fill).toBeTruthy();
      expect(fill.style.width).toBe(expectedWidth);
    },
  );

  it("shows the cancellation notice and hides the progress tracker for a cancelled order", () => {
    mockUseGetOrder.mockReturnValue({
      data: makeOrder({ status: "cancelled" }),
      isLoading: false,
    });

    const { container } = renderWithProviders(<OrderDetail />);

    expect(screen.getByText("تم إلغاء هذا الطلب")).toBeInTheDocument();
    // The progress fill bar must not be rendered for cancelled orders.
    expect(container.querySelector(".transition-all.duration-500")).toBeNull();
  });

  it("renders the full order details (items, totals, delivery info)", () => {
    mockUseGetOrder.mockReturnValue({
      data: makeOrder({ deliveryFee: 1.5, total: 19.5 }),
      isLoading: false,
    });

    renderWithProviders(<OrderDetail />);

    // Item line.
    expect(screen.getByText("خبز كيتو")).toBeInTheDocument();
    expect(screen.getByText("2x")).toBeInTheDocument();

    // Payment breakdown (18.000 appears for both the item line and subtotal).
    expect(screen.getAllByText("18.000 د.أ").length).toBeGreaterThan(0); // subtotal/item
    expect(screen.getByText("1.500 د.أ")).toBeInTheDocument(); // delivery fee
    expect(screen.getAllByText("19.500 د.أ").length).toBeGreaterThan(0); // total

    // Delivery details.
    expect(screen.getByText("أحمد محمد")).toBeInTheDocument();
    expect(screen.getByText("0791234567")).toBeInTheDocument();
    expect(
      screen.getByText("عمان، شارع المدينة المنورة، مبنى 12"),
    ).toBeInTheDocument();
    expect(screen.getByText("اتصل قبل الوصول")).toBeInTheDocument();
  });

  it("shows 'free' delivery when the delivery fee is zero", () => {
    mockUseGetOrder.mockReturnValue({
      data: makeOrder({ deliveryFee: 0, total: 18 }),
      isLoading: false,
    });

    renderWithProviders(<OrderDetail />);
    expect(screen.getByText("مجاني")).toBeInTheDocument();
  });
});

describe("Orders list (guest tracking via sessionId)", () => {
  beforeEach(() => {
    mockUseListOrders.mockReset();
  });

  it("requests the guest's orders scoped to their session id", () => {
    mockUseListOrders.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<Orders />);

    // The first arg is the params object the page passes to the hook.
    expect(mockUseListOrders).toHaveBeenCalled();
    const firstArg = mockUseListOrders.mock.calls[0][0] as {
      sessionId: string;
    };
    expect(firstArg.sessionId).toBe("session_guest");
  });

  it("lists the guest's orders with their status and total", () => {
    mockUseListOrders.mockReturnValue({
      data: [
        makeOrder({ id: 101, status: "preparing", total: 18 }),
        makeOrder({ id: 102, status: "delivered", total: 25 }),
      ],
      isLoading: false,
    });

    renderWithProviders(<Orders />);

    expect(screen.getByText(/#101/)).toBeInTheDocument();
    expect(screen.getByText(/#102/)).toBeInTheDocument();
    expect(screen.getByText("قيد التحضير")).toBeInTheDocument();
    expect(screen.getByText("تم التوصيل")).toBeInTheDocument();
    expect(screen.getByText("18.000 د.أ")).toBeInTheDocument();
    expect(screen.getByText("25.000 د.أ")).toBeInTheDocument();
  });

  it("shows an empty state when the guest has no orders", () => {
    mockUseListOrders.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<Orders />);

    expect(screen.getByText("لا توجد طلبات")).toBeInTheDocument();
  });
});

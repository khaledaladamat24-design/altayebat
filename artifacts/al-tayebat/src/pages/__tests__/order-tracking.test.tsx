import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/language";

const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args) },
}));

const mockUseGetOrder = vi.fn();
const mockUseGetOrderTracking = vi.fn();
const mockUseListOrders = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetOrder: (...args: unknown[]) => mockUseGetOrder(...args),
  getGetOrderQueryKey: (id: number) => ["order", id],
  useGetOrderTracking: (...args: unknown[]) => mockUseGetOrderTracking(...args),
  getGetOrderTrackingQueryKey: (id: number) => ["order-tracking", id],
  useListOrders: (...args: unknown[]) => mockUseListOrders(...args),
  getListOrdersQueryKey: (params: unknown) => ["orders", params],
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
  | "confirmed"
  | "preparing"
  | "on_the_way"
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
    mockUseGetOrderTracking.mockReset();
    // Tracking comes from its own hook; default to "not shipped yet" (no data).
    mockUseGetOrderTracking.mockReturnValue({ data: undefined });
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
    ["preparing", "50%"],
    ["on_the_way", "75%"],
    ["delivered", "100%"],
  ] as const)(
    "reflects the %s status on the progress tracker",
    (status, expectedWidth) => {
      mockUseGetOrder.mockReturnValue({
        data: makeOrder({ status }),
        isLoading: false,
      });

      const { container } = renderWithProviders(<OrderDetail />);

      // The order identity is always shown.
      expect(screen.getByText(/طلب/)).toBeInTheDocument();
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

describe("OrderDetail shipping section (live tracking after shipping)", () => {
  // The shipping section is fed by the generated useGetOrderTracking hook.
  // Drive it directly with a tracking payload (or null = not shipped yet).
  function stubTrackEndpoint(payload: Record<string, unknown> | null) {
    mockUseGetOrderTracking.mockReturnValue({ data: payload ?? undefined });
  }

  beforeEach(() => {
    mockUseGetOrder.mockReset();
    mockUseGetOrderTracking.mockReset();
    mockToastSuccess.mockReset();
    mockParams = { id: "123" };
    mockUseGetOrder.mockReturnValue({
      data: makeOrder({ status: "on_the_way" }),
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the shipping section with tracking number, carrier name, and shipment status", async () => {
    stubTrackEndpoint({
      trackingNumber: "AWB123456789",
      providerName: "Aramex",
      status: "In transit",
      statusAr: "قيد الشحن",
      awbUrl: "https://track.example.com/AWB123456789",
      providerPhone: "0791112233",
      notConfigured: false,
    });

    renderWithProviders(<OrderDetail />);

    // The shipping section header appears only once tracking data arrives.
    expect(await screen.findByText("الشحن")).toBeInTheDocument();
    // Carrier name.
    expect(screen.getByText("Aramex")).toBeInTheDocument();
    // Tracking number.
    expect(screen.getByText("AWB123456789")).toBeInTheDocument();
    // Shipment status (Arabic is the default language).
    expect(screen.getByText("قيد الشحن")).toBeInTheDocument();
    // AWB link + carrier phone.
    expect(screen.getByRole("link", { name: /بوليصة الشحن/ })).toHaveAttribute(
      "href",
      "https://track.example.com/AWB123456789",
    );
    expect(screen.getByText("0791112233")).toBeInTheDocument();
    // The manual-tracking notice is hidden when the carrier API is integrated.
    expect(
      screen.queryByText(/هذه الشركة لم يتم ربط API/),
    ).not.toBeInTheDocument();
  });

  it("copies the tracking number to the clipboard and shows a success toast", async () => {
    stubTrackEndpoint({
      trackingNumber: "AWB987654321",
      providerName: "SMSA",
      statusAr: "تم الشحن",
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    renderWithProviders(<OrderDetail />);

    const copyButton = await screen.findByRole("button", { name: "نسخ" });
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("AWB987654321");
    expect(mockToastSuccess).toHaveBeenCalledWith("تم نسخ رقم التتبع");
  });

  it("shows the manual-tracking notice when the carrier API is not configured", async () => {
    stubTrackEndpoint({
      trackingNumber: "MANUAL-001",
      providerName: "Local Courier",
      notConfigured: true,
    });

    renderWithProviders(<OrderDetail />);

    expect(
      await screen.findByText(/هذه الشركة لم يتم ربط API الخاص بها بعد/),
    ).toBeInTheDocument();
  });

  it("does not render the shipping section when there is no tracking number", async () => {
    stubTrackEndpoint({ trackingNumber: null, notConfigured: false });

    renderWithProviders(<OrderDetail />);

    // Give the effect a chance to resolve, then assert the section is absent.
    await waitFor(() => expect(mockUseGetOrder).toHaveBeenCalled());
    expect(screen.queryByText("الشحن")).not.toBeInTheDocument();
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/language";

const mockUseListProducts = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useListProducts: (...args: unknown[]) => mockUseListProducts(...args),
  // ProductCard (rendered when products exist) pulls these in transitively.
  useAddToCart: () => ({ mutate: vi.fn() }),
  getGetCartQueryKey: () => ["cart"],
}));

vi.mock("wouter", async (importActual) => {
  const actual = await importActual<typeof import("wouter")>();
  return { ...actual, useParams: () => ({ zone: "healthy" }) };
});

import Offers from "../offers";

function renderOffers() {
  return render(
    <LanguageProvider>
      <Offers />
    </LanguageProvider>,
  );
}

describe("Offers page", () => {
  beforeEach(() => {
    mockUseListProducts.mockReset();
  });

  it("shows the empty-state message when there are no on-sale products", () => {
    mockUseListProducts.mockReturnValue({ data: [], isLoading: false });
    renderOffers();

    expect(screen.getByText("لا توجد عروض حالياً")).toBeInTheDocument();
    // Healthy-zone empty copy mentions healthy products.
    expect(
      screen.getByText(/سنضيف عروضاً وتخفيضات على المنتجات الصحية قريباً/),
    ).toBeInTheDocument();
  });

  it("does not show the empty-state while products are still loading", () => {
    mockUseListProducts.mockReturnValue({ data: undefined, isLoading: true });
    renderOffers();

    expect(screen.queryByText("لا توجد عروض حالياً")).not.toBeInTheDocument();
  });

  it("requests on-sale products for the route's zone", () => {
    mockUseListProducts.mockReturnValue({ data: [], isLoading: false });
    renderOffers();

    expect(mockUseListProducts).toHaveBeenCalledWith({
      foodType: "healthy",
      onSale: true,
    });
  });
});

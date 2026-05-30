import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Product } from "@workspace/api-client-react";
import { LanguageProvider } from "@/contexts/language";

const mockMutate = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useAddToCart: () => ({ mutate: mockMutate }),
  getGetCartQueryKey: (params: unknown) => ["cart", params],
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => "session_test_123",
}));

import { ProductCard } from "../product-card";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 42,
    name: "Almonds",
    nameAr: "لوز",
    price: 5,
    categoryId: 1,
    inStock: true,
    ...overrides,
  };
}

function renderCard(product: Product) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ProductCard product={product} />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("ProductCard", () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it("adds the product to the cart with quantity 1 and the session id", async () => {
    const user = userEvent.setup();
    renderCard(makeProduct({ id: 42 }));

    const addButton = screen.getByRole("button");
    await user.click(addButton);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      { data: { productId: 42, quantity: 1, sessionId: "session_test_123" } },
      expect.anything(),
    );
  });

  it("shows the sale badge when isOnSale is true even without a higher original price", () => {
    renderCard(makeProduct({ isOnSale: true }));
    expect(screen.getByText("عرض")).toBeInTheDocument();
  });

  it("shows the sale badge when originalPrice is higher than price", () => {
    renderCard(makeProduct({ isOnSale: false, price: 5, originalPrice: 8 }));
    expect(screen.getByText("عرض")).toBeInTheDocument();
  });

  it("does not show the sale badge when not on sale and no real discount", () => {
    renderCard(makeProduct({ isOnSale: false, price: 5, originalPrice: 5 }));
    expect(screen.queryByText("عرض")).not.toBeInTheDocument();
  });

  it("renders the strikethrough original price only when originalPrice > price", () => {
    const { container } = renderCard(
      makeProduct({ price: 5, originalPrice: 8 }),
    );
    expect(container.querySelector(".line-through")).not.toBeNull();
  });

  it("does not render a strikethrough when originalPrice equals price", () => {
    const { container } = renderCard(
      makeProduct({ isOnSale: true, price: 5, originalPrice: 5 }),
    );
    expect(container.querySelector(".line-through")).toBeNull();
  });

  it("does not render a strikethrough when originalPrice is below price", () => {
    const { container } = renderCard(
      makeProduct({ price: 5, originalPrice: 3 }),
    );
    expect(container.querySelector(".line-through")).toBeNull();
  });
});

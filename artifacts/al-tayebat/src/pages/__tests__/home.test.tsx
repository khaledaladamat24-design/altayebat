import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/contexts/language";

const mockUseListCategories = vi.fn();
const mockUseListFeaturedProducts = vi.fn();
const mockUseListBestsellers = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useListBanners: () => ({ data: [], isLoading: false }),
  useListCategories: (...args: unknown[]) => mockUseListCategories(...args),
  useListFeaturedProducts: (...args: unknown[]) =>
    mockUseListFeaturedProducts(...args),
  useListBestsellers: (...args: unknown[]) => mockUseListBestsellers(...args),
  // ProductCard transitive deps (no products rendered in these tests).
  useAddToCart: () => ({ mutate: vi.fn() }),
  getGetCartQueryKey: () => ["cart"],
}));

import Home from "../home";

function emptyResult() {
  return { data: [], isLoading: false };
}

function renderHome() {
  return render(
    <LanguageProvider>
      <Home />
    </LanguageProvider>,
  );
}

describe("Home zone toggle", () => {
  beforeEach(() => {
    mockUseListCategories.mockReset().mockReturnValue(emptyResult());
    mockUseListFeaturedProducts.mockReset().mockReturnValue(emptyResult());
    mockUseListBestsellers.mockReset().mockReturnValue(emptyResult());
    localStorage.clear();
  });

  it("defaults to the Healthy zone and queries hooks with foodType=healthy", () => {
    renderHome();

    const healthyBtn = screen.getByRole("button", { name: /القسم الصحي/ });
    const regularBtn = screen.getByRole("button", { name: /القسم العادي/ });
    expect(healthyBtn).toHaveAttribute("aria-pressed", "true");
    expect(regularBtn).toHaveAttribute("aria-pressed", "false");

    expect(mockUseListCategories).toHaveBeenLastCalledWith({
      foodType: "healthy",
    });
    expect(mockUseListFeaturedProducts).toHaveBeenLastCalledWith({
      foodType: "healthy",
    });
    expect(mockUseListBestsellers).toHaveBeenLastCalledWith({
      foodType: "healthy",
    });
  });

  it("switches to the Regular zone, persists it, and re-queries with foodType=regular", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: /القسم العادي/ }));

    expect(
      screen.getByRole("button", { name: /القسم العادي/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /القسم الصحي/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    expect(localStorage.getItem("al_tayebat_zone")).toBe("regular");
    expect(mockUseListCategories).toHaveBeenLastCalledWith({
      foodType: "regular",
    });
    expect(mockUseListFeaturedProducts).toHaveBeenLastCalledWith({
      foodType: "regular",
    });
    expect(mockUseListBestsellers).toHaveBeenLastCalledWith({
      foodType: "regular",
    });
  });

  it("restores the persisted zone from localStorage on mount", () => {
    localStorage.setItem("al_tayebat_zone", "regular");
    renderHome();

    expect(
      screen.getByRole("button", { name: /القسم العادي/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mockUseListCategories).toHaveBeenLastCalledWith({
      foodType: "regular",
    });
  });

  it("shows the zone empty-state with an offers link when the zone has no content", () => {
    renderHome();

    expect(
      screen.getByText("لا توجد منتجات في القسم الصحي بعد"),
    ).toBeInTheDocument();
    expect(screen.getByText("تصفّح العروض الصحية")).toBeInTheDocument();
  });
});

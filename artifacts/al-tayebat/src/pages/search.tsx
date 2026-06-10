import {
  useListProducts,
  useListCategories,
  getListProductsQueryKey,
  type ListProductsFoodType,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search as SearchIcon, ChevronRight, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { ProductCard } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/language";
import { getStoredCity, JORDAN_PROVINCES } from "@/lib/provinces";

const FOOD_TYPES = [
  { value: "healthy", ar: "صحي", en: "Healthy" },
  { value: "regular", ar: "متنوع", en: "Diverse" },
  { value: "grocery", ar: "بقالة", en: "Grocery" },
] as const;

export default function Search() {
  const { lang, dir, tr } = useLanguage();
  // Allow deep-linking ?q=... from e.g. the product-detail "vendor" chip.
  const initialQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("q") || ""
      : "";
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  // Cascading filters: main section (foodType) → category, plus city.
  const [foodType, setFoodType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [city, setCity] = useState(getStoredCity());

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: categories } = useListCategories();
  // Categories derive from the chosen main section; the cascading dropdown is
  // disabled until a section is picked.
  const categoryOptions = foodType
    ? (categories ?? []).filter((c) => c.foodType === foodType)
    : [];

  const filters = {
    search: debouncedQuery || undefined,
    foodType: (foodType || undefined) as ListProductsFoodType | undefined,
    categoryId: categoryId ? Number(categoryId) : undefined,
    city: city || undefined,
  };

  const hasAnyFilter = !!debouncedQuery || !!foodType || !!categoryId || !!city;

  const { data: products, isLoading } = useListProducts(filters, {
    query: {
      enabled: true,
      queryKey: getListProductsQueryKey(filters),
    },
  });

  const selectClass =
    "h-11 bg-muted text-foreground rounded-xl px-3 text-sm border-none outline-none flex-1 min-w-0";

  return (
    <div className="pb-8 min-h-screen bg-background" dir={dir}>
      <div className="pt-4 pb-4 px-4 sticky top-0 bg-background/80 backdrop-blur z-20 border-b border-border/50 space-y-3">
        <div className="flex items-center gap-3">
          <Link
            href="~"
            onClick={(e) => {
              e.preventDefault();
              window.history.back();
            }}
          >
            <div className="p-2 -mr-2 text-muted-foreground cursor-pointer">
              <ChevronRight className="w-6 h-6" />
            </div>
          </Link>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input
              type="search"
              placeholder={tr(
                "عن ماذا تبحث؟ (مثال: خبز كيتو)",
                "What are you looking for? (e.g. keto bread)",
              )}
              className="bg-muted text-foreground pl-4 pr-10 rounded-full border-none h-12"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Cascading filters: main section → category */}
        <div className="flex items-center gap-2">
          <select
            value={foodType}
            onChange={(e) => {
              setFoodType(e.target.value);
              setCategoryId("");
            }}
            className={selectClass}
          >
            <option value="">{tr("كل الأقسام", "All sections")}</option>
            {FOOD_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {lang === "en" ? ft.en : ft.ar}
              </option>
            ))}
          </select>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={categoryOptions.length === 0}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option value="">{tr("كل الأصناف", "All categories")}</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === "en" ? c.name || c.nameAr : c.nameAr}
              </option>
            ))}
          </select>
        </div>

        {/* City / province filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={`${selectClass} pr-9 w-full`}
            >
              <option value="">{tr("كل المحافظات", "All cities")}</option>
              {JORDAN_PROVINCES.map((p) => (
                <option key={p.ar} value={p.ar}>
                  {lang === "en" ? p.en : p.ar}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="px-4 mt-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : hasAnyFilter && products && products.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <SearchIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-bold text-lg mb-1">
              {tr("لا توجد نتائج", "No results")}
            </h3>
            <p className="text-muted-foreground text-sm">
              {tr(
                "لم نتمكن من العثور على أي منتج يطابق بحثك.",
                "We couldn't find any product matching your search.",
              )}
            </p>
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground text-sm">
            {tr(
              "اكتب اسم المنتج أو اختر قسمًا للبحث عنه.",
              "Type a product name or pick a section to search.",
            )}
          </div>
        )}
      </div>
    </div>
  );
}

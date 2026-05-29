import {
  useListProducts,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search as SearchIcon, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { ProductCard } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/language";

export default function Search() {
  const { dir, tr } = useLanguage();
  // Allow deep-linking ?q=... from e.g. the product-detail "vendor" chip.
  const initialQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("q") || ""
      : "";
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: products, isLoading } = useListProducts(
    { search: debouncedQuery || undefined },
    {
      query: {
        enabled: true,
        queryKey: getListProductsQueryKey({
          search: debouncedQuery || undefined,
        }),
      },
    },
  );

  return (
    <div className="pb-8 min-h-screen bg-background" dir={dir}>
      <div className="pt-4 pb-4 px-4 sticky top-0 bg-background/80 backdrop-blur z-20 border-b border-border/50">
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
      </div>

      <div className="px-4 mt-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : debouncedQuery && products && products.length === 0 ? (
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
              "اكتب اسم المنتج أو القسم للبحث عنه.",
              "Type a product or category name to search.",
            )}
          </div>
        )}
      </div>
    </div>
  );
}

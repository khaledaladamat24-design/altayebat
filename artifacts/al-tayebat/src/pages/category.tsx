import { useGetCategory, useListProducts, getGetCategoryQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/product-card";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language";
import { buildCategoryChips } from "@/lib/subcategories";

export default function Category() {
  const { lang, dir, tr } = useLanguage();
  const params = useParams();
  const categoryId = params.id ? parseInt(params.id, 10) : undefined;
  
  const { data: category, isLoading: loadingCat } = useGetCategory(categoryId!, {
    query: { enabled: !!categoryId, queryKey: getGetCategoryQueryKey(categoryId!) }
  });
  
  const { data: products, isLoading: loadingProducts } = useListProducts(
    { categoryId },
    { query: { enabled: !!categoryId, queryKey: getListProductsQueryKey({ categoryId }) } }
  );

  const isRegular = category?.foodType === "regular";
  // Chips depend on the zone: Regular shows the mapped sub-types, Healthy keeps
  // the Keto/Organic chips driven by the isKeto/isOrganic booleans.
  const chips = useMemo(
    () => buildCategoryChips({ isRegular, slug: category?.slug, lang }),
    [isRegular, category?.slug, lang],
  );

  const [filter, setFilter] = useState<string>("all");

  const filteredProducts = products?.filter((p) => {
    if (filter === "keto") return p.isKeto;
    if (filter === "organic") return p.isOrganic;
    if (filter === "instock") return p.inStock;
    if (filter.startsWith("sub:")) return p.subcategory === filter.slice(4);
    return true;
  });

  return (
    <div className="pb-8" dir={dir}>
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm relative z-10 flex items-center gap-4">
        <Link href="/categories">
          <div className="bg-primary-foreground/20 p-2 rounded-full cursor-pointer hover:bg-primary-foreground/30 transition">
            <ChevronRight className="w-5 h-5" />
          </div>
        </Link>
        <div className="flex-1">
          {loadingCat ? (
            <Skeleton className="h-7 w-32 bg-primary-foreground/20" />
          ) : (
            <h1 className="text-xl font-bold">
              {category ? (lang === "en" ? (category.name || category.nameAr) : category.nameAr) : ""}
            </h1>
          )}
        </div>
      </div>

      <div className="px-4 mt-6">
        <div className="flex gap-2 overflow-x-auto pb-4 snap-x hide-scrollbar mb-2">
          {chips.map((chip) => (
            <Button
              key={chip.value}
              variant={filter === chip.value ? "default" : "outline"}
              className="rounded-full snap-start whitespace-nowrap"
              onClick={() => setFilter(chip.value)}
            >
              {chip.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {loadingProducts ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl" />
            ))
          ) : filteredProducts && filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))
          ) : (
            <div className="col-span-2 py-12 text-center text-muted-foreground">
              <p>{tr("لا توجد منتجات تطابق الفلتر المحدد", "No products match the selected filter")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

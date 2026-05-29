import { useListProducts } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ChevronRight, BadgePercent } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { useLanguage } from "@/contexts/language";
import { ALL_SUBCATEGORIES } from "@/lib/subcategories";

type Zone = "healthy" | "regular";

export default function Offers() {
  const { lang, dir, tr } = useLanguage();
  const params = useParams();
  const zone: Zone = params.zone === "regular" ? "regular" : "healthy";

  const { data: products, isLoading } = useListProducts({
    foodType: zone,
    onSale: true,
  });

  const [filter, setFilter] = useState<string>("all");

  // Regular zone: only show chips for the sub-types actually present among the
  // on-sale items. Healthy zone: Keto/Organic.
  const presentSubcategories = useMemo(() => {
    if (zone !== "regular" || !products) return [];
    const present = new Set(products.map((p) => p.subcategory).filter(Boolean));
    return ALL_SUBCATEGORIES.filter((o) => present.has(o.value));
  }, [zone, products]);

  const chips: { value: string; label: string }[] =
    zone === "regular"
      ? [
          { value: "all", label: tr("الكل", "All") },
          ...presentSubcategories.map((o) => ({
            value: `sub:${o.value}`,
            label: lang === "en" ? o.en : o.ar,
          })),
          { value: "instock", label: tr("متوفر فقط", "In stock only") },
        ]
      : [
          { value: "all", label: tr("الكل", "All") },
          { value: "keto", label: tr("كيتو", "Keto") },
          { value: "organic", label: tr("عضوي", "Organic") },
          { value: "instock", label: tr("متوفر فقط", "In stock only") },
        ];

  const filteredProducts = products?.filter((p) => {
    if (filter === "keto") return p.isKeto;
    if (filter === "organic") return p.isOrganic;
    if (filter === "instock") return p.inStock;
    if (filter.startsWith("sub:")) return p.subcategory === filter.slice(4);
    return true;
  });

  const title =
    zone === "healthy"
      ? tr("عروض صحية", "Healthy Offers")
      : tr("عروض وتخفيضات", "Offers & Discounts");

  return (
    <div className="pb-8" dir={dir}>
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm relative z-10 flex items-center gap-4">
        <Link href="/">
          <div className="bg-primary-foreground/20 p-2 rounded-full cursor-pointer hover:bg-primary-foreground/30 transition">
            <ChevronRight className="w-5 h-5" />
          </div>
        </Link>
        <div className="flex-1 flex items-center gap-2">
          <BadgePercent className="w-6 h-6 text-rose-soft" />
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
      </div>

      <div className="px-4 mt-6">
        {/* Only show the chip row when there's more than the implicit All/In-stock */}
        {chips.length > 2 && (
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
        )}

        <div className="grid grid-cols-2 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl" />
            ))
          ) : filteredProducts && filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))
          ) : (
            <div className="col-span-2 flex flex-col items-center justify-center text-center py-16 gap-3">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <BadgePercent className="w-8 h-8 text-rose" />
              </div>
              <h3 className="font-bold text-base">
                {tr("لا توجد عروض حالياً", "No offers right now")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                {zone === "healthy"
                  ? tr(
                      "تابعنا — سنضيف عروضاً وتخفيضات على المنتجات الصحية قريباً.",
                      "Stay tuned — we'll add deals and discounts on healthy products soon.",
                    )
                  : tr(
                      "تابعنا — سنضيف عروضاً وتخفيضات على المنتجات قريباً.",
                      "Stay tuned — we'll add deals and discounts on our products soon.",
                    )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

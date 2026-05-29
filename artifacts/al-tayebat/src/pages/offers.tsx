import { useListProducts } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ChevronRight, BadgePercent } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/product-card";
import { useLanguage } from "@/contexts/language";

type Zone = "healthy" | "regular";

export default function Offers() {
  const { dir, tr } = useLanguage();
  const params = useParams();
  const zone: Zone = params.zone === "regular" ? "regular" : "healthy";

  const { data: products, isLoading } = useListProducts({ foodType: zone, onSale: true });

  const title = zone === "healthy"
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
        <div className="grid grid-cols-2 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl" />
            ))
          ) : products && products.length > 0 ? (
            products.map((product) => <ProductCard key={product.id} product={product} />)
          ) : (
            <div className="col-span-2 flex flex-col items-center justify-center text-center py-16 gap-3">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <BadgePercent className="w-8 h-8 text-rose" />
              </div>
              <h3 className="font-bold text-base">{tr("لا توجد عروض حالياً", "No offers right now")}</h3>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                {zone === "healthy"
                  ? tr(
                      "تابعنا — سنضيف عروضاً وتخفيضات على المنتجات الصحية قريباً.",
                      "Stay tuned — we'll add deals and discounts on healthy products soon."
                    )
                  : tr(
                      "تابعنا — سنضيف عروضاً وتخفيضات على المنتجات قريباً.",
                      "Stay tuned — we'll add deals and discounts on our products soon."
                    )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

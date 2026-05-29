import { useListProducts } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ChevronRight, BadgePercent } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/product-card";

type Zone = "healthy" | "regular";

export default function Offers() {
  const params = useParams();
  const zone: Zone = params.zone === "regular" ? "regular" : "healthy";

  const { data: products, isLoading } = useListProducts({ foodType: zone, onSale: true });

  const title = zone === "healthy" ? "عروض صحية" : "عروض وتخفيضات";

  return (
    <div className="pb-8">
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
              <h3 className="font-bold text-base">لا توجد عروض حالياً</h3>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                تابعنا — سنضيف عروضاً وتخفيضات على {zone === "healthy" ? "المنتجات الصحية" : "المنتجات"} قريباً.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

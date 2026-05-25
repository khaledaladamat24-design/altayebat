import { useGetCategory, useListProducts } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/product-card";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Category() {
  const params = useParams();
  const categoryId = params.id ? parseInt(params.id, 10) : undefined;
  
  const { data: category, isLoading: loadingCat } = useGetCategory(categoryId!, {
    query: { enabled: !!categoryId }
  });
  
  const { data: products, isLoading: loadingProducts } = useListProducts(
    { categoryId },
    { query: { enabled: !!categoryId } }
  );

  const [filter, setFilter] = useState<string>("all");

  const filteredProducts = products?.filter((p) => {
    if (filter === "keto") return p.isKeto;
    if (filter === "organic") return p.isOrganic;
    if (filter === "instock") return p.inStock;
    return true;
  });

  return (
    <div className="pb-8">
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
            <h1 className="text-xl font-bold">{category?.nameAr}</h1>
          )}
        </div>
      </div>

      <div className="px-4 mt-6">
        <div className="flex gap-2 overflow-x-auto pb-4 snap-x hide-scrollbar mb-2">
          <Button 
            variant={filter === "all" ? "default" : "outline"} 
            className="rounded-full snap-start whitespace-nowrap"
            onClick={() => setFilter("all")}
          >
            الكل
          </Button>
          <Button 
            variant={filter === "keto" ? "default" : "outline"} 
            className="rounded-full snap-start whitespace-nowrap"
            onClick={() => setFilter("keto")}
          >
            كيتو
          </Button>
          <Button 
            variant={filter === "organic" ? "default" : "outline"} 
            className="rounded-full snap-start whitespace-nowrap"
            onClick={() => setFilter("organic")}
          >
            عضوي
          </Button>
          <Button 
            variant={filter === "instock" ? "default" : "outline"} 
            className="rounded-full snap-start whitespace-nowrap"
            onClick={() => setFilter("instock")}
          >
            متوفر فقط
          </Button>
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
              <p>لا توجد منتجات تطابق الفلتر المحدد</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

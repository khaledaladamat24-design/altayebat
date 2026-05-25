import { useListBanners, useListCategories, useListFeaturedProducts, useListBestsellers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, MapPin } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

export default function Home() {
  const { data: banners, isLoading: loadingBanners } = useListBanners();
  const { data: categories, isLoading: loadingCategories } = useListCategories();
  const { data: featuredProducts, isLoading: loadingFeatured } = useListFeaturedProducts();
  const { data: bestsellers, isLoading: loadingBestsellers } = useListBestsellers();

  return (
    <div className="pb-8">
      {/* Header / Location */}
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-accent" />
          <div>
            <p className="text-xs text-primary-foreground/80">التوصيل إلى</p>
            <p className="font-semibold text-sm">عمان، دابوق</p>
          </div>
        </div>
        
        <Link href="/search">
          <div className="relative cursor-pointer">
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input 
              type="text" 
              placeholder="عن ماذا تبحث؟ (مثال: خبز كيتو)" 
              className="bg-background text-foreground pl-4 pr-10 rounded-xl border-none shadow-sm pointer-events-none"
              readOnly
            />
          </div>
        </Link>
      </div>

      <div className="px-4 mt-6 space-y-8">
        {/* Banners */}
        <section>
          {loadingBanners ? (
            <Skeleton className="w-full h-40 rounded-2xl" />
          ) : banners && banners.length > 0 ? (
            <div className="w-full h-40 rounded-2xl overflow-hidden relative shadow-sm">
              <img src={banners[0].imageUrl} alt={banners[0].titleAr} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-l from-black/60 to-transparent flex flex-col justify-center p-6 text-white">
                {banners[0].badgeTextAr && (
                  <span className="bg-accent text-accent-foreground text-xs font-bold px-2 py-1 rounded-md w-max mb-2">
                    {banners[0].badgeTextAr}
                  </span>
                )}
                <h2 className="text-xl font-bold">{banners[0].titleAr}</h2>
                {banners[0].subtitleAr && <p className="text-sm mt-1 opacity-90">{banners[0].subtitleAr}</p>}
              </div>
            </div>
          ) : null}
        </section>

        {/* Categories */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">الأقسام</h2>
            <Link href="/categories"><span className="text-sm text-primary font-medium cursor-pointer">عرض الكل</span></Link>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-4 px-4">
            {loadingCategories ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 min-w-[72px]">
                  <Skeleton className="w-16 h-16 rounded-full" />
                  <Skeleton className="w-12 h-3" />
                </div>
              ))
            ) : (
              categories?.map((cat) => (
                <Link key={cat.id} href={`/category/${cat.id}`}>
                  <div className="flex flex-col items-center gap-2 min-w-[72px] cursor-pointer snap-start group">
                    <div className="w-16 h-16 rounded-full bg-secondary border border-secondary-border overflow-hidden flex items-center justify-center p-3 group-hover:border-primary transition-colors">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt={cat.nameAr} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-2xl">{cat.icon}</span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-center">{cat.nameAr}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Featured Products */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">وصل حديثاً</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {loadingFeatured ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl" />
              ))
            ) : (
              featuredProducts?.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))
            )}
          </div>
        </section>
        
        {/* Bestsellers */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">الأكثر مبيعاً</h2>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-4 px-4">
            {loadingBestsellers ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="min-w-[160px] snap-start">
                  <Skeleton className="w-full aspect-[3/4] rounded-xl" />
                </div>
              ))
            ) : (
              bestsellers?.map((product) => (
                <div key={product.id} className="min-w-[160px] snap-start">
                  <ProductCard product={product} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

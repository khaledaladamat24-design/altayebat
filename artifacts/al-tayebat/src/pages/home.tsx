import { useListBanners, useListCategories, useListFeaturedProducts, useListBestsellers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, MapPin, ChevronLeft, Leaf, UtensilsCrossed } from "lucide-react";
import { useEffect, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

type Zone = "healthy" | "regular";
const ZONE_STORAGE_KEY = "al_tayebat_zone";

export default function Home() {
  const [zone, setZone] = useState<Zone>(() => {
    if (typeof window === "undefined") return "healthy";
    const saved = localStorage.getItem(ZONE_STORAGE_KEY);
    return saved === "regular" ? "regular" : "healthy";
  });

  const setActiveZone = (z: Zone) => {
    setZone(z);
    try {
      localStorage.setItem(ZONE_STORAGE_KEY, z);
    } catch {
      // ignore storage write failures (private mode, etc.)
    }
  };

  const { data: banners, isLoading: loadingBanners } = useListBanners();
  const { data: categories, isLoading: loadingCategories } = useListCategories({ foodType: zone });
  const { data: featuredProducts, isLoading: loadingFeatured } = useListFeaturedProducts({ foodType: zone });
  const { data: bestsellers, isLoading: loadingBestsellers } = useListBestsellers({ foodType: zone });

  const [address, setAddress] = useState<string>("");
  useEffect(() => {
    const a = localStorage.getItem("al_tayebat_address") || "";
    const city = localStorage.getItem("al_tayebat_city") || "";
    setAddress([city, a].filter(Boolean).join("، ") || "");
  }, []);

  const zoneEmpty =
    !loadingCategories &&
    !loadingFeatured &&
    !loadingBestsellers &&
    (categories?.length ?? 0) === 0 &&
    (featuredProducts?.length ?? 0) === 0 &&
    (bestsellers?.length ?? 0) === 0;

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-rose/20 rounded-full p-1">
            <MapPin className="w-4 h-4 text-rose-soft" />
          </div>
          <Link href="/settings">
            <div className="cursor-pointer">
              <p className="text-xs text-primary-foreground/70">التوصيل إلى</p>
              <p className="font-bold text-sm">
                {address || "أضف عنوانك ←"}
              </p>
            </div>
          </Link>
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

      {/* Zone toggle: switch between Healthy Zone and Regular Zone */}
      <div className="sticky top-0 z-20 -mt-4 px-4">
        <div className="bg-card border border-border rounded-2xl shadow-md p-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={() => setActiveZone("healthy")}
            aria-pressed={zone === "healthy"}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
              zone === "healthy"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Leaf className="w-4 h-4" />
            القسم الصحي
          </button>
          <button
            type="button"
            onClick={() => setActiveZone("regular")}
            aria-pressed={zone === "regular"}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
              zone === "regular"
                ? "bg-rose text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            القسم العادي
          </button>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-8">
        {/* Banners */}
        <section>
          {loadingBanners ? (
            <Skeleton className="w-full h-44 rounded-2xl" />
          ) : banners && banners.length > 0 ? (
            <div className="space-y-3">
              {/* Main banner */}
              <div className="w-full h-44 rounded-2xl overflow-hidden relative shadow-sm">
                <img
                  src={banners[0].imageUrl}
                  alt={banners[0].titleAr}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-l from-black/65 to-transparent flex flex-col justify-end p-5 text-white">
                  {banners[0].badgeTextAr && (
                    <span className="bg-rose text-white text-xs font-bold px-2.5 py-1 rounded-full w-max mb-2 shadow-sm">
                      {banners[0].badgeTextAr}
                    </span>
                  )}
                  <h2 className="text-xl font-bold leading-tight">{banners[0].titleAr}</h2>
                  {banners[0].subtitleAr && (
                    <p className="text-sm mt-1 opacity-85">{banners[0].subtitleAr}</p>
                  )}
                </div>
              </div>

              {/* Mini banners row */}
              {banners.length > 1 && (
                <div className="grid grid-cols-2 gap-3">
                  {banners.slice(1, 3).map((b) => (
                    <div key={b.id} className="h-24 rounded-xl overflow-hidden relative shadow-sm">
                      <img src={b.imageUrl} alt={b.titleAr} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-3 text-white">
                        {b.badgeTextAr && (
                          <span className="bg-rose/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full w-max mb-1">
                            {b.badgeTextAr}
                          </span>
                        )}
                        <p className="text-xs font-bold leading-tight">{b.titleAr}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>

        {zoneEmpty ? (
          <section className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              {zone === "healthy" ? (
                <Leaf className="w-8 h-8 text-primary" />
              ) : (
                <UtensilsCrossed className="w-8 h-8 text-rose" />
              )}
            </div>
            <h3 className="font-bold text-base">
              {zone === "healthy" ? "لا توجد منتجات في القسم الصحي بعد" : "لا توجد منتجات في القسم العادي بعد"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[260px]">
              جرّب التبديل إلى القسم الآخر من الأعلى، أو عُد لاحقاً.
            </p>
          </section>
        ) : (
        <>
        {/* Categories */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-rose rounded-full" />
              <h2 className="font-bold text-lg">الأقسام</h2>
            </div>
            <Link href="/categories">
              <span className="text-xs text-rose font-semibold cursor-pointer flex items-center gap-0.5">
                عرض الكل <ChevronLeft className="w-3 h-3" />
              </span>
            </Link>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-3 snap-x hide-scrollbar -mx-4 px-4">
            {loadingCategories
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 min-w-[68px]">
                    <Skeleton className="w-14 h-14 rounded-full" />
                    <Skeleton className="w-12 h-3" />
                  </div>
                ))
              : categories?.map((cat) => (
                  <Link key={cat.id} href={`/category/${cat.id}`}>
                    <div className="flex flex-col items-center gap-2 min-w-[68px] cursor-pointer snap-start group">
                      <div className="w-14 h-14 rounded-full bg-rose-soft border-2 border-transparent group-hover:border-rose transition-all duration-200 overflow-hidden flex items-center justify-center shadow-sm">
                        {cat.imageUrl ? (
                          <img src={cat.imageUrl} alt={cat.nameAr} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-2xl">{cat.icon}</span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-center leading-tight">{cat.nameAr}</span>
                    </div>
                  </Link>
                ))}
          </div>
        </section>

        {/* Featured Products */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h2 className="font-bold text-lg">وصل حديثاً</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {loadingFeatured
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl" />
                ))
              : featuredProducts?.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
          </div>
        </section>

        {/* Bestsellers */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-rose rounded-full" />
              <h2 className="font-bold text-lg">الأكثر مبيعاً</h2>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-3 snap-x hide-scrollbar -mx-4 px-4">
            {loadingBestsellers
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="min-w-[155px] snap-start">
                    <Skeleton className="w-full aspect-[3/4] rounded-xl" />
                  </div>
                ))
              : bestsellers?.map((product) => (
                  <div key={product.id} className="min-w-[155px] snap-start">
                    <ProductCard product={product} />
                  </div>
                ))}
          </div>
        </section>
        </>
        )}
      </div>
    </div>
  );
}

import {
  useListBanners,
  useListCategories,
  useListNewArrivals,
  useListBestsellers,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import {
  Search,
  MapPin,
  ChevronLeft,
  Leaf,
  UtensilsCrossed,
  ShoppingBasket,
  BadgePercent,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/language";
import { LanguageToggle } from "@/components/language-toggle";
import { ProvincePicker } from "@/components/province-picker";
import { getStoredCity } from "@/lib/provinces";

type Zone = "healthy" | "regular" | "grocery";
const ZONE_STORAGE_KEY = "al_tayebat_zone";

function normalizeZone(v: string | null): Zone {
  return v === "regular" || v === "grocery" ? v : "healthy";
}

export default function Home() {
  const { lang, tr } = useLanguage();
  const [zone, setZone] = useState<Zone>(() => {
    if (typeof window === "undefined") return "healthy";
    return normalizeZone(localStorage.getItem(ZONE_STORAGE_KEY));
  });

  const setActiveZone = (z: Zone) => {
    setZone(z);
    try {
      localStorage.setItem(ZONE_STORAGE_KEY, z);
    } catch {
      // ignore storage write failures (private mode, etc.)
    }
  };

  const [provinceOpen, setProvinceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  const { data: banners, isLoading: loadingBanners } = useListBanners();
  const { data: categories, isLoading: loadingCategories } = useListCategories({
    foodType: zone,
  });
  const { data: newArrivals, isLoading: loadingNewArrivals } =
    useListNewArrivals({ foodType: zone });
  const { data: bestsellers, isLoading: loadingBestsellers } =
    useListBestsellers({ foodType: zone });

  const [city, setCity] = useState<string>("");
  useEffect(() => {
    setCity(getStoredCity());
  }, []);

  const zoneEmpty =
    !loadingCategories &&
    !loadingNewArrivals &&
    !loadingBestsellers &&
    (categories?.length ?? 0) === 0 &&
    (newArrivals?.length ?? 0) === 0 &&
    (bestsellers?.length ?? 0) === 0;

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm relative z-10">
        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            type="button"
            onClick={() => setProvinceOpen(true)}
            className="flex items-center gap-2 min-w-0 text-right"
          >
            <div className="bg-rose/20 rounded-full p-1 shrink-0">
              <MapPin className="w-4 h-4 text-rose-soft" />
            </div>
            <div className="cursor-pointer min-w-0">
              <p className="text-xs text-primary-foreground/70">
                {tr("التوصيل إلى", "Delivery to")}
              </p>
              <p className="font-bold text-sm truncate">
                {city || tr("اختر منطقتك ←", "Choose your province →")}
              </p>
            </div>
          </button>
          <LanguageToggle className="shrink-0" />
        </div>

        <form onSubmit={submitSearch}>
          <div className="relative">
            <button
              type="submit"
              className="absolute inset-y-0 right-3 flex items-center"
              aria-label={tr("بحث", "Search")}
            >
              <Search className="h-4 w-4 text-muted-foreground" />
            </button>
            <Input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr(
                "عن ماذا تبحث؟ (مثال: خبز كيتو)",
                "What are you looking for? (e.g. keto bread)",
              )}
              className="bg-background text-foreground pl-4 pr-10 rounded-xl border-none shadow-sm"
            />
          </div>
        </form>
      </div>

      {/* Zone toggle: Healthy / Diverse / Grocery */}
      <div className="sticky top-0 z-20 -mt-4 px-4">
        <div className="bg-card border border-border rounded-2xl shadow-md p-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={() => setActiveZone("healthy")}
            aria-pressed={zone === "healthy"}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
              zone === "healthy"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Leaf className="w-4 h-4 shrink-0" />
            {tr("صحي", "Healthy")}
          </button>
          <button
            type="button"
            onClick={() => setActiveZone("regular")}
            aria-pressed={zone === "regular"}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
              zone === "regular"
                ? "bg-rose text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <UtensilsCrossed className="w-4 h-4 shrink-0" />
            {tr("متنوع", "Diverse")}
          </button>
          <button
            type="button"
            onClick={() => setActiveZone("grocery")}
            aria-pressed={zone === "grocery"}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
              zone === "grocery"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <ShoppingBasket className="w-4 h-4 shrink-0" />
            {tr("بقالة", "Grocery")}
          </button>
        </div>
      </div>

      <ProvincePicker
        open={provinceOpen}
        onClose={() => setProvinceOpen(false)}
        onChange={(c) => setCity(c)}
      />

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
                  alt={
                    lang === "en"
                      ? banners[0].title || banners[0].titleAr
                      : banners[0].titleAr
                  }
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-l from-black/65 to-transparent flex flex-col justify-end p-5 text-white">
                  {(lang === "en"
                    ? banners[0].badgeText || banners[0].badgeTextAr
                    : banners[0].badgeTextAr) && (
                    <span className="bg-rose text-white text-xs font-bold px-2.5 py-1 rounded-full w-max mb-2 shadow-sm">
                      {lang === "en"
                        ? banners[0].badgeText || banners[0].badgeTextAr
                        : banners[0].badgeTextAr}
                    </span>
                  )}
                  <h2 className="text-xl font-bold leading-tight">
                    {lang === "en"
                      ? banners[0].title || banners[0].titleAr
                      : banners[0].titleAr}
                  </h2>
                  {(lang === "en"
                    ? banners[0].subtitle || banners[0].subtitleAr
                    : banners[0].subtitleAr) && (
                    <p className="text-sm mt-1 opacity-85">
                      {lang === "en"
                        ? banners[0].subtitle || banners[0].subtitleAr
                        : banners[0].subtitleAr}
                    </p>
                  )}
                </div>
              </div>

              {/* Mini banners row */}
              {banners.length > 1 && (
                <div className="grid grid-cols-2 gap-3">
                  {banners.slice(1, 3).map((b) => (
                    <div
                      key={b.id}
                      className="h-24 rounded-xl overflow-hidden relative shadow-sm"
                    >
                      <img
                        src={b.imageUrl}
                        alt={lang === "en" ? b.title || b.titleAr : b.titleAr}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-3 text-white">
                        {(lang === "en"
                          ? b.badgeText || b.badgeTextAr
                          : b.badgeTextAr) && (
                          <span className="bg-rose/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full w-max mb-1">
                            {lang === "en"
                              ? b.badgeText || b.badgeTextAr
                              : b.badgeTextAr}
                          </span>
                        )}
                        <p className="text-xs font-bold leading-tight">
                          {lang === "en" ? b.title || b.titleAr : b.titleAr}
                        </p>
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
              ) : zone === "grocery" ? (
                <ShoppingBasket className="w-8 h-8 text-amber-500" />
              ) : (
                <UtensilsCrossed className="w-8 h-8 text-rose" />
              )}
            </div>
            <h3 className="font-bold text-base">
              {zone === "healthy"
                ? tr(
                    "لا توجد منتجات في القسم الصحي بعد",
                    "No products in the Healthy Zone yet",
                  )
                : zone === "grocery"
                  ? tr(
                      "لا توجد منتجات في قسم البقالة بعد",
                      "No products in the Grocery Zone yet",
                    )
                  : tr(
                      "لا توجد منتجات في القسم المتنوع بعد",
                      "No products in the Diverse Zone yet",
                    )}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[260px]">
              {tr(
                "جرّب التبديل إلى قسم آخر من الأعلى، أو عُد لاحقاً.",
                "Try switching to another zone above, or check back later.",
              )}
            </p>
            <Link href={`/offers/${zone}`}>
              <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-rose cursor-pointer">
                <BadgePercent className="w-4 h-4" />
                {zone === "healthy"
                  ? tr("تصفّح العروض الصحية", "Browse Healthy Offers")
                  : tr("تصفّح العروض والتخفيضات", "Browse Offers & Discounts")}
              </span>
            </Link>
          </section>
        ) : (
          <>
            {/* Categories */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-rose rounded-full" />
                  <h2 className="font-bold text-lg">
                    {tr("الأقسام", "Categories")}
                  </h2>
                </div>
                <Link href="/categories">
                  <span className="text-xs text-rose font-semibold cursor-pointer flex items-center gap-0.5">
                    {tr("عرض الكل", "View all")}{" "}
                    <ChevronLeft className="w-3 h-3" />
                  </span>
                </Link>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-3 snap-x hide-scrollbar -mx-4 px-4">
                {/* Offers shortcut — always first in the rail, per zone */}
                <Link href={`/offers/${zone}`}>
                  <div className="flex flex-col items-center gap-2 min-w-[68px] cursor-pointer snap-start group">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose to-rose/70 border-2 border-transparent group-hover:border-rose transition-all duration-200 overflow-hidden flex items-center justify-center shadow-sm">
                      <BadgePercent className="w-7 h-7 text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-rose text-center leading-tight">
                      {zone === "healthy"
                        ? tr("عروض صحية", "Healthy Offers")
                        : tr("عروض وتخفيضات", "Offers & Discounts")}
                    </span>
                  </div>
                </Link>
                {loadingCategories
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center gap-2 min-w-[68px]"
                      >
                        <Skeleton className="w-14 h-14 rounded-full" />
                        <Skeleton className="w-12 h-3" />
                      </div>
                    ))
                  : categories?.map((cat) => (
                      <Link key={cat.id} href={`/category/${cat.id}`}>
                        <div className="flex flex-col items-center gap-2 min-w-[68px] cursor-pointer snap-start group">
                          <div className="w-14 h-14 rounded-full bg-rose-soft border-2 border-transparent group-hover:border-rose transition-all duration-200 overflow-hidden flex items-center justify-center shadow-sm">
                            {cat.imageUrl ? (
                              <img
                                src={cat.imageUrl}
                                alt={
                                  lang === "en"
                                    ? cat.name || cat.nameAr
                                    : cat.nameAr
                                }
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <span className="text-2xl">{cat.icon}</span>
                            )}
                          </div>
                          <span className="text-[11px] font-medium text-center leading-tight">
                            {lang === "en"
                              ? cat.name || cat.nameAr
                              : cat.nameAr}
                          </span>
                        </div>
                      </Link>
                    ))}
              </div>
            </section>

            {/* Featured Products */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-5 bg-primary rounded-full" />
                <h2 className="font-bold text-lg">
                  {tr("وصل حديثاً", "New Arrivals")}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {loadingNewArrivals
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className="w-full aspect-[3/4] rounded-xl"
                      />
                    ))
                  : newArrivals?.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
              </div>
            </section>

            {/* Bestsellers */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-rose rounded-full" />
                  <h2 className="font-bold text-lg">
                    {tr("الأكثر مبيعاً", "Best Sellers")}
                  </h2>
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
                      <div
                        key={product.id}
                        className="min-w-[155px] snap-start"
                      >
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

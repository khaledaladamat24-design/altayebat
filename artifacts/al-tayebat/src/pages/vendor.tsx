import {
  useListProducts,
  getListProductsQueryKey,
  useGetVendor,
  getGetVendorQueryKey,
  useListVendorAds,
  getListVendorAdsQueryKey,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ChevronRight, Store, MapPin, Bike, PackageCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/product-card";
import { useLanguage } from "@/contexts/language";

export default function Vendor() {
  const { lang, dir, tr } = useLanguage();
  const params = useParams();
  const vendorId = params.id ? parseInt(params.id, 10) : undefined;

  const { data: vendor, isLoading: loadingVendor } = useGetVendor(vendorId!, {
    query: {
      enabled: !!vendorId,
      queryKey: getGetVendorQueryKey(vendorId!),
    },
  });

  const { data: ads } = useListVendorAds(vendorId!, {
    query: {
      enabled: !!vendorId,
      queryKey: getListVendorAdsQueryKey(vendorId!),
    },
  });

  const { data: products, isLoading: loadingProducts } = useListProducts(
    { vendorId },
    {
      query: {
        enabled: !!vendorId,
        queryKey: getListProductsQueryKey({ vendorId }),
      },
    },
  );

  const storeTitle = vendor
    ? lang === "en"
      ? vendor.storeName || vendor.storeNameAr || ""
      : vendor.storeNameAr || vendor.storeName || ""
    : "";

  return (
    <div className="pb-8 min-h-screen bg-background" dir={dir}>
      {/* Header */}
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="~"
            onClick={(e) => {
              e.preventDefault();
              window.history.back();
            }}
          >
            <div className="bg-primary-foreground/20 p-2 rounded-full cursor-pointer hover:bg-primary-foreground/30 transition">
              <ChevronRight className="w-5 h-5" />
            </div>
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Store className="w-6 h-6 shrink-0" />
            {loadingVendor ? (
              <Skeleton className="h-7 w-40 bg-primary-foreground/20" />
            ) : (
              <h1 className="text-xl font-bold truncate">
                {storeTitle || tr("متجر", "Store")}
              </h1>
            )}
          </div>
        </div>

        {vendor ? (
          <div className="flex flex-wrap items-center gap-2 pr-1">
            {vendor.city ? (
              <span className="inline-flex items-center gap-1 text-xs bg-primary-foreground/15 px-2.5 py-1 rounded-full">
                <MapPin className="w-3.5 h-3.5" />
                {vendor.city}
              </span>
            ) : null}
            {vendor.deliveryEnabled ? (
              <span className="inline-flex items-center gap-1 text-xs bg-primary-foreground/15 px-2.5 py-1 rounded-full">
                <Bike className="w-3.5 h-3.5" />
                {tr("توصيل", "Delivery")}
              </span>
            ) : null}
            {vendor.pickupEnabled ? (
              <span className="inline-flex items-center gap-1 text-xs bg-primary-foreground/15 px-2.5 py-1 rounded-full">
                <PackageCheck className="w-3.5 h-3.5" />
                {tr("استلام من المتجر", "Pickup")}
              </span>
            ) : null}
            {!vendor.isOnline ? (
              <span className="inline-flex items-center gap-1 text-xs bg-rose/80 text-white px-2.5 py-1 rounded-full">
                {tr("مغلق حالياً", "Currently closed")}
              </span>
            ) : null}
          </div>
        ) : null}

        {vendor?.description ? (
          <p className="text-sm text-primary-foreground/80 mt-3 pr-1">
            {vendor.description}
          </p>
        ) : null}
      </div>

      {/* Ads carousel */}
      {ads && ads.length > 0 ? (
        <div className="mt-4 -mx-0 px-4">
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x hide-scrollbar">
            {ads.map((ad) => (
              <div
                key={ad.id}
                className="min-w-[280px] w-[280px] aspect-[16/9] rounded-2xl overflow-hidden bg-muted snap-start shadow-sm"
              >
                <img
                  src={ad.imageUrl}
                  alt={ad.titleAr || ad.title || ""}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Products */}
      <div className="px-4 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-rose rounded-full" />
          <h2 className="font-bold text-lg">{tr("المنتجات", "Products")}</h2>
        </div>

        {loadingProducts ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="w-full aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {tr(
              "لا توجد منتجات في هذا المتجر بعد.",
              "No products in this store yet.",
            )}
          </div>
        )}
      </div>
    </div>
  );
}

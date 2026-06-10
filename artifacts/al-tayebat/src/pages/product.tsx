import {
  useGetProduct,
  useListProducts,
  getGetProductQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ChevronRight, Plus, Minus, ShoppingBag, Store } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useSession } from "@/hooks/use-session";
import { ProductCard } from "@/components/product-card";
import { useLanguage } from "@/contexts/language";
import { useCartActions } from "@/contexts/cart-actions";

export default function Product() {
  const { lang, dir, tr } = useLanguage();
  const params = useParams();
  const productId = params.id ? parseInt(params.id, 10) : undefined;

  const { data: product, isLoading } = useGetProduct(productId!, {
    query: {
      enabled: !!productId,
      queryKey: getGetProductQueryKey(productId!),
    },
  });

  const { data: relatedProducts } = useListProducts(
    { categoryId: product?.categoryId },
    {
      query: {
        enabled: !!product?.categoryId,
        queryKey: getListProductsQueryKey({ categoryId: product?.categoryId }),
      },
    },
  );

  const sessionId = useSession();
  const { addToCart } = useCartActions();
  const [quantity, setQuantity] = useState(1);

  const productName = product
    ? lang === "en"
      ? product.name || product.nameAr
      : product.nameAr
    : "";
  const productDescription = product
    ? lang === "en"
      ? product.description || product.descriptionAr || ""
      : product.descriptionAr || ""
    : "";
  const vendorDisplay = product
    ? lang === "en"
      ? product.vendorName || product.vendorNameAr || ""
      : product.vendorNameAr || product.vendorName || ""
    : "";

  const handleAddToCart = () => {
    if (!sessionId || !product) return;
    addToCart({ productId: product.id, quantity, title: productName });
  };

  if (isLoading) {
    return (
      <div className="pb-24" dir={dir}>
        <Skeleton className="w-full aspect-square" />
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[50vh] px-4"
        dir={dir}
      >
        <h2 className="text-xl font-bold mb-2">
          {tr("المنتج غير موجود", "Product not found")}
        </h2>
        <Link href="/">
          <Button>{tr("العودة للرئيسية", "Back to home")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24" dir={dir}>
      <div className="relative">
        <Link
          href="~"
          onClick={(e) => {
            e.preventDefault();
            window.history.back();
          }}
        >
          <div className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur p-2 rounded-full cursor-pointer shadow-sm">
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>

        <div className="aspect-square bg-white relative">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={productName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted">
              {tr("صورة المنتج", "Product image")}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-background rounded-t-3xl -mt-6 relative z-10">
        <div className="flex gap-2 mb-3">
          {product.isKeto && (
            <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-md">
              {tr("كيتو 🥑", "Keto 🥑")}
            </span>
          )}
          {product.isOrganic && (
            <span className="bg-accent/10 text-accent text-xs font-bold px-2 py-1 rounded-md">
              {tr("عضوي 🌿", "Organic 🌿")}
            </span>
          )}
          {product.isBestseller && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-md">
              {tr("الأكثر مبيعاً", "Bestseller")}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold mb-1">{productName}</h1>
        {product.weightOrVolume && (
          <p className="text-sm text-muted-foreground mb-2">
            {product.weightOrVolume}
          </p>
        )}
        {vendorDisplay ? (
          <Link
            href={
              product.vendorId
                ? `/vendor/${product.vendorId}`
                : `/search?q=${encodeURIComponent(vendorDisplay)}`
            }
          >
            <div className="inline-flex items-center gap-1.5 bg-primary/5 text-primary text-sm font-bold px-3 py-1.5 rounded-full mb-4 cursor-pointer hover:bg-primary/10 transition-colors">
              <Store className="w-4 h-4" />
              <span>{vendorDisplay}</span>
            </div>
          </Link>
        ) : null}

        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-primary">
              {formatPrice(product.price)}
            </span>
            {product.originalPrice && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(product.originalPrice)}
              </span>
            )}
          </div>

          <div className="flex items-center bg-muted rounded-full p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-bold">{quantity}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="font-bold text-lg mb-2">
            {tr("الوصف", "Description")}
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {productDescription ||
              tr(
                "لا يوجد وصف متاح لهذا المنتج.",
                "No description available for this product.",
              )}
          </p>
        </div>

        {relatedProducts && relatedProducts.length > 1 && (
          <div className="mb-8">
            <h3 className="font-bold text-lg mb-4">
              {tr("منتجات مشابهة", "Similar products")}
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-4 px-4">
              {relatedProducts
                .filter((p) => p.id !== product.id)
                .slice(0, 5)
                .map((relatedProd) => (
                  <div
                    key={relatedProd.id}
                    className="min-w-[160px] snap-start"
                  >
                    <ProductCard product={relatedProd} />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t border-border z-50 max-w-md mx-auto">
        <Button
          className="w-full h-14 rounded-full text-lg shadow-lg flex items-center justify-center gap-2"
          onClick={handleAddToCart}
          disabled={!product.inStock}
        >
          <ShoppingBag className="w-5 h-5" />
          {product.inStock
            ? tr("أضف للسلة", "Add to cart")
            : tr("غير متوفر", "Out of stock")}
          {product.inStock && (
            <span className="bg-primary-foreground/20 px-2 py-0.5 rounded text-sm mr-2">
              {formatPrice(product.price * quantity)}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

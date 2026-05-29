import { Link } from "wouter";
import { type Product } from "@workspace/api-client-react";
import { useAddToCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/language";

type ProductWithMacros = Product & {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
};

export function ProductCard({ product: rawProduct }: { product: Product }) {
  const product = rawProduct as ProductWithMacros;
  const hasMacros =
    product.calories != null ||
    product.protein != null ||
    product.carbs != null ||
    product.fats != null;
  // Only treat it as a real discount when the original price is genuinely higher
  // than the current price — avoids a misleading strike-through.
  const hasDiscount =
    product.originalPrice != null &&
    Number(product.originalPrice) > Number(product.price);
  const sessionId = useSession();
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();
  const { lang, tr } = useLanguage();
  const title = lang === "en" ? product.name || product.nameAr : product.nameAr;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!sessionId) return;

    addToCart.mutate(
      { data: { productId: product.id, quantity: 1, sessionId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetCartQueryKey({ sessionId }),
          });
          toast.success(
            tr(`تمت إضافة ${title} إلى السلة`, `${title} added to cart`),
          );
        },
      },
    );
  };

  return (
    <Link href={`/product/${product.id}`}>
      <div className="bg-card border border-card-border rounded-xl overflow-hidden cursor-pointer h-full flex flex-col transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div className="relative aspect-square bg-muted">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.nameAr}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              {tr("صورة المنتج", "Product image")}
            </div>
          )}

          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {product.isKeto && (
              <span className="bg-primary/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                {tr("كيتو", "Keto")}
              </span>
            )}
            {product.isOrganic && (
              <span className="bg-rose text-rose-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                {tr("عضوي", "Organic")}
              </span>
            )}
          </div>

          {(product.isOnSale || hasDiscount) && (
            <div className="absolute top-2 left-2">
              <span className="bg-rose text-rose-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                {tr("عرض", "Sale")}
              </span>
            </div>
          )}

          {product.isBestseller && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-rose/80 to-transparent py-1 px-2">
              <span className="text-white text-[10px] font-bold">
                {tr("الأكثر مبيعاً", "Bestseller")}
              </span>
            </div>
          )}
        </div>

        <div className="p-3 flex flex-col flex-grow">
          <h3 className="font-semibold text-sm line-clamp-2 mb-1">{title}</h3>

          {hasMacros && (
            <div className="flex flex-wrap gap-1 mb-1.5" dir="ltr">
              {product.calories != null && (
                <span className="inline-flex items-center gap-0.5 text-[10px] bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-md font-bold">
                  🔥 {product.calories}
                </span>
              )}
              {product.protein != null && (
                <span className="inline-flex items-center gap-0.5 text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-md font-bold">
                  🍗 {product.protein}g
                </span>
              )}
              {product.carbs != null && (
                <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-md font-bold">
                  🌾 {product.carbs}g
                </span>
              )}
              {product.fats != null && (
                <span className="inline-flex items-center gap-0.5 text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-md font-bold">
                  🥑 {product.fats}g
                </span>
              )}
            </div>
          )}

          {product.weightOrVolume && (
            <p className="text-xs text-muted-foreground mb-2">
              {product.weightOrVolume}
            </p>
          )}

          <div className="mt-auto flex items-center justify-between pt-2">
            <div className="flex flex-col">
              <span className="font-bold text-primary text-sm">
                {formatPrice(product.price)}
              </span>
              {hasDiscount && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatPrice(product.originalPrice!)}
                </span>
              )}
            </div>

            <Button
              size="icon"
              className="h-8 w-8 rounded-full bg-rose hover:bg-rose/90 text-rose-foreground shadow-sm"
              onClick={handleAddToCart}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}

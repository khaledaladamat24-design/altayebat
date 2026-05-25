import { Link } from "wouter";
import { type Product } from "@workspace/api-client-react";
import { useAddToCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function ProductCard({ product }: { product: Product }) {
  const sessionId = useSession();
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!sessionId) return;

    addToCart.mutate(
      { data: { productId: product.id, quantity: 1, sessionId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
          toast.success(`تمت إضافة ${product.nameAr} إلى السلة`);
        },
      }
    );
  };

  return (
    <Link href={`/product/${product.id}`}>
      <div className="bg-card border border-card-border rounded-xl overflow-hidden cursor-pointer h-full flex flex-col transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div className="relative aspect-square bg-muted">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.nameAr} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              صورة المنتج
            </div>
          )}

          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {product.isKeto && (
              <span className="bg-primary/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                كيتو
              </span>
            )}
            {product.isOrganic && (
              <span className="bg-rose text-rose-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                عضوي
              </span>
            )}
          </div>

          {product.originalPrice && (
            <div className="absolute top-2 left-2">
              <span className="bg-rose text-rose-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                خصم
              </span>
            </div>
          )}

          {product.isBestseller && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-rose/80 to-transparent py-1 px-2">
              <span className="text-white text-[10px] font-bold">الأكثر مبيعاً</span>
            </div>
          )}
        </div>

        <div className="p-3 flex flex-col flex-grow">
          <h3 className="font-semibold text-sm line-clamp-2 mb-1">{product.nameAr}</h3>

          {product.weightOrVolume && (
            <p className="text-xs text-muted-foreground mb-2">{product.weightOrVolume}</p>
          )}

          <div className="mt-auto flex items-center justify-between pt-2">
            <div className="flex flex-col">
              <span className="font-bold text-primary text-sm">{formatPrice(product.price)}</span>
              {product.originalPrice && (
                <span className="text-xs text-muted-foreground line-through">{formatPrice(product.originalPrice)}</span>
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

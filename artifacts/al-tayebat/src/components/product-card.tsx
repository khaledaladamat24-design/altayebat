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
      <div className="bg-card border border-card-border rounded-xl overflow-hidden hover-elevate cursor-pointer h-full flex flex-col transition-all duration-200 hover:shadow-md">
        <div className="relative aspect-square bg-muted">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.nameAr} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              صورة المنتج
            </div>
          )}
          
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {product.isKeto && (
              <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-md backdrop-blur-sm">كيتو 🥑</span>
            )}
            {product.isOrganic && (
              <span className="bg-accent/10 text-accent-foreground text-xs font-bold px-2 py-1 rounded-md backdrop-blur-sm bg-accent">عضوي 🌿</span>
            )}
          </div>
          
          {product.originalPrice && (
            <div className="absolute top-2 left-2">
              <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                خصم
              </span>
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
              <span className="font-bold text-primary">{formatPrice(product.price)}</span>
              {product.originalPrice && (
                <span className="text-xs text-muted-foreground line-through">{formatPrice(product.originalPrice)}</span>
              )}
            </div>
            
            <Button size="icon" className="h-8 w-8 rounded-full" onClick={handleAddToCart}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}

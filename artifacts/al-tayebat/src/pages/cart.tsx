import { useGetCart, useUpdateCartItem, useRemoveFromCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ChevronRight, Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { useQueryClient } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/language";

export default function Cart() {
  const sessionId = useSession();
  const queryClient = useQueryClient();
  const { lang, dir, tr } = useLanguage();
  
  const { data: cart, isLoading } = useGetCart(
    { sessionId }, 
    { query: { enabled: !!sessionId } }
  );

  const updateCartItem = useUpdateCartItem();
  const removeFromCart = useRemoveFromCart();

  const handleUpdateQuantity = (itemId: number, quantity: number) => {
    if (quantity < 1) {
      handleRemove(itemId);
      return;
    }
    updateCartItem.mutate(
      { itemId, data: { quantity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
        }
      }
    );
  };

  const handleRemove = (itemId: number) => {
    removeFromCart.mutate(
      { itemId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-32 mb-6" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="pb-24 min-h-screen bg-background flex flex-col" dir={dir}>
      <div className="bg-background pt-8 pb-4 px-4 sticky top-0 z-20 border-b border-border/50 flex items-center gap-4">
        <Link href="/">
          <div className="p-2 -mr-2 text-foreground cursor-pointer">
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>
        <h1 className="text-xl font-bold">{tr("سلة المشتريات", "Shopping Cart")}</h1>
      </div>

      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
            <ShoppingBag className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2">{tr("سلتك فارغة", "Your cart is empty")}</h2>
          <p className="text-muted-foreground mb-8">{tr("لم تقم بإضافة أي منتجات إلى سلتك بعد.", "You haven't added any products to your cart yet.")}</p>
          <Link href="/">
            <Button className="rounded-full px-8 h-12">{tr("تصفح المنتجات", "Browse Products")}</Button>
          </Link>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 px-4 py-6 space-y-4">
            {cart.items.map((item) => {
              const displayName = lang === "en" ? (item.productName || item.productNameAr) : item.productNameAr;
              return (
              <div key={item.id} className="flex gap-4 bg-card border border-border p-3 rounded-2xl shadow-sm">
                <div className="w-20 h-20 bg-muted rounded-xl flex-shrink-0 overflow-hidden">
                  {item.productImageUrl ? (
                    <img src={item.productImageUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">{tr("صورة", "Image")}</div>
                  )}
                </div>
                
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-sm line-clamp-2">{displayName}</h3>
                    <button 
                      onClick={() => handleRemove(item.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      aria-label={tr("حذف", "Remove")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="font-bold text-primary mb-auto">
                    {formatPrice(item.unitPrice)}
                  </div>
                  
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center bg-muted rounded-lg p-0.5">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-md" 
                        onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                        disabled={updateCartItem.isPending}
                        aria-label={tr("إنقاص", "Decrease")}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 rounded-md" 
                        onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                        disabled={updateCartItem.isPending}
                        aria-label={tr("زيادة", "Increase")}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <span className="font-semibold text-sm">
                      {formatPrice(item.totalPrice)}
                    </span>
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="bg-card border-t border-border p-4 space-y-4">
            <h3 className="font-bold text-lg">{tr("ملخص الطلب", "Order Summary")}</h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("المجموع الفرعي", "Subtotal")}</span>
                <span className="font-medium">{formatPrice(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("رسوم التوصيل", "Delivery Fee")}</span>
                <span className="font-medium">
                  {cart.deliveryFee === 0 ? (
                    <span className="text-primary font-bold">{tr("مجاني", "Free")}</span>
                  ) : (
                    formatPrice(cart.deliveryFee)
                  )}
                </span>
              </div>
              {cart.deliveryFee > 0 && cart.subtotal < 20 && (
                <div className="text-xs text-primary bg-primary/10 p-2 rounded-lg mt-1">
                  {tr(
                    `أضف منتجات بقيمة ${formatPrice(20 - cart.subtotal)} للحصول على توصيل مجاني!`,
                    `Add ${formatPrice(20 - cart.subtotal)} more to get free delivery!`
                  )}
                </div>
              )}
            </div>
            
            <Separator />
            
            <div className="flex justify-between items-center text-lg font-bold">
              <span>{tr("الإجمالي", "Total")}</span>
              <span className="text-primary">{formatPrice(cart.total)}</span>
            </div>
            
            <Link href="/checkout">
              <Button className="w-full h-14 rounded-full text-lg shadow-lg mt-4">
                {tr("إتمام الطلب", "Checkout")}
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

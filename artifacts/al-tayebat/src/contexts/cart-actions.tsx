import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useAddToCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { useLanguage } from "@/contexts/language";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PendingItem = {
  productId: number;
  quantity: number;
  title: string;
};

type CartActions = {
  // Adds a product to the cart. Enforces a single-vendor cart: if the cart
  // already holds another vendor's items the server returns 409 and we open a
  // confirmation dialog letting the buyer clear the cart and add this product.
  addToCart: (item: PendingItem) => void;
};

const CartActionsContext = createContext<CartActions | null>(null);

export function CartActionsProvider({ children }: { children: ReactNode }) {
  const sessionId = useSession();
  const queryClient = useQueryClient();
  const addToCartMutation = useAddToCart();
  const { dir, tr } = useLanguage();
  const [pending, setPending] = useState<PendingItem | null>(null);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getGetCartQueryKey({ sessionId }),
    });
  }, [queryClient, sessionId]);

  const addToCart = useCallback(
    (item: PendingItem) => {
      if (!sessionId) return;
      addToCartMutation.mutate(
        {
          data: {
            productId: item.productId,
            quantity: item.quantity,
            sessionId,
          },
        },
        {
          onSuccess: () => {
            refresh();
            toast.success(
              tr(
                `تمت إضافة ${item.title} إلى السلة`,
                `${item.title} added to cart`,
              ),
            );
          },
          onError: (err) => {
            const apiErr = err as { data?: { code?: string; error?: string } };
            if (apiErr?.data?.code === "DIFFERENT_VENDOR") {
              setPending(item);
              return;
            }
            toast.error(
              apiErr?.data?.error ||
                tr(
                  "تعذّر إضافة المنتج إلى السلة",
                  "Could not add the product to the cart",
                ),
            );
          },
        },
      );
    },
    [sessionId, addToCartMutation, refresh, tr],
  );

  const confirmReplace = useCallback(() => {
    if (!sessionId || !pending) return;
    const item = pending;
    setPending(null);
    addToCartMutation.mutate(
      {
        data: {
          productId: item.productId,
          quantity: item.quantity,
          sessionId,
          replace: true,
        },
      },
      {
        onSuccess: () => {
          refresh();
          toast.success(
            tr(
              `تم إفراغ السلة وإضافة ${item.title}`,
              `Cart cleared and ${item.title} added`,
            ),
          );
        },
        onError: () => {
          toast.error(
            tr(
              "تعذّر تحديث السلة. حاول مرة أخرى.",
              "Could not update the cart. Please try again.",
            ),
          );
        },
      },
    );
  }, [sessionId, pending, addToCartMutation, refresh, tr]);

  return (
    <CartActionsContext.Provider value={{ addToCart }}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("متجر مختلف", "Different store")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "لديك عناصر في السلة من متجر آخر. لا يمكن الطلب من أكثر من متجر في نفس السلة. هل تريد إفراغ السلة وإضافة هذا المنتج؟",
                "Your cart has items from a different store. You can't order from more than one store in the same cart. Do you want to clear the cart and add this product?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("إلغاء", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>
              {tr("إفراغ السلة وإضافة", "Clear cart & add")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CartActionsContext.Provider>
  );
}

export function useCartActions(): CartActions {
  const ctx = useContext(CartActionsContext);
  if (!ctx) {
    throw new Error("useCartActions must be used within a CartActionsProvider");
  }
  return ctx;
}

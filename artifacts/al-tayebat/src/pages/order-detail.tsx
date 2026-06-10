import { useGetOrder, getGetOrderQueryKey } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import {
  ChevronRight,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { apiUrl } from "@/lib/api-url";
import { useSession } from "@/hooks/use-session";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useLanguage } from "@/contexts/language";

export default function OrderDetail() {
  const { lang, dir, tr } = useLanguage();
  const params = useParams();
  const orderId = params.id ? parseInt(params.id, 10) : undefined;
  const sessionId = useSession();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const confirmReceived = async () => {
    if (!orderId) return;
    setConfirming(true);
    try {
      const r = await fetch(apiUrl(`/api/orders/${orderId}/received`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!r.ok) throw new Error(String(r.status));
      await queryClient.invalidateQueries({
        queryKey: getGetOrderQueryKey(orderId),
      });
      toast.success(
        tr("تم تأكيد استلام طلبك. شكراً لك!", "Receipt confirmed. Thank you!"),
      );
    } catch {
      toast.error(
        tr("تعذّر تأكيد الاستلام، حاول مجدداً", "Couldn't confirm, try again"),
      );
    } finally {
      setConfirming(false);
    }
  };

  const statusConfig = {
    pending: {
      label: tr("قيد الانتظار", "Pending"),
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500",
    },
    preparing: {
      label: tr("قيد التحضير", "Preparing"),
      icon: Package,
      color: "text-indigo-500",
      bg: "bg-indigo-500",
    },
    ready: {
      label: tr("جاهز", "Ready"),
      icon: ShoppingBag,
      color: "text-teal-500",
      bg: "bg-teal-500",
    },
    out_for_delivery: {
      label: tr("في الطريق", "Out for delivery"),
      icon: Truck,
      color: "text-primary",
      bg: "bg-primary",
    },
    delivered: {
      label: tr("تم التوصيل", "Delivered"),
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-600",
    },
    cancelled: {
      label: tr("ملغي", "Cancelled"),
      icon: Clock,
      color: "text-destructive",
      bg: "bg-destructive",
    },
  };

  const { data: order, isLoading } = useGetOrder(orderId!, {
    query: { enabled: !!orderId, queryKey: getGetOrderQueryKey(orderId!) },
  });

  if (isLoading || !order) {
    return (
      <div className="p-4 space-y-4" dir={dir}>
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  // Pickup orders skip the out-for-delivery leg entirely, so the progress
  // tracker shows a shorter flow for them.
  const isPickup = order.fulfillmentType === "pickup";
  const statusOrder = isPickup
    ? ["pending", "preparing", "ready", "delivered"]
    : ["pending", "preparing", "ready", "out_for_delivery", "delivered"];

  const currentStatusIndex = statusOrder.indexOf(order.status);
  const isCancelled = order.status === "cancelled";

  return (
    <div className="pb-8 min-h-screen bg-muted/30" dir={dir}>
      <div className="bg-background pt-8 pb-4 px-4 sticky top-0 z-20 border-b border-border/50 flex items-center gap-4">
        <Link href="/orders">
          <div className="p-2 -mr-2 text-foreground cursor-pointer">
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>
        <h1 className="text-xl font-bold">
          {tr("طلب", "Order")} #{order.id}
        </h1>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border text-center">
          <p className="text-sm text-muted-foreground mb-1">
            {format(
              new Date(order.createdAt),
              "dd MMMM yyyy - hh:mm a",
              lang === "ar" ? { locale: ar } : undefined,
            )}
          </p>
          <h2 className="text-2xl font-bold text-primary mb-6">
            {formatPrice(order.total)}
          </h2>

          {!isCancelled ? (
            <div className="relative pt-2 pb-6">
              {/* Progress Line */}
              <div className="absolute top-6 left-8 right-8 h-1 bg-muted rounded-full -z-10"></div>
              <div
                className="absolute top-6 right-8 h-1 bg-primary rounded-full transition-all duration-500 -z-10"
                style={{
                  width: `${(Math.max(0, currentStatusIndex) / (statusOrder.length - 1)) * 100}%`,
                }}
              ></div>

              <div className="flex justify-between relative z-0">
                {statusOrder.map((status, index) => {
                  const config =
                    statusConfig[status as keyof typeof statusConfig];
                  const Icon = config.icon;
                  const isCompleted = index <= currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;

                  return (
                    <div key={status} className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 transition-colors duration-300 ${
                          isCompleted
                            ? config.bg + " text-white shadow-md"
                            : "bg-muted text-muted-foreground border-2 border-background"
                        } ${isCurrent ? "ring-4 ring-primary/20 scale-110" : ""}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span
                        className={`text-[10px] font-bold ${isCurrent ? config.color : isCompleted ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {config.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-destructive font-bold bg-destructive/10 p-4 rounded-xl">
              <Clock className="w-5 h-5" />
              {tr("تم إلغاء هذا الطلب", "This order has been cancelled")}
            </div>
          )}

          {order.estimatedDelivery &&
            !isCancelled &&
            currentStatusIndex < statusOrder.length - 1 && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mt-4 text-sm font-medium text-primary">
                {tr("الوقت المتوقع للتوصيل:", "Estimated delivery time:")}{" "}
                {order.estimatedDelivery}
              </div>
            )}

          {/* Customer-side delivery confirmation. The vendor dashboard phone
              stays at the restaurant while the courier is out, so the customer
              closes the order from their own device once it arrives. Shown only
              when the order is actually on its way (or ready, for pickup). */}
          {!isCancelled &&
            (order.status === "out_for_delivery" ||
              (isPickup && order.status === "ready")) && (
              <div className="mt-5">
                <Button
                  onClick={confirmReceived}
                  disabled={confirming}
                  className="w-full h-12 text-base font-bold gap-2"
                  data-testid="button-confirm-received"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {confirming
                    ? tr("جارٍ التأكيد...", "Confirming...")
                    : tr("تم استلام الطلب", "I received my order")}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  {tr(
                    "اضغط بعد استلامك الطلب لإغلاقه.",
                    "Tap once you've received your order to close it.",
                  )}
                </p>
              </div>
            )}
        </div>

        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h3 className="font-bold text-lg mb-4">{tr("المنتجات", "Items")}</h3>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center text-sm border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-muted w-8 h-8 flex items-center justify-center rounded-md font-bold text-xs text-primary">
                    {item.quantity}x
                  </div>
                  <span>
                    {lang === "en"
                      ? item.productName || item.productNameAr
                      : item.productNameAr}
                  </span>
                </div>
                <span className="font-medium">
                  {formatPrice(item.totalPrice)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h3 className="font-bold text-lg mb-4">
            {tr("تفاصيل الدفع", "Payment details")}
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{tr("المجموع الفرعي", "Subtotal")}</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{tr("رسوم التوصيل", "Delivery fee")}</span>
              <span>
                {order.deliveryFee === 0
                  ? tr("مجاني", "Free")
                  : formatPrice(order.deliveryFee)}
              </span>
            </div>
            <div className="border-t border-border mt-3 pt-3 flex justify-between items-center font-bold">
              <span>{tr("الإجمالي", "Total")}</span>
              <span className="text-primary">{formatPrice(order.total)}</span>
            </div>
            <div className="bg-muted p-2 rounded text-xs text-center mt-2 text-muted-foreground">
              {tr(
                "طريقة الدفع: الدفع عند الاستلام",
                "Payment method: Cash on delivery",
              )}
            </div>
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border mb-8">
          <h3 className="font-bold text-lg mb-4">
            {tr("بيانات التوصيل", "Delivery details")}
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs mb-1">
                {tr("الاسم", "Name")}
              </span>
              <span className="font-medium">{order.customerName}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs mb-1">
                {tr("رقم الهاتف", "Phone number")}
              </span>
              <span className="font-medium" dir="ltr">
                {order.customerPhone}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs mb-1">
                {tr("العنوان", "Address")}
              </span>
              <span className="font-medium">{order.deliveryAddress}</span>
            </div>
            {order.notes && (
              <div>
                <span className="text-muted-foreground block text-xs mb-1">
                  {tr("ملاحظات", "Notes")}
                </span>
                <span className="font-medium">{order.notes}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

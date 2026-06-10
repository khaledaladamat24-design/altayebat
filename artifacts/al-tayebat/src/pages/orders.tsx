import {
  useListOrders,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  ChevronRight,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  AlertCircle,
  ShoppingBag,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useLanguage } from "@/contexts/language";

export default function Orders() {
  const { lang, dir, tr } = useLanguage();
  const sessionId = useSession();
  const { data: orders, isLoading } = useListOrders(
    { sessionId },
    {
      query: {
        enabled: !!sessionId,
        queryKey: getListOrdersQueryKey({ sessionId }),
      },
    },
  );

  const statusConfig = {
    pending: {
      label: tr("قيد الانتظار", "Pending"),
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    preparing: {
      label: tr("قيد التحضير", "Preparing"),
      icon: Package,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
    },
    ready: {
      label: tr("جاهز", "Ready"),
      icon: ShoppingBag,
      color: "text-teal-500",
      bg: "bg-teal-500/10",
    },
    out_for_delivery: {
      label: tr("في الطريق", "Out for delivery"),
      icon: Truck,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    delivered: {
      label: tr("تم التوصيل", "Delivered"),
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-600/10",
    },
    cancelled: {
      label: tr("ملغي", "Cancelled"),
      icon: AlertCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  };

  return (
    <div className="pb-8 min-h-screen bg-muted/30" dir={dir}>
      <div className="bg-background pt-8 pb-4 px-4 sticky top-0 z-20 border-b border-border/50 flex items-center gap-4">
        <Link href="/">
          <div className="p-2 -mr-2 text-foreground cursor-pointer">
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>
        <h1 className="text-xl font-bold">{tr("طلباتي", "My Orders")}</h1>
      </div>

      <div className="px-4 py-6 space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))
        ) : orders && orders.length > 0 ? (
          orders.map((order) => {
            const config =
              statusConfig[order.status as keyof typeof statusConfig] ||
              statusConfig.pending;
            const StatusIcon = config.icon;

            return (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div className="bg-card p-4 rounded-2xl shadow-sm border border-border hover-elevate cursor-pointer">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {format(
                          new Date(order.createdAt),
                          "dd MMMM yyyy - hh:mm a",
                          lang === "ar" ? { locale: ar } : undefined,
                        )}
                      </p>
                      <h3 className="font-bold">
                        {tr("طلب", "Order")} #{order.id}
                      </h3>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${config.bg} ${config.color}`}
                    >
                      <StatusIcon className="w-3.5 h-3.5" />
                      {config.label}
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground mb-3 line-clamp-1">
                    {order.items
                      .map((i) =>
                        lang === "en"
                          ? i.productName || i.productNameAr
                          : i.productNameAr,
                      )
                      .join(tr("، ", ", "))}
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {order.items.length} {tr("منتجات", "items")}
                    </span>
                    <span className="font-bold text-primary">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center mx-auto mb-4 border border-border shadow-sm">
              <Package className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-bold text-lg mb-1">
              {tr("لا توجد طلبات", "No orders yet")}
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              {tr(
                "لم تقم بإجراء أي طلبات حتى الآن.",
                "You haven't placed any orders yet.",
              )}
            </p>
            <Link href="/" className="text-primary font-bold">
              {tr("تصفح المنتجات", "Browse products")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
